import { describe, expect, it } from "vitest";
import { calendarReducer } from "./calendarReducer";
import type {
  CalendarEvent,
  CalendarSource,
  CalendarState
} from "./calendarTypes";

const SOURCE: CalendarSource = {
  id: "source-1",
  name: "工作",
  color: "#4da3ff",
  region: "chinaMainland",
  kind: "published",
  etag: null,
  lastModified: null,
  syncState: "idle",
  activeGeneration: 0,
  lastAttemptAt: null,
  lastSuccessAt: null,
  failureCount: 0,
  nextRetryAt: null,
  errorCode: null
};

const EVENT: CalendarEvent = {
  id: "calendar-source-1-event",
  sourceId: "source-1",
  uid: "event",
  recurrenceId: null,
  title: "项目会议",
  location: "",
  description: "",
  time: {
    kind: "allDay",
    startOn: "2026-07-29",
    endExclusiveOn: "2026-07-30"
  }
};

function state(): CalendarState {
  return {
    schemaVersion: 2,
    sources: [SOURCE],
    snapshotsBySource: { "source-1": [EVENT] }
  };
}

describe("calendarReducer", () => {
  it("returns the original reference for unknown sources and stale generations", () => {
    const current = state();
    expect(
      calendarReducer(current, {
        type: "removeCalendarSource",
        sourceId: "missing"
      })
    ).toBe(current);
    expect(
      calendarReducer(current, {
        type: "calendarSyncSucceeded",
        sourceId: "source-1",
        generation: 9,
        syncedAt: "2026-07-29T10:00:00.000Z",
        events: [],
        etag: null,
        lastModified: null
      })
    ).toBe(current);
  });

  it("ignores an older sync start after a newer generation has begun or settled", () => {
    const current: CalendarState = {
      ...state(),
      sources: [{ ...SOURCE, syncState: "idle", activeGeneration: 3 }]
    };

    const next = calendarReducer(current, {
      type: "calendarSyncStarted",
      sourceId: "source-1",
      generation: 2,
      attemptedAt: "2026-07-29T10:00:00.000Z"
    });

    expect(next).toBe(current);
  });

  it("atomically replaces only the matching source snapshot on success", () => {
    const started = calendarReducer(state(), {
      type: "calendarSyncStarted",
      sourceId: "source-1",
      generation: 1,
      attemptedAt: "2026-07-29T10:00:00.000Z"
    });
    const replacement = { ...EVENT, id: "replacement", title: "更新后的会议" };

    const next = calendarReducer(started, {
      type: "calendarSyncSucceeded",
      sourceId: "source-1",
      generation: 1,
      syncedAt: "2026-07-29T10:01:00.000Z",
      events: [replacement],
      etag: "\"v2\"",
      lastModified: "Wed, 29 Jul 2026 10:01:00 GMT"
    });

    expect(next.snapshotsBySource["source-1"]).toEqual([replacement]);
    expect(next.sources[0]).toMatchObject({
      syncState: "idle",
      failureCount: 0,
      etag: "\"v2\"",
      lastSuccessAt: "2026-07-29T10:01:00.000Z"
    });
  });

  it("keeps the last good snapshot when a sync fails", () => {
    const started = calendarReducer(state(), {
      type: "calendarSyncStarted",
      sourceId: "source-1",
      generation: 1,
      attemptedAt: "2026-07-29T10:00:00.000Z"
    });
    const snapshot = started.snapshotsBySource;

    const next = calendarReducer(started, {
      type: "calendarSyncFailed",
      sourceId: "source-1",
      generation: 1,
      attemptedAt: "2026-07-29T10:01:00.000Z",
      invalid: false,
      errorCode: "calendar_network_error",
      nextRetryAt: "2026-07-29T10:06:00.000Z"
    });

    expect(next.snapshotsBySource).toBe(snapshot);
    expect(next.sources[0]).toMatchObject({
      syncState: "stale",
      failureCount: 1,
      errorCode: "calendar_network_error"
    });
  });

  it("removes source metadata and its snapshot together", () => {
    const next = calendarReducer(state(), {
      type: "removeCalendarSource",
      sourceId: "source-1"
    });

    expect(next.sources).toEqual([]);
    expect(next.snapshotsBySource).toEqual({});
  });

  it("renames one source without replacing its event snapshot", () => {
    const current = state();
    const snapshot = current.snapshotsBySource;

    const next = calendarReducer(current, {
      type: "renameCalendarSource",
      sourceId: "source-1",
      name: "  Work \n Calendar  "
    });

    expect(next).not.toBe(current);
    expect(next.sources[0]).toEqual({ ...SOURCE, name: "Work Calendar" });
    expect(next.snapshotsBySource).toBe(snapshot);
  });

  it("changes one source color without replacing its event snapshot", () => {
    const current = state();
    const snapshot = current.snapshotsBySource;

    const next = calendarReducer(current, {
      type: "setCalendarSourceColor",
      sourceId: "source-1",
      color: "#fb7185"
    });

    expect(next).not.toBe(current);
    expect(next.sources[0]).toEqual({ ...SOURCE, color: "#fb7185" });
    expect(next.snapshotsBySource).toBe(snapshot);
  });

  it("returns the original reference for invalid, missing, and unchanged metadata", () => {
    const current = state();

    expect(
      calendarReducer(current, {
        type: "renameCalendarSource",
        sourceId: "source-1",
        name: "   "
      })
    ).toBe(current);
    expect(
      calendarReducer(current, {
        type: "renameCalendarSource",
        sourceId: "missing",
        name: "Work"
      })
    ).toBe(current);
    expect(
      calendarReducer(current, {
        type: "renameCalendarSource",
        sourceId: "source-1",
        name: SOURCE.name
      })
    ).toBe(current);
    expect(
      calendarReducer(current, {
        type: "setCalendarSourceColor",
        sourceId: "source-1",
        color: "#000000"
      })
    ).toBe(current);
    expect(
      calendarReducer(current, {
        type: "setCalendarSourceColor",
        sourceId: "missing",
        color: "#2dd4bf"
      })
    ).toBe(current);
    expect(
      calendarReducer(current, {
        type: "setCalendarSourceColor",
        sourceId: "source-1",
        color: SOURCE.color
      })
    ).toBe(current);
  });

  it("keeps edited metadata when a later sync succeeds", () => {
    const renamed = calendarReducer(state(), {
      type: "renameCalendarSource",
      sourceId: "source-1",
      name: "Personal"
    });
    const recolored = calendarReducer(renamed, {
      type: "setCalendarSourceColor",
      sourceId: "source-1",
      color: "#a78bfa"
    });
    const started = calendarReducer(recolored, {
      type: "calendarSyncStarted",
      sourceId: "source-1",
      generation: 1,
      attemptedAt: "2026-07-29T10:00:00.000Z"
    });

    const next = calendarReducer(started, {
      type: "calendarSyncSucceeded",
      sourceId: "source-1",
      generation: 1,
      syncedAt: "2026-07-29T10:01:00.000Z",
      events: null,
      etag: "\"v2\"",
      lastModified: null
    });

    expect(next.sources[0]).toMatchObject({
      name: "Personal",
      color: "#a78bfa",
      syncState: "idle",
      etag: "\"v2\""
    });
  });
});
