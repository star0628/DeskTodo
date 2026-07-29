import ICAL from "ical.js";
import type { LocalDateKey } from "../../domain/todoTypes";
import {
  addLocalDays,
  localDateKeyToDate,
  toLocalDateKey
} from "../../utils/date";
import {
  CalendarEvent,
  MAX_CALENDAR_EVENTS_PER_SOURCE
} from "./calendarTypes";

const MAX_ICS_TEXT_LENGTH = 5 * 1024 * 1024;
const MAX_RAW_EVENT_COMPONENTS = 10_000;
const MAX_RECURRENCE_ITERATIONS = 100_000;
const MAX_TITLE_LENGTH = 512;
const MAX_LOCATION_LENGTH = 512;
const MAX_DESCRIPTION_LENGTH = 4096;

export interface CalendarParseOptions {
  sourceId: string;
  rangeStart: LocalDateKey;
  rangeEndExclusive: LocalDateKey;
}

export interface ParsedCalendarFeed {
  events: CalendarEvent[];
  suggestedName: string | null;
}

export class CalendarParseError extends Error {
  constructor(public readonly code: string) {
    super("无法解析 Apple 日历内容。");
    this.name = "CalendarParseError";
  }
}

export function parseCalendarFeed(
  content: string,
  options: CalendarParseOptions
): ParsedCalendarFeed {
  if (
    content.length === 0 ||
    content.length > MAX_ICS_TEXT_LENGTH ||
    options.rangeStart >= options.rangeEndExclusive
  ) {
    throw new CalendarParseError("calendar_format_invalid");
  }

  try {
    ICAL.TimezoneService.reset();
    const calendar = new ICAL.Component(ICAL.parse(content));
    registerEmbeddedTimezones(calendar);
    const components = calendar.getAllSubcomponents("vevent");
    if (components.length > MAX_RAW_EVENT_COMPONENTS) {
      throw new CalendarParseError("calendar_event_limit");
    }

    const events: CalendarEvent[] = [];
    const groups = groupEventComponents(components);
    for (const group of groups.values()) {
      appendEventGroup(events, group, options);
      if (events.length > MAX_CALENDAR_EVENTS_PER_SOURCE) {
        throw new CalendarParseError("calendar_event_limit");
      }
    }

    const deduplicated = new Map(events.map((event) => [event.id, event]));
    return {
      events: Array.from(deduplicated.values()).sort(compareEvents),
      suggestedName: getSuggestedName(calendar)
    };
  } catch (error) {
    if (error instanceof CalendarParseError) throw error;
    throw new CalendarParseError("calendar_format_invalid");
  } finally {
    ICAL.TimezoneService.reset();
  }
}

function registerEmbeddedTimezones(calendar: InstanceType<typeof ICAL.Component>) {
  for (const component of calendar.getAllSubcomponents("vtimezone")) {
    try {
      ICAL.TimezoneService.register(component);
    } catch {
      throw new CalendarParseError("calendar_timezone_invalid");
    }
  }
}

function groupEventComponents(
  components: InstanceType<typeof ICAL.Component>[]
): Map<string, InstanceType<typeof ICAL.Component>[]> {
  const groups = new Map<string, InstanceType<typeof ICAL.Component>[]>();
  for (const component of components) {
    const uid = boundedText(component.getFirstPropertyValue("uid"), 255);
    if (!uid) continue;
    const group = groups.get(uid) ?? [];
    group.push(component);
    groups.set(uid, group);
  }
  return groups;
}

