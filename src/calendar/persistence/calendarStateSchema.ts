import { isLocalDateKey } from "../../utils/date";
import {
  CALENDAR_STATE_SCHEMA_VERSION,
  CalendarEvent,
  CalendarSource,
  CalendarState,
  MAX_CALENDAR_EVENTS_PER_SOURCE,
  MAX_CALENDAR_SOURCES
} from "../domain/calendarTypes";
import type { LoadCalendarStateResult } from "./calendarStateRepository";

export function fallbackCalendarState(): CalendarState {
  return {
    schemaVersion: CALENDAR_STATE_SCHEMA_VERSION,
    sources: [],
    snapshotsBySource: {}
  };
}

export function parseCalendarState(value: unknown): LoadCalendarStateResult {
  if (value === undefined || value === null) {
    return { state: fallbackCalendarState(), status: "missing" };
  }
  if (isCalendarState(value)) {
    return {
      state: normalizeHydratedState(value),
      status: "ok"
    };
  }
  const migrated = migrateV1CalendarState(value);
  return migrated
    ? { state: normalizeHydratedState(migrated), status: "migrated" }
    : { state: fallbackCalendarState(), status: "invalid" };
}

export function isCalendarState(value: unknown): value is CalendarState {
  if (!isRecord(value) || value.schemaVersion !== CALENDAR_STATE_SCHEMA_VERSION) {
    return false;
  }
  if (
    !Array.isArray(value.sources) ||
    value.sources.length > MAX_CALENDAR_SOURCES ||
    !isRecord(value.snapshotsBySource)
  ) {
    return false;
  }
  if (!value.sources.every(isCalendarSource)) return false;
  const sourceIds = new Set(value.sources.map((source) => source.id));
  if (sourceIds.size !== value.sources.length) return false;
  const snapshotEntries = Object.entries(value.snapshotsBySource);
  if (snapshotEntries.some(([sourceId]) => !sourceIds.has(sourceId))) return false;
  return snapshotEntries.every(
    ([sourceId, events]) =>
      Array.isArray(events) &&
      events.length <= MAX_CALENDAR_EVENTS_PER_SOURCE &&
      events.every((event) => isCalendarEvent(event) && event.sourceId === sourceId)
  );
}

function isCalendarSource(value: unknown): value is CalendarSource {
  if (!isRecord(value) || "url" in value || "feedUrl" in value) return false;
  return (
    isSafeId(value.id) &&
    isBoundedString(value.name, 1, 80) &&
    typeof value.color === "string" &&
    /^#[0-9a-f]{6}$/i.test(value.color) &&
    (value.region === "global" || value.region === "chinaMainland") &&
    (value.kind === "published" || value.kind === "holiday") &&
    isNullableBoundedString(value.etag, 1024) &&
    isNullableBoundedString(value.lastModified, 1024) &&
    ["idle", "syncing", "stale", "invalid"].includes(String(value.syncState)) &&
    isNonNegativeInteger(value.activeGeneration) &&
    isNullableIso(value.lastAttemptAt) &&
    isNullableIso(value.lastSuccessAt) &&
    isNonNegativeInteger(value.failureCount) &&
    isNullableIso(value.nextRetryAt) &&
    isNullableBoundedString(value.errorCode, 128)
  );
}

type CalendarSourceV1 = Omit<CalendarSource, "kind">;

function migrateV1CalendarState(value: unknown): CalendarState | null {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !Array.isArray(value.sources) ||
    value.sources.length > MAX_CALENDAR_SOURCES ||
    !value.sources.every(isCalendarSourceV1) ||
    !isRecord(value.snapshotsBySource)
  ) {
    return null;
  }
  const migrated: CalendarState = {
    schemaVersion: CALENDAR_STATE_SCHEMA_VERSION,
    sources: value.sources.map((source) => ({ ...source, kind: "published" })),
    snapshotsBySource: value.snapshotsBySource as Record<string, CalendarEvent[]>
  };
  return isCalendarState(migrated) ? migrated : null;
}

function isCalendarSourceV1(value: unknown): value is CalendarSourceV1 {
  return isRecord(value) && !("kind" in value) && isCalendarSource({
    ...value,
    kind: "published"
  });
}

function normalizeHydratedState(state: CalendarState): CalendarState {
  return {
    ...state,
    sources: state.sources.map((source) =>
      source.syncState === "syncing"
        ? { ...source, syncState: source.lastSuccessAt ? "stale" : "idle" }
        : source
    )
  };
}

function isCalendarEvent(value: unknown): value is CalendarEvent {
  if (!isRecord(value) || !isRecord(value.time)) return false;
  const commonValid =
    isBoundedString(value.id, 1, 512) &&
    isSafeId(value.sourceId) &&
    isBoundedString(value.uid, 1, 255) &&
    isNullableBoundedString(value.recurrenceId, 255) &&
    isBoundedString(value.title, 1, 512) &&
    isBoundedString(value.location, 0, 512) &&
    isBoundedString(value.description, 0, 4096);
  if (!commonValid) return false;

  if (value.time.kind === "allDay") {
    return (
      isLocalDateKey(value.time.startOn) &&
      isLocalDateKey(value.time.endExclusiveOn) &&
      value.time.startOn < value.time.endExclusiveOn
    );
  }
  return (
    value.time.kind === "timed" &&
    isIso(value.time.startsAt) &&
    isIso(value.time.endsAt) &&
    new Date(value.time.endsAt).getTime() >= new Date(value.time.startsAt).getTime() &&
    (value.time.timeZone === null ||
      isBoundedString(value.time.timeZone, 1, 128))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSafeId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 64 &&
    /^[a-zA-Z0-9_-]+$/.test(value)
  );
}

function isBoundedString(
  value: unknown,
  minimum: number,
  maximum: number
): value is string {
  return typeof value === "string" && value.length >= minimum && value.length <= maximum;
}

function isNullableBoundedString(value: unknown, maximum: number): value is string | null {
  return value === null || isBoundedString(value, 1, maximum);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isIso(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

function isNullableIso(value: unknown): value is string | null {
  return value === null || isIso(value);
}
