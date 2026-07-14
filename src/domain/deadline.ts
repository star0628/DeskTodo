import { addLocalDays, isLocalDateKey, toLocalDateKey } from "../utils/date";
import { DeadlineDisplayMode, DeadlinePattern, LocalDateKey } from "./todoTypes";

export const DEADLINE_SECOND_COUNTDOWN_MS = 30 * 60 * 1000;
export const MAX_DEADLINE_DAY_OFFSET = 366;

export type DeadlineUrgency = "normal" | "soon" | "critical" | "overdue" | "completed";

export interface DeadlineDisplay {
  dateLabel: string;
  countdownLabel: string | null;
  urgency: DeadlineUrgency;
  usesSeconds: boolean;
}

export function isDeadlineDisplayMode(value: unknown): value is DeadlineDisplayMode {
  return value === "countdown" || value === "dateTime";
}

export function isValidDeadlineInstant(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}

export function isValidLocalTime(value: unknown): value is string {
  return typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function isValidDeadlinePattern(value: unknown): value is DeadlinePattern {
  if (typeof value !== "object" || value === null) return false;
  const pattern = value as Partial<DeadlinePattern>;
  return (
    typeof pattern.dayOffset === "number" &&
    Number.isInteger(pattern.dayOffset) &&
    pattern.dayOffset >= 0 &&
    pattern.dayOffset <= MAX_DEADLINE_DAY_OFFSET &&
    isValidLocalTime(pattern.localTime)
  );
}

export function localDeadlineToIso(
  dateKey: LocalDateKey,
  localTime: string
): string | null {
  if (!isLocalDateKey(dateKey) || !isValidLocalTime(localTime)) return null;
  const [year, month, day] = dateKey.split("-").map(Number);
  const [hour, minute] = localTime.split(":").map(Number);
  const date = new Date(year, month - 1, day, hour, minute, 0, 0);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute
  ) {
    return null;
  }

  return date.toISOString();
}

