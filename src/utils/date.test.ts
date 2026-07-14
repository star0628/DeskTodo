import { describe, expect, it } from "vitest";
import {
  addLocalDays,
  isLocalDateKey,
  localDateKeyToDate,
  localDateKeyFromIso,
  millisecondsUntilNextLocalDay,
  toLocalDateKey
} from "./date";

describe("date utilities", () => {
  it("creates a local date key without converting through UTC", () => {
    expect(toLocalDateKey(new Date(2026, 6, 13, 0, 5))).toBe("2026-07-13");
  });

  it("converts an ISO timestamp using the runtime local calendar date", () => {
    const timestamp = "2026-07-12T18:30:00.000Z";
    expect(localDateKeyFromIso(timestamp)).toBe(toLocalDateKey(new Date(timestamp)));
    expect(localDateKeyFromIso("invalid")).toBeNull();
  });

  it("validates real local calendar dates", () => {
    expect(isLocalDateKey("2028-02-29")).toBe(true);
    expect(isLocalDateKey("2027-02-29")).toBe(false);
    expect(isLocalDateKey("2026-13-01")).toBe(false);
  });

  it("moves across month and year boundaries", () => {
    expect(addLocalDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addLocalDays("2028-03-01", -1)).toBe("2028-02-29");
  });

  it("converts date keys without UTC offset drift", () => {
    const date = localDateKeyToDate("2026-07-13");
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(6);
    expect(date.getDate()).toBe(13);
    expect(date.getHours()).toBe(12);
    expect(toLocalDateKey(date)).toBe("2026-07-13");
  });

  it("schedules refresh just after the next local midnight", () => {
    const now = new Date(2026, 6, 13, 23, 59, 59, 500);
    expect(millisecondsUntilNextLocalDay(now)).toBe(1500);
  });
});
