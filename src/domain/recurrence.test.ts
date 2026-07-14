import { describe, expect, it } from "vitest";
import { fallbackDefaultState } from "../persistence/appStateSchema";
import {
  getLatestDueOccurrence,
  getNextOccurrenceDate,
  materializeDueRecurrences,
  normalizeRecurrenceRule,
  recurrenceRulesEqual
} from "./recurrence";
import { AppState, RecurrenceRule, RecurrenceSeries, TodoItem } from "./todoTypes";

const timestamp = "2026-07-13T08:00:00.000Z";

describe("recurrence date rules", () => {
  it("normalizes weekly weekdays into display order and removes duplicates", () => {
    expect(normalizeRecurrenceRule({ kind: "weekly", weekdays: [0, 3, 1, 3] })).toEqual({
      kind: "weekly",
      weekdays: [1, 3, 0]
    });
    expect(normalizeRecurrenceRule({ kind: "weekly", weekdays: [] })).toBeNull();
  });

  it("compares normalized rules rather than raw weekday order", () => {
    expect(
      recurrenceRulesEqual(
        { kind: "weekly", weekdays: [1, 5] },
        { kind: "weekly", weekdays: [5, 1, 1] }
      )
    ).toBe(true);
    expect(recurrenceRulesEqual({ kind: "daily" }, { kind: "weekdays" })).toBe(false);
  });

  it("calculates daily and cross-month dates", () => {
    expect(getNextOccurrenceDate({ kind: "daily" }, "2026-07-31")).toBe("2026-08-01");
    expect(getNextOccurrenceDate({ kind: "daily" }, "2026-12-31")).toBe("2027-01-01");
  });

  it("skips weekends for weekday recurrence", () => {
    expect(getNextOccurrenceDate({ kind: "weekdays" }, "2026-07-17")).toBe("2026-07-20");
    expect(getNextOccurrenceDate({ kind: "weekdays" }, "2026-07-19")).toBe("2026-07-20");
  });

  it("calculates the next selected weekday across a week boundary", () => {
    const rule: RecurrenceRule = { kind: "weekly", weekdays: [1, 3, 5] };
    expect(getNextOccurrenceDate(rule, "2026-07-17")).toBe("2026-07-20");
    expect(getNextOccurrenceDate(rule, "2026-07-20")).toBe("2026-07-22");
  });

  it("finds only the latest due date after the app was closed", () => {
    expect(getLatestDueOccurrence({ kind: "daily" }, "2026-07-01", "2026-07-13")).toBe(
      "2026-07-13"
    );
    expect(
      getLatestDueOccurrence(
        { kind: "weekly", weekdays: [1, 3, 5] },
        "2026-07-06",
        "2026-07-16"
      )
    ).toBe("2026-07-15");
  });
});

describe("materializeDueRecurrences", () => {
  it("creates one independent occurrence and resets copied children", () => {
    const state = stateWithSeries(series());
    let id = 0;
    const next = materializeDueRecurrences(state, "2026-07-13", {
      timestamp,
      createId: () => `generated-${++id}`
    });

    expect(next.tasks).toHaveLength(1);
    expect(next.tasks[0]).toMatchObject({
      id: "generated-1",
      title: "日报",
      important: true,
      scheduledFor: "2026-07-13",
      recurrenceSeriesId: "series-1",
      done: false
    });
    expect(next.tasks[0].children).toEqual([
      expect.objectContaining({ id: "generated-2", title: "整理数据", done: false, children: [] }),
      expect.objectContaining({ id: "generated-3", title: "发送邮件", done: false, children: [] })
    ]);
    expect(next.recurrenceSeries[0]).toMatchObject({
      activeTaskId: "generated-1",
      nextOccurrenceOn: "2026-07-14"
    });
  });

  it("is idempotent when reconciliation runs repeatedly on the same date", () => {
    const first = materializeDueRecurrences(stateWithSeries(series()), "2026-07-13", {
      timestamp,
      createId: () => "generated-1"
    });
    const second = materializeDueRecurrences(first, "2026-07-13", {
      timestamp,
      createId: () => "should-not-be-used"
    });

    expect(second).toBe(first);
    expect(second.tasks).toHaveLength(1);
  });

  it("does not generate a duplicate while an occurrence is unfinished", () => {
    const openTask = task({
      recurrenceSeriesId: "series-1",
      scheduledFor: "2026-07-12"
    });
    const currentSeries = series({ activeTaskId: openTask.id, nextOccurrenceOn: "2026-07-13" });
    const state = stateWithSeries(currentSeries, [openTask]);

    expect(materializeDueRecurrences(state, "2026-07-13")).toBe(state);
  });

  it("repairs a stale active pointer without generating a duplicate", () => {
    const openTask = task({
      recurrenceSeriesId: "series-1",
      scheduledFor: "2026-07-12"
    });
    const state = stateWithSeries(series({ activeTaskId: null }), [openTask]);
    const next = materializeDueRecurrences(state, "2026-07-13", {
      timestamp,
      createId: () => "should-not-be-used"
    });

    expect(next.tasks).toHaveLength(1);
    expect(next.recurrenceSeries[0].activeTaskId).toBe(openTask.id);
  });

  it("does not materialize before the next scheduled date", () => {
    const state = stateWithSeries(series({ nextOccurrenceOn: "2026-07-14" }));
    expect(materializeDueRecurrences(state, "2026-07-13")).toBe(state);
  });

  it("does not create occurrences for a disabled series", () => {
    const state = stateWithSeries(series({ enabled: false }));
    expect(materializeDueRecurrences(state, "2026-07-13")).toBe(state);
  });

  it("materializes the recurring deadline from the occurrence date", () => {
    const currentSeries = series({
      template: {
        title: "日报",
        important: true,
        childTitles: [],
        deadlinePattern: { dayOffset: 0, localTime: "22:00" },
        deadlineDisplayMode: "dateTime"
      }
    });
    const next = materializeDueRecurrences(stateWithSeries(currentSeries), "2026-07-13", {
      timestamp,
      createId: () => "generated-1"
    });

    const deadline = new Date(next.tasks[0].deadlineAt!);
    expect(next.tasks[0].scheduledFor).toBe("2026-07-13");
    expect(deadline.getFullYear()).toBe(2026);
    expect(deadline.getMonth()).toBe(6);
    expect(deadline.getDate()).toBe(13);
    expect(deadline.getHours()).toBe(22);
    expect(deadline.getMinutes()).toBe(0);
    expect(next.tasks[0].deadlineDisplayMode).toBe("dateTime");
  });
});

function stateWithSeries(
  recurrenceSeries: RecurrenceSeries,
  tasks: TodoItem[] = []
): AppState {
  return { ...fallbackDefaultState(), tasks, recurrenceSeries: [recurrenceSeries] };
}

function series(overrides: Partial<RecurrenceSeries> = {}): RecurrenceSeries {
  return {
    id: "series-1",
    rule: { kind: "daily" },
    template: {
      title: "日报",
      important: true,
      childTitles: ["整理数据", "发送邮件"],
      deadlinePattern: null,
      deadlineDisplayMode: "countdown"
    },
    nextOccurrenceOn: "2026-07-13",
    activeTaskId: null,
    enabled: true,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides
  };
}

function task(overrides: Partial<TodoItem> = {}): TodoItem {
  return {
    id: "task-1",
    title: "日报",
    done: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    completedAt: null,
    completedOn: null,
    important: true,
    scheduledFor: null,
    deadlineAt: null,
    deadlineDisplayMode: "countdown",
    recurrenceSeriesId: null,
    children: [],
    ...overrides
  };
}