export function deadlineToLocalParts(
  deadlineAt: string
): { date: LocalDateKey; time: string } | null {
  if (!isValidDeadlineInstant(deadlineAt)) return null;
  const date = new Date(deadlineAt);
  return {
    date: toLocalDateKey(date),
    time: `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
  };
}

export function createDeadlinePattern(
  deadlineAt: string | null,
  baseDate: LocalDateKey
): DeadlinePattern | null {
  if (deadlineAt === null || !isLocalDateKey(baseDate)) return null;
  const parts = deadlineToLocalParts(deadlineAt);
  if (!parts) return null;
  const dayOffset = differenceInCalendarDays(baseDate, parts.date);
  if (dayOffset < 0 || dayOffset > MAX_DEADLINE_DAY_OFFSET) return null;
  return { dayOffset, localTime: parts.time };
}

export function materializeDeadlineAt(
  pattern: DeadlinePattern | null,
  scheduledFor: LocalDateKey
): string | null {
  if (pattern === null || !isValidDeadlinePattern(pattern)) return null;
  return localDeadlineToIso(addLocalDays(scheduledFor, pattern.dayOffset), pattern.localTime);
}

export function getDeadlineDisplay(
  deadlineAt: string,
  nowMs: number,
  done: boolean
): DeadlineDisplay | null {
  if (!isValidDeadlineInstant(deadlineAt) || !Number.isFinite(nowMs)) return null;
  const deadlineMs = new Date(deadlineAt).getTime();
  const dateLabel = formatDeadlineDateLabel(deadlineAt, nowMs);

  if (done) {
    return { dateLabel, countdownLabel: null, urgency: "completed", usesSeconds: false };
  }

  const deltaMs = deadlineMs - nowMs;
  if (deltaMs <= 0) {
    return {
      dateLabel,
      countdownLabel: formatOverdue(Math.abs(deltaMs)),
      urgency: "overdue",
      usesSeconds: false
    };
  }

  if (deltaMs < DEADLINE_SECOND_COUNTDOWN_MS) {
    return {
      dateLabel,
      countdownLabel: formatSecondCountdown(deltaMs),
      urgency: "critical",
      usesSeconds: true
    };
  }

  return {
    dateLabel,
    countdownLabel: formatMinuteCountdown(deltaMs),
    urgency: deltaMs <= 24 * 60 * 60 * 1000 ? "soon" : "normal",
    usesSeconds: false
  };
}

export function getDeadlineVisibleLabel(
  display: DeadlineDisplay,
  mode: DeadlineDisplayMode
): string {
  if (display.urgency === "completed") return display.dateLabel;
  if (mode === "dateTime") {
    return display.urgency === "overdue"
      ? `已逾期 · ${display.dateLabel}`
      : display.dateLabel;
  }
  return display.countdownLabel ?? display.dateLabel;
}

export function getDeadlineRefreshDelay(
  deadlineValues: readonly string[],
  nowMs: number
): number {
  const deltas = deadlineValues
    .filter(isValidDeadlineInstant)
    .map((value) => new Date(value).getTime() - nowMs)
    .filter((delta) => delta > 0);
  const nearest = deltas.length > 0 ? Math.min(...deltas) : Number.POSITIVE_INFINITY;

  if (nearest < DEADLINE_SECOND_COUNTDOWN_MS) {
    return Math.max(50, 1000 - (nowMs % 1000));
  }

  const minuteBoundary = Math.max(50, 60_000 - (nowMs % 60_000));
  if (Number.isFinite(nearest)) {
    const criticalBoundary = nearest - DEADLINE_SECOND_COUNTDOWN_MS + 1;
    if (criticalBoundary > 0) return Math.min(minuteBoundary, criticalBoundary);
  }
  return minuteBoundary;
}

function formatDeadlineDateLabel(deadlineAt: string, nowMs: number): string {
  const deadline = new Date(deadlineAt);
  const deadlineDate = toLocalDateKey(deadline);
  const today = toLocalDateKey(new Date(nowMs));
  const tomorrow = addLocalDays(today, 1);
  const time = `${pad2(deadline.getHours())}:${pad2(deadline.getMinutes())}`;

  if (deadlineDate === today) return `今天 ${time}`;
  if (deadlineDate === tomorrow) return `明天 ${time}`;

  const year = deadline.getFullYear();
  const currentYear = new Date(nowMs).getFullYear();
  const date = `${deadline.getMonth() + 1}月${deadline.getDate()}日`;
  return `${year === currentYear ? date : `${year}年${date}`} ${time}`;
}

function formatSecondCountdown(deltaMs: number): string {
  const totalSeconds = Math.max(1, Math.ceil(deltaMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `剩 ${minutes}:${pad2(seconds)}`;
}

function formatMinuteCountdown(deltaMs: number): string {
  const totalMinutes = Math.max(1, Math.ceil(deltaMs / 60_000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `剩 ${days}天${hours > 0 ? `${hours}小时` : ""}`;
  if (hours > 0) return `剩 ${hours}小时${minutes > 0 ? `${minutes}分` : ""}`;
  return `剩 ${minutes}分钟`;
}

function formatOverdue(elapsedMs: number): string {
  const totalMinutes = Math.floor(elapsedMs / 60_000);
  if (totalMinutes < 1) return "刚刚超时";
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `已超时 ${days}天${hours > 0 ? `${hours}小时` : ""}`;
  if (hours > 0) return `已超时 ${hours}小时${minutes > 0 ? `${minutes}分` : ""}`;
  return `已超时 ${minutes}分钟`;
}

function differenceInCalendarDays(from: LocalDateKey, to: LocalDateKey): number {
  const [fromYear, fromMonth, fromDay] = from.split("-").map(Number);
  const [toYear, toMonth, toDay] = to.split("-").map(Number);
  return Math.round(
    (Date.UTC(toYear, toMonth - 1, toDay) - Date.UTC(fromYear, fromMonth - 1, fromDay)) /
      86_400_000
  );
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}
