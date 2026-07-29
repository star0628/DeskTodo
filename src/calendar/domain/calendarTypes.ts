import type { LocalDateKey } from "../../domain/todoTypes";

export const CALENDAR_STATE_SCHEMA_VERSION = 2 as const;
export const MAX_CALENDAR_SOURCES = 8;
export const MAX_CALENDAR_EVENTS_PER_SOURCE = 10_000;
export const MAX_CALENDAR_SOURCE_NAME_LENGTH = 80;
export const CALENDAR_SOURCE_COLORS = [
  "#4da3ff",
  "#2dd4bf",
  "#f4c95d",
  "#fb7185",
  "#a78bfa",
  "#84cc16",
  "#fb923c",
  "#60a5fa",
] as const;

export type CalendarSourcePaletteColor = (typeof CALENDAR_SOURCE_COLORS)[number];

export function isCalendarSourcePaletteColor(
  value: unknown,
): value is CalendarSourcePaletteColor {
  return (
    typeof value === "string" &&
    CALENDAR_SOURCE_COLORS.includes(value as CalendarSourcePaletteColor)
  );
}

export function normalizeCalendarSourceName(value: string): string {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .replace(/\s+/gu, " ")
    .slice(0, MAX_CALENDAR_SOURCE_NAME_LENGTH);
}

export type AppleCalendarRegion = "global" | "chinaMainland";
export type AppleCalendarFeedKind = "published" | "holiday";
export type CalendarSyncState = "idle" | "syncing" | "stale" | "invalid";

export type CalendarEventTime =
  | {
      kind: "allDay";
      startOn: LocalDateKey;
      endExclusiveOn: LocalDateKey;
    }
  | {
      kind: "timed";
      startsAt: string;
      endsAt: string;
      timeZone: string | null;
    };

export interface CalendarEvent {
  id: string;
  sourceId: string;
  uid: string;
  recurrenceId: string | null;
  title: string;
  location: string;
  description: string;
  time: CalendarEventTime;
}

export interface CalendarSource {
  id: string;
  name: string;
  color: string;
  region: AppleCalendarRegion;
  kind: AppleCalendarFeedKind;
  etag: string | null;
  lastModified: string | null;
  syncState: CalendarSyncState;
  activeGeneration: number;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  failureCount: number;
  nextRetryAt: string | null;
  errorCode: string | null;
}

export interface CalendarState {
  schemaVersion: typeof CALENDAR_STATE_SCHEMA_VERSION;
  sources: CalendarSource[];
  snapshotsBySource: Record<string, CalendarEvent[]>;
}
