import { describe, expect, it } from "vitest";
import type {
  CalendarEvent,
  CalendarSource,
  CalendarState
} from "../domain/calendarTypes";
import {
  fallbackCalendarState,
  isCalendarState,
  parseCalendarState
} from "./calendarStateSchema";

const SOURCE: CalendarSource = {
  id: "source-1",
  name: "工作",
  color: "#4da3ff",
  region: "global",
  kind: "published",
  etag: "\"v1\"",
  lastModified: null,
  syncState: "idle",
  activeGeneration: 1,
  lastAttemptAt: "2026-07-29T01:00:00.000Z",
  lastSuccessAt: "2026-07-29T01:00:00.000Z",
  failureCount: 0,
  nextRetryAt: null,
  errorCode: null
};

const EVENT: CalendarEvent = {
  id: "calendar-source-1-event",
  sourceId: "source-1",
  uid: "event",
  recurrenceId: null,
  title: "事件",
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

describe("calendarStateSchema", () => {
  it("accepts valid URL-free calendar state", () => {
    expect(isCalendarState(state())).toBe(true);
    expect(JSON.stringify(state())).not.toContain("webcal");
    expect(JSON.stringify(state())).not.toContain("published/2");
  });

  it("rejects URLs in source metadata and mismatched snapshot ownership", () => {
    expect(
      isCalendarState({
        ...state(),
        sources: [{ ...SOURCE, url: "redacted" }]
      })
    ).toBe(false);
    expect(
      isCalendarState({
        ...state(),
        snapshotsBySource: {
          "source-1": [{ ...EVENT, sourceId: "source-2" }]
        }
      })
    ).toBe(false);
  });

  it("converts interrupted syncing state into stale without writing", () => {
    const stored: CalendarState = {
      ...state(),
      sources: [{ ...SOURCE, syncState: "syncing" }]
    };
    const loaded = parseCalendarState(stored);

    expect(loaded.status).toBe("ok");
    expect(loaded.state.sources[0].syncState).toBe("stale");
    expect(stored.sources[0].syncState).toBe("syncing");
  });

  it("migrates v1 sources to published feeds in memory", () => {
    const { kind: _kind, ...legacySource } = SOURCE;
    const loaded = parseCalendarState({
      schemaVersion: 1,
      sources: [legacySource],
      snapshotsBySource: { "source-1": [EVENT] }
    });

    expect(loaded.status).toBe("migrated");
    expect(loaded.state).toMatchObject({
      schemaVersion: 2,
      sources: [{ kind: "published" }]
    });
  });

  it("uses an empty fallback for invalid data", () => {
    expect(parseCalendarState({ schemaVersion: 99 })).toEqual({
      state: fallbackCalendarState(),
      status: "invalid"
    });
  });
});