function appendEventGroup(
  output: CalendarEvent[],
  components: InstanceType<typeof ICAL.Component>[],
  options: CalendarParseOptions
) {
  const masterComponent = components.find(
    (component) => component.getFirstProperty("recurrence-id") === null
  );
  if (!masterComponent) {
    for (const component of components) {
      const event = new ICAL.Event(component);
      appendSingleEvent(output, event, options, true);
    }
    return;
  }

  const exceptions = components.filter((component) => component !== masterComponent);
  const event = new ICAL.Event(masterComponent, { exceptions });
  if (isCancelled(event.component)) return;
  if (!event.isRecurring()) {
    appendSingleEvent(output, event, options, false);
    return;
  }

  const rangeStart = localDateKeyToDate(options.rangeStart);
  rangeStart.setHours(0, 0, 0, 0);
  const rangeEnd = localDateKeyToDate(options.rangeEndExclusive);
  rangeEnd.setHours(0, 0, 0, 0);
  const iterator = event.iterator();
  const iterationEnd = getRecurrenceIterationEnd(rangeEnd, exceptions);
  let completed = false;

  for (let index = 0; index < MAX_RECURRENCE_ITERATIONS; index += 1) {
    const occurrence = iterator.next();
    if (!occurrence) {
      completed = true;
      break;
    }
    const originalStart = occurrence.toJSDate();
    if (Number.isNaN(originalStart.getTime())) {
      throw new CalendarParseError("calendar_time_invalid");
    }
    if (originalStart.getTime() >= iterationEnd.getTime()) {
      completed = true;
      break;
    }
    const details = event.getOccurrenceDetails(occurrence);
    const start = details.startDate.toJSDate();
    const end = details.endDate.toJSDate();
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new CalendarParseError("calendar_time_invalid");
    }
    if (isCancelled(details.item.component)) continue;
    const parsed = normalizeEvent(
      details.item,
      details.startDate,
      details.endDate,
      details.recurrenceId,
      options.sourceId
    );
    if (eventInRange(parsed, options.rangeStart, options.rangeEndExclusive)) {
      output.push(parsed);
      if (output.length > MAX_CALENDAR_EVENTS_PER_SOURCE) {
        throw new CalendarParseError("calendar_event_limit");
      }
    }
  }
  if (!completed) {
    throw new CalendarParseError("calendar_recurrence_limit");
  }
}

function getRecurrenceIterationEnd(
  rangeEnd: Date,
  exceptions: InstanceType<typeof ICAL.Component>[]
): Date {
  let maximumBackwardShift = 0;
  for (const component of exceptions) {
    const exception = new ICAL.Event(component);
    const recurrenceId = exception.recurrenceId?.toJSDate();
    const exceptionStart = exception.startDate?.toJSDate();
    if (
      !recurrenceId ||
      !exceptionStart ||
      Number.isNaN(recurrenceId.getTime()) ||
      Number.isNaN(exceptionStart.getTime())
    ) {
      continue;
    }
    maximumBackwardShift = Math.max(
      maximumBackwardShift,
      recurrenceId.getTime() - exceptionStart.getTime()
    );
  }
  return new Date(rangeEnd.getTime() + maximumBackwardShift);
}

function appendSingleEvent(
  output: CalendarEvent[],
  event: InstanceType<typeof ICAL.Event>,
  options: CalendarParseOptions,
  useRecurrenceId: boolean
) {
  if (isCancelled(event.component)) return;
  const parsed = normalizeEvent(
    event,
    event.startDate,
    event.endDate,
    useRecurrenceId ? event.recurrenceId : null,
    options.sourceId
  );
  if (eventInRange(parsed, options.rangeStart, options.rangeEndExclusive)) {
    output.push(parsed);
  }
}

