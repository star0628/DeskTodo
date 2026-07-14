import { LocalDateKey } from "../domain/todoTypes";

export function getIsoTimestamp(): string {
  return new Date().toISOString();
}

export function toLocalDateKey(date = new Date()): LocalDateKey {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function localDateKeyToDate(value: LocalDateKey): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

export function localDateKeyFromIso(timestamp: string): LocalDateKey | null {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? null : toLocalDateKey(date);
}

export function isLocalDateKey(value: unknown): value is LocalDateKey {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day, 12);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

export function addLocalDays(value: LocalDateKey, amount: number): LocalDateKey {
  const date = localDateKeyToDate(value);
  date.setDate(date.getDate() + amount);
  return toLocalDateKey(date);
}

export function formatLocalDateLabel(value: LocalDateKey, today: LocalDateKey): string {
  if (value === today) {
    const [, month, day] = value.split("-").map(Number);
    return `今天 ${month}月${day}日`;
  }

  const [year, month, day] = value.split("-").map(Number);
  const weekday = new Intl.DateTimeFormat("zh-CN", { weekday: "short" }).format(
    new Date(year, month - 1, day, 12)
  );
  const currentYear = Number(today.slice(0, 4));
  const dateLabel = year === currentYear ? `${month}月${day}日` : `${year}年${month}月${day}日`;
  return `${dateLabel} ${weekday}`;
}

export function millisecondsUntilNextLocalDay(date = new Date()): number {
  const nextDay = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + 1,
    0,
    0,
    1
  );
  return Math.max(1, nextDay.getTime() - date.getTime());
}
