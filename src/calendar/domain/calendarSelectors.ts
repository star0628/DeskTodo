import type { LocalDateKey } from "../../domain/todoTypes";
import {
  addLocalDays,
  localDateKeyToDate,
  toLocalDateKey
} from "../../utils/date";
import type { CalendarEvent, CalendarState } from "./calendarTypes";

export function getCalendarEventsForDate(
  state: CalendarState,
  date: LocalDateKey
): CalendarEvent[] {
  return Object.values(state.snapshotsBySource)
    .flat()
    .filter((event) => eventIntersectsDate(event, date))
    .sort(compareCalendarEvents);
}

export function getCalendarEventCountByDate(
  state: CalendarState
): ReadonlyMap<LocalDateKey, number> {
  const counts = new Map<LocalDateKey, number>();
  for (const event of Object.values(state.snapshotsBySource).flat()) {
    for (const date of getIntersectingDateKeys(event)) {
      counts.set(date, (counts.get(date) ?? 0) + 1);
    }
  }
  return counts;
}

export function eventIntersectsDate(event: CalendarEvent, date: LocalDateKey): boolean {
  if (event.time.kind === "allDay") {
    return event.time.startOn <= date && date < event.time.endExclusiveOn;
  }

  const dayStart = localDateKeyToDate(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = localDateKeyToDate(addLocalDays(date, 1));
  dayEnd.setHours(0, 0, 0, 0);
  const startsAt = new Date(event.time.startsAt).getTime();
  const endsAt = new Date(event.time.endsAt).getTime();
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt)) return false;
  if (endsAt <= startsAt) {
    return startsAt >= dayStart.getTime() && startsAt < dayEnd.getTime();
  }
  return startsAt < dayEnd.getTime() && endsAt > dayStart.getTime();
}

function getIntersectingDateKeys(event: CalendarEvent): LocalDateKey[] {
  if (event.time.kind === "allDay") {
    const dates: LocalDateKey[] = [];
    let current = event.time.startOn;
    for (let index = 0; current < event.time.endExclusiveOn && index < 400; index += 1) {
      dates.push(current);
      current = addLocalDays(current, 1);
    }
    return dates;
  }

  const start = new Date(event.time.startsAt);
  const end = new Date(event.time.endsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
  const effectiveEnd = end.getTime() > start.getTime() ? new Date(end.getTime() - 1) : start;
  const first = toLocalDateKey(start);
  const last = toLocalDateKey(effectiveEnd);
  const dates: LocalDateKey[] = [];
  let current = first;
  for (let index = 0; current <= last && index < 400; index += 1) {
    dates.push(current);
    current = addLocalDays(current, 1);
  }
  return dates;
}

function compareCalendarEvents(left: CalendarEvent, right: CalendarEvent): number {
  if (left.time.kind !== right.time.kind) return left.time.kind === "allDay" ? -1 : 1;
  if (left.time.kind === "allDay" && right.time.kind === "allDay") {
    return (
      left.time.startOn.localeCompare(right.time.startOn) ||
      left.title.localeCompare(right.title, "zh-CN")
    );
  }
  if (left.time.kind === "timed" && right.time.kind === "timed") {
    return (
      left.time.startsAt.localeCompare(right.time.startsAt) ||
      left.title.localeCompare(right.title, "zh-CN")
    );
  }
  return 0;
}