function normalizeEvent(
  event: InstanceType<typeof ICAL.Event>,
  start: InstanceType<typeof ICAL.Time>,
  end: InstanceType<typeof ICAL.Time>,
  recurrence: InstanceType<typeof ICAL.Time> | null,
  sourceId: string
): CalendarEvent {
  const uid = boundedText(event.uid, 255);
  if (!uid) throw new CalendarParseError("calendar_uid_missing");
  const recurrenceId = recurrence ? boundedText(recurrence.toICALString(), 255) : null;
  const title = boundedText(event.summary, MAX_TITLE_LENGTH) || "未命名日程";
  const location = boundedText(event.location, MAX_LOCATION_LENGTH);
  const description = boundedText(event.description, MAX_DESCRIPTION_LENGTH);
  const identity = `${uid}\u0000${recurrenceId ?? "master"}`;

  if (start.isDate) {
    const startOn = icalDateToLocalDateKey(start);
    let endExclusiveOn = end.isDate
      ? icalDateToLocalDateKey(end)
      : addLocalDays(startOn, 1);
    if (endExclusiveOn <= startOn) endExclusiveOn = addLocalDays(startOn, 1);
    return {
      id: `calendar-${sourceId}-${stableIdentityHash(identity)}`,
      sourceId,
      uid,
      recurrenceId,
      title,
      location,
      description,
      time: { kind: "allDay", startOn, endExclusiveOn }
    };
  }

  const startDate = start.toJSDate();
  const endDate = end.toJSDate();
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new CalendarParseError("calendar_time_invalid");
  }
  if (endDate.getTime() < startDate.getTime()) {
    throw new CalendarParseError("calendar_time_invalid");
  }
  const timeZone =
    start.zone?.tzid && !["floating", "local"].includes(start.zone.tzid)
      ? boundedText(start.zone.tzid, 128)
      : null;
  return {
    id: `calendar-${sourceId}-${stableIdentityHash(identity)}`,
    sourceId,
    uid,
    recurrenceId,
    title,
    location,
    description,
    time: {
      kind: "timed",
      startsAt: startDate.toISOString(),
      endsAt: endDate.toISOString(),
      timeZone
    }
  };
}

function eventInRange(
  event: CalendarEvent,
  rangeStart: LocalDateKey,
  rangeEndExclusive: LocalDateKey
): boolean {
  if (event.time.kind === "allDay") {
    return (
      event.time.startOn < rangeEndExclusive &&
      event.time.endExclusiveOn > rangeStart
    );
  }
  const startBoundary = localDateKeyToDate(rangeStart);
  startBoundary.setHours(0, 0, 0, 0);
  const endBoundary = localDateKeyToDate(rangeEndExclusive);
  endBoundary.setHours(0, 0, 0, 0);
  const start = new Date(event.time.startsAt).getTime();
  const end = new Date(event.time.endsAt).getTime();
  if (end <= start) {
    return start >= startBoundary.getTime() && start < endBoundary.getTime();
  }
  return start < endBoundary.getTime() && end > startBoundary.getTime();
}

function icalDateToLocalDateKey(time: InstanceType<typeof ICAL.Time>): LocalDateKey {
  const value = `${String(time.year).padStart(4, "0")}-${String(time.month).padStart(
    2,
    "0"
  )}-${String(time.day).padStart(2, "0")}`;
  const date = localDateKeyToDate(value);
  if (toLocalDateKey(date) !== value) {
    throw new CalendarParseError("calendar_date_invalid");
  }
  return value;
}

function isCancelled(component: InstanceType<typeof ICAL.Component>): boolean {
  return (
    String(component.getFirstPropertyValue("status") ?? "").toUpperCase() ===
    "CANCELLED"
  );
}

function getSuggestedName(
  calendar: InstanceType<typeof ICAL.Component>
): string | null {
  const value =
    boundedText(calendar.getFirstPropertyValue("x-wr-calname"), 80) ||
    boundedText(calendar.getFirstPropertyValue("name"), 80);
  return value || null;
}

function boundedText(value: unknown, maximum: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maximum);
}

function stableIdentityHash(value: string): string {
  const seeds = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35];
  const hashes = seeds.map((seed) => {
    let hash = seed >>> 0;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, "0");
  });
  return hashes.join("");
}

function compareEvents(left: CalendarEvent, right: CalendarEvent): number {
  if (left.time.kind !== right.time.kind) return left.time.kind === "allDay" ? -1 : 1;
  const leftStart =
    left.time.kind === "allDay" ? left.time.startOn : left.time.startsAt;
  const rightStart =
    right.time.kind === "allDay" ? right.time.startOn : right.time.startsAt;
  return (
    leftStart.localeCompare(rightStart) ||
    left.title.localeCompare(right.title, "zh-CN")
  );
}
