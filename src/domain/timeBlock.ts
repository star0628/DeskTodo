import {
  LocalDateKey,
  TodoTimeBlock,
  TodoTimeBlockPattern
} from "./todoTypes";
import {
  addLocalDays,
  isLocalDateKey,
  localDateKeyToDate,
  toLocalDateKey
} from "../utils/date";
import {
  deadlineToLocalParts,
  isValidDeadlineInstant,
  isValidLocalTime,
  localDeadlineToIso
} from "./deadline";

export const MAX_TIME_BLOCK_DAY_SPAN = 366;

export function isValidTodoTimeBlock(value: unknown): value is TodoTimeBlock {
  if (!isRecord(value)) return false;
  if (value.kind === "allDay") {
    return (
      isLocalDateKey(value.startOn) &&
      isLocalDateKey(value.endExclusiveOn) &&
      value.startOn < value.endExclusiveOn &&
      differenceInCalendarDays(value.startOn, value.endExclusiveOn) <=
        MAX_TIME_BLOCK_DAY_SPAN
    );
  }
  if (
    value.kind !== "timed" ||
    !isValidDeadlineInstant(value.startsAt) ||
    !isValidDeadlineInstant(value.endsAt)
  ) {
    return false;
  }
  const duration =
    new Date(value.endsAt).getTime() - new Date(value.startsAt).getTime();
  return duration >= 0 && duration <= MAX_TIME_BLOCK_DAY_SPAN * 86_400_000;
}

export function isValidTodoTimeBlockPattern(
  value: unknown
): value is TodoTimeBlockPattern {
  if (!isRecord(value)) return false;
  if (value.kind === "allDay") {
    return (
      isBoundedDayOffset(value.startDayOffset) &&
      Number.isInteger(value.durationDays) &&
      typeof value.durationDays === "number" &&
      value.durationDays >= 1 &&
      value.durationDays <= MAX_TIME_BLOCK_DAY_SPAN
    );
  }
  return (
    value.kind === "timed" &&
    isBoundedDayOffset(value.startDayOffset) &&
    isValidLocalTime(value.startLocalTime) &&
    isBoundedDayOffset(value.endDayOffset) &&
    isValidLocalTime(value.endLocalTime) &&
    (value.endDayOffset > value.startDayOffset ||
      (value.endDayOffset === value.startDayOffset &&
        value.endLocalTime >= value.startLocalTime))
  );
}

export function createTodoTimeBlockPattern(
  block: TodoTimeBlock | null,
  baseDate: LocalDateKey
): TodoTimeBlockPattern | null {
  if (block === null || !isValidTodoTimeBlock(block) || !isLocalDateKey(baseDate)) {
    return null;
  }
  if (block.kind === "allDay") {
    const startDayOffset = differenceInCalendarDays(baseDate, block.startOn);
    const durationDays = differenceInCalendarDays(
      block.startOn,
      block.endExclusiveOn
    );
    const pattern = { kind: "allDay", startDayOffset, durationDays } as const;
    return isValidTodoTimeBlockPattern(pattern) ? pattern : null;
  }
  const start = deadlineToLocalParts(block.startsAt);
  const end = deadlineToLocalParts(block.endsAt);
  if (!start || !end) return null;
  const pattern = {
    kind: "timed",
    startDayOffset: differenceInCalendarDays(baseDate, start.date),
    startLocalTime: start.time,
    endDayOffset: differenceInCalendarDays(baseDate, end.date),
    endLocalTime: end.time
  } as const;
  return isValidTodoTimeBlockPattern(pattern) ? pattern : null;
}

export function materializeTodoTimeBlock(
  pattern: TodoTimeBlockPattern | null,
  scheduledFor: LocalDateKey
): TodoTimeBlock | null {
  if (
    pattern === null ||
    !isValidTodoTimeBlockPattern(pattern) ||
    !isLocalDateKey(scheduledFor)
  ) {
    return null;
  }
  if (pattern.kind === "allDay") {
    const startOn = addLocalDays(scheduledFor, pattern.startDayOffset);
    return {
      kind: "allDay",
      startOn,
      endExclusiveOn: addLocalDays(startOn, pattern.durationDays)
    };
  }
  const startsAt = localDeadlineToIso(
    addLocalDays(scheduledFor, pattern.startDayOffset),
    pattern.startLocalTime
  );
  const endsAt = localDeadlineToIso(
    addLocalDays(scheduledFor, pattern.endDayOffset),
    pattern.endLocalTime
  );
  if (!startsAt || !endsAt) return null;
  const block: TodoTimeBlock = { kind: "timed", startsAt, endsAt };
  return isValidTodoTimeBlock(block) ? block : null;
}

export function getTodoTimeBlockAnchorDate(
  block: TodoTimeBlock
): LocalDateKey {
  return block.kind === "allDay"
    ? block.startOn
    : toLocalDateKey(new Date(block.startsAt));
}

export function todoTimeBlockIntersectsDate(
  block: TodoTimeBlock,
  dateKey: LocalDateKey
): boolean {
  if (!isValidTodoTimeBlock(block) || !isLocalDateKey(dateKey)) return false;
  if (block.kind === "allDay") {
    return block.startOn <= dateKey && block.endExclusiveOn > dateKey;
  }
  const dayStart = localDateKeyToDate(dateKey);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  const startsAt = new Date(block.startsAt).getTime();
  const endsAt = new Date(block.endsAt).getTime();
  return endsAt === startsAt
    ? startsAt >= dayStart.getTime() && startsAt < dayEnd.getTime()
    : startsAt < dayEnd.getTime() && endsAt > dayStart.getTime();
}

function differenceInCalendarDays(
  from: LocalDateKey,
  to: LocalDateKey
): number {
  const fromDate = localDateKeyToDate(from);
  const toDate = localDateKeyToDate(to);
  return Math.round(
    (Date.UTC(toDate.getFullYear(), toDate.getMonth(), toDate.getDate()) -
      Date.UTC(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate())) /
      86_400_000
  );
}

function isBoundedDayOffset(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= -MAX_TIME_BLOCK_DAY_SPAN &&
    value <= MAX_TIME_BLOCK_DAY_SPAN
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
