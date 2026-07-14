import { describe, expect, it } from "vitest";
import {
  createDeadlinePattern,
  deadlineToLocalParts,
  getDeadlineDisplay,
  getDeadlineRefreshDelay,
  getDeadlineVisibleLabel,
  isDeadlineDisplayMode,
  isValidDeadlineInstant,
  isValidDeadlinePattern,
  localDeadlineToIso,
  materializeDeadlineAt
} from "./deadline";

describe("deadline domain", () => {
  it("roundtrips a local deadline through a canonical ISO instant", () => {
    const deadlineAt = localDeadlineToIso("2026-07-14", "22:00");

    expect(deadlineAt).not.toBeNull();
    expect(isValidDeadlineInstant(deadlineAt)).toBe(true);
    expect(deadlineToLocalParts(deadlineAt!)).toEqual({ date: "2026-07-14", time: "22:00" });
  });

  it("rejects invalid dates, times, instants, and patterns", () => {
    expect(localDeadlineToIso("2026-02-30", "22:00")).toBeNull();
    expect(localDeadlineToIso("2026-07-14", "24:00")).toBeNull();
    expect(isValidDeadlineInstant("2026-07-14T22:00")).toBe(false);
    expect(isValidDeadlinePattern({ dayOffset: -1, localTime: "22:00" })).toBe(false);
    expect(isValidDeadlinePattern({ dayOffset: 0, localTime: "25:00" })).toBe(false);
    expect(isDeadlineDisplayMode("countdown")).toBe(true);
    expect(isDeadlineDisplayMode("dateTime")).toBe(true);
    expect(isDeadlineDisplayMode("clock")).toBe(false);
  });

  it("creates and materializes a recurring deadline pattern", () => {
    const deadlineAt = localDeadlineToIso("2026-07-15", "09:30");
    const pattern = createDeadlinePattern(deadlineAt, "2026-07-14");

    expect(pattern).toEqual({ dayOffset: 1, localTime: "09:30" });
    expect(deadlineToLocalParts(materializeDeadlineAt(pattern, "2026-07-20")!)).toEqual({
      date: "2026-07-21",
      time: "09:30"
    });
  });

  it.each([
    [31 * 60_000, "剩 31分钟", "soon", false],
    [30 * 60_000, "剩 30分钟", "soon", false],
    [29 * 60_000 + 59_000, "剩 29:59", "critical", true],
    [5 * 60_000 + 9_000, "剩 5:09", "critical", true],
    [1_000, "剩 0:01", "critical", true],
    [-10_000, "刚刚超时", "overdue", false],
    [-65 * 60_000, "已超时 1小时5分", "overdue", false]
  ])("formats countdown boundary %ims", (delta, label, urgency, usesSeconds) => {
    const now = new Date(2026, 6, 14, 20, 0, 0).getTime();
    const deadlineAt = new Date(now + Number(delta)).toISOString();

    expect(getDeadlineDisplay(deadlineAt, now, false)).toMatchObject({
      countdownLabel: label,
      urgency,
      usesSeconds
    });
  });

  it("keeps completed tasks static", () => {
    const now = new Date(2026, 6, 14, 20, 0, 0).getTime();
    const deadlineAt = new Date(now + 5_000).toISOString();
    expect(getDeadlineDisplay(deadlineAt, now, true)).toMatchObject({
      countdownLabel: null,
      urgency: "completed",
      usesSeconds: false
    });
  });

  it("selects one stable visible label for countdown and date-time modes", () => {
    const now = new Date(2026, 6, 14, 12, 0, 0).getTime();
    const display = getDeadlineDisplay(
      new Date(2026, 6, 14, 22, 0, 0).toISOString(),
      now,
      false
    );

    expect(display).not.toBeNull();
    expect(getDeadlineVisibleLabel(display!, "countdown")).toBe("剩 10小时");
    expect(getDeadlineVisibleLabel(display!, "dateTime")).toBe("今天 22:00");
  });

  it("formats tomorrow, later dates, cross-year dates, and overdue date-time labels", () => {
    const now = new Date(2026, 6, 14, 12, 0, 0).getTime();
    const label = (date: Date) => {
      const display = getDeadlineDisplay(date.toISOString(), now, false);
      return display ? getDeadlineVisibleLabel(display, "dateTime") : null;
    };

    expect(label(new Date(2026, 6, 15, 22, 0, 0))).toBe("明天 22:00");
    expect(label(new Date(2026, 6, 16, 22, 0, 0))).toBe("7月16日 22:00");
    expect(label(new Date(2027, 0, 2, 9, 5, 0))).toBe("2027年1月2日 09:05");
    expect(label(new Date(2026, 6, 13, 22, 0, 0))).toBe("已逾期 · 7月13日 22:00");
  });

  it("switches from minute refresh to second refresh below thirty minutes", () => {
    const minuteAlignedNow = new Date(2026, 6, 14, 20, 0, 0).getTime();
    const farDeadline = new Date(minuteAlignedNow + 31 * 60_000).toISOString();
    const closeDeadline = new Date(minuteAlignedNow + 10 * 60_000).toISOString();

    expect(getDeadlineRefreshDelay([farDeadline], minuteAlignedNow)).toBe(60_000);
    expect(getDeadlineRefreshDelay([closeDeadline], minuteAlignedNow)).toBe(1_000);
  });
});
