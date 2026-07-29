import { describe, expect, it } from "vitest";
import type { CalendarEvent, CalendarState } from "./calendarTypes";
import {
  eventIntersectsDate,
  getCalendarEventCountByDate,
  getCalendarEventsForDate
} from "./calendarSelectors";

function allDay(
  id: string,
  startOn: string,
  endExclusiveOn: string
): CalendarEvent {
  return {
    id,
    sourceId: "source-1",
    uid: id,
    recurrenceId: null,
    title: id,
    location: "",
    description: "",
    time: {
      kind: "allDay",
      startOn,
      endExclusiveOn
    }
  };
}

function timed(id: string, startsAt: string, endsAt: string): CalendarEvent {
  return {
    id,
    sourceId: "source-1",
    uid: id,
    recurrenceId: null,
    title: id,
    location: "",
    description: "",
    time: { kind: "timed", startsAt, endsAt, timeZone: "Asia/Shanghai" }
  };
}

describe("calendarSelectors", () => {
  it("respects the exclusive end date for all-day events", () => {
    const event = allDay("trip", "2026-07-29", "2026-07-31");

    expect(eventIntersectsDate(event, "2026-07-29")).toBe(true);
    expect(eventIntersectsDate(event, "2026-07-30")).toBe(true);
    expect(eventIntersectsDate(event, "2026-07-31")).toBe(false);
  });

  it("uses local day boundaries for cross-midnight timed events", () => {
    const start = new Date(2026, 6, 29, 23, 30).toISOString();
    const end = new Date(2026, 6, 30, 0, 30).toISOString();
    const event = timed("late", start, end);

    expect(eventIntersectsDate(event, "2026-07-29")).toBe(true);
    expect(eventIntersectsDate(event, "2026-07-30")).toBe(true);
    expect(eventIntersectsDate(event, "2026-07-31")).toBe(false);
  });

  it("counts every intersected local date and sorts all-day events first", () => {
    const events = [
      timed(
        "timed",
        new Date(2026, 6, 29, 9).toISOString(),
        new Date(2026, 6, 29, 10).toISOString()
      ),
      allDay("all-day", "2026-07-29", "2026-07-31")
    ];
    const state = {
      schemaVersion: 2,
      sources: [],
      snapshotsBySource: { "source-1": events }
    } satisfies CalendarState;

    expect(getCalendarEventsForDate(state, "2026-07-29").map(({ id }) => id)).toEqual([
      "all-day",
      "timed"
    ]);
    expect(Object.fromEntries(getCalendarEventCountByDate(state))).toEqual({
      "2026-07-29": 2,
      "2026-07-30": 1
    });
  });
});
