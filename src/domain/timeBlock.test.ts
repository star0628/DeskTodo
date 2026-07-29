import { describe, expect, it } from "vitest";
import { localDeadlineToIso } from "./deadline";
import {
  createTodoTimeBlockPattern,
  isValidTodoTimeBlock,
  isValidTodoTimeBlockPattern,
  materializeTodoTimeBlock,
  todoTimeBlockIntersectsDate
} from "./timeBlock";

describe("timeBlock", () => {
  it("validates bounded all-day and timed ranges", () => {
    expect(
      isValidTodoTimeBlock({
        kind: "allDay",
        startOn: "2026-07-29",
        endExclusiveOn: "2026-07-30"
      })
    ).toBe(true);
    expect(
      isValidTodoTimeBlock({
        kind: "allDay",
        startOn: "2026-07-30",
        endExclusiveOn: "2026-07-29"
      })
    ).toBe(false);
    expect(
      isValidTodoTimeBlock({
        kind: "timed",
        startsAt: localDeadlineToIso("2026-07-29", "10:00"),
        endsAt: localDeadlineToIso("2026-07-29", "09:00")
      })
    ).toBe(false);
  });

  it("uses local-day intersection semantics at midnight boundaries", () => {
    const block = {
      kind: "timed",
      startsAt: localDeadlineToIso("2026-07-29", "23:30")!,
      endsAt: localDeadlineToIso("2026-07-30", "00:30")!
    } as const;

    expect(todoTimeBlockIntersectsDate(block, "2026-07-29")).toBe(true);
    expect(todoTimeBlockIntersectsDate(block, "2026-07-30")).toBe(true);
    expect(todoTimeBlockIntersectsDate(block, "2026-07-31")).toBe(false);
  });

  it("roundtrips recurrence patterns using local dates and times", () => {
    const block = {
      kind: "timed",
      startsAt: localDeadlineToIso("2026-07-29", "19:00")!,
      endsAt: localDeadlineToIso("2026-07-29", "20:00")!
    } as const;
    const pattern = createTodoTimeBlockPattern(block, "2026-07-29");

    expect(pattern).toEqual({
      kind: "timed",
      startDayOffset: 0,
      startLocalTime: "19:00",
      endDayOffset: 0,
      endLocalTime: "20:00"
    });
    expect(isValidTodoTimeBlockPattern(pattern)).toBe(true);
    expect(materializeTodoTimeBlock(pattern, "2026-08-05")).toEqual({
      kind: "timed",
      startsAt: localDeadlineToIso("2026-08-05", "19:00"),
      endsAt: localDeadlineToIso("2026-08-05", "20:00")
    });
  });
});
