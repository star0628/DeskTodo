import { describe, expect, it } from "vitest";
import { fallbackDefaultState } from "../persistence/appStateSchema";
import {
  createHistoryDeletionPlan,
  getHistoryTargetAvailability,
  HistoryDeleteTarget
} from "./historyDeletion";
import { todoReducer } from "./todoReducer";
import { AppState, ArchivedCompletionRecord, RecurrenceSeries, TodoItem } from "./todoTypes";

const DAY = "2026-07-12";
const OTHER_DAY = "2026-07-11";

function completedTask(
  id: string,
  completedOn = DAY,
  children: TodoItem[] = [],
  overrides: Partial<TodoItem> = {}
): TodoItem {
  return {
    id,
    title: id,
    done: true,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: `${completedOn}T08:00:00.000Z`,
    completedAt: `${completedOn}T08:00:00.000Z`,
    completedOn,
    important: false,
    scheduledFor: null,
    deadlineAt: null,
    deadlineDisplayMode: "countdown",
    recurrenceSeriesId: null,
    children,
    ...overrides
  };
}

function openTask(id: string): TodoItem {
  return {
    ...completedTask(id),
    done: false,
    completedAt: null,
    completedOn: null
  };
}

function appState(tasks: TodoItem[], recurrenceSeries: RecurrenceSeries[] = []): AppState {
  return { ...fallbackDefaultState(), tasks, recurrenceSeries };
}

function parentTarget(taskId: string, completedOn = DAY): HistoryDeleteTarget {
  return { kind: "task", taskId, completedOn };
}

function childTarget(parentId: string, childId: string, completedOn = DAY): HistoryDeleteTarget {
  return { kind: "subtask", parentId, childId, completedOn };
}

describe("history deletion", () => {
  it("deduplicates a selected child when its parent is selected and reports collateral dates", () => {
    const parent = completedTask("parent", DAY, [
      completedTask("same-day-child"),
      completedTask("other-day-child", OTHER_DAY)
    ]);
    const plan = createHistoryDeletionPlan(appState([parent]), [
      childTarget(parent.id, "same-day-child"),
      parentTarget(parent.id),
      parentTarget(parent.id)
    ]);

    expect(plan).toMatchObject({
      selectedCount: 1,
      deletedEntryCount: 3,
      otherDateCount: 1,
      focusId: "parent"
    });
    expect(plan?.targets).toEqual([parentTarget("parent")]);
  });

  it("blocks a completed parent that still contains unfinished work", () => {
    const parent = completedTask("parent", DAY, [openTask("open-child")]);
    const state = appState([parent]);
    const target = parentTarget(parent.id);

    expect(getHistoryTargetAvailability(state, target)).toEqual({
      canDelete: false,
      blockedReason: "仍有未完成子任务"
    });
    expect(createHistoryDeletionPlan(state, [target])).toBeNull();
    expect(todoReducer(state, { type: "deleteHistoryEntries", targets: [target] })).toBe(state);
  });

  it("deletes one completed child without removing or retimestamping its parent", () => {
    const removed = completedTask("removed");
    const kept = completedTask("kept", OTHER_DAY);
    const parent = completedTask("parent", DAY, [removed, kept]);
    const state = appState([parent]);

    const next = todoReducer(state, {
      type: "deleteHistoryEntries",
      targets: [childTarget(parent.id, removed.id)]
    });

    expect(next.tasks[0].children).toEqual([kept]);
    expect(next.tasks[0].updatedAt).toBe(parent.updatedAt);
    expect(state.tasks[0].children).toEqual([removed, kept]);
  });

  it("deletes a historical recurring occurrence without changing its series", () => {
    const historical = completedTask("historical", DAY, [], {
      recurrenceSeriesId: "series-1"
    });
    const current = openTask("current");
    const series: RecurrenceSeries = {
      id: "series-1",
      rule: { kind: "daily" },
      template: {
        title: "recurring",
        important: false,
        childTitles: [],
        deadlinePattern: null,
        deadlineDisplayMode: "countdown"
      },
      nextOccurrenceOn: "2026-07-14",
      activeTaskId: current.id,
      enabled: true,
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-13T00:00:00.000Z"
    };
    const state = appState([historical, current], [series]);

    const next = todoReducer(state, {
      type: "deleteHistoryEntries",
      targets: [parentTarget(historical.id)]
    });

    expect(next.tasks).toEqual([current]);
    expect(next.recurrenceSeries).toBe(state.recurrenceSeries);
    expect(next.recurrenceSeries[0]).toBe(series);
  });

  it("uses all-or-nothing validation for stale or mismatched batches", () => {
    const state = appState([completedTask("valid")]);
    const targets = [parentTarget("valid"), parentTarget("missing")] as const;

    expect(createHistoryDeletionPlan(state, targets)).toBeNull();
    expect(todoReducer(state, { type: "deleteHistoryEntries", targets })).toBe(state);
    expect(
      todoReducer(state, {
        type: "deleteHistoryEntries",
        targets: [parentTarget("valid", OTHER_DAY)]
      })
    ).toBe(state);
  });

  it("restores an atomic mixed parent and child deletion at the original positions", () => {
    const first = openTask("first");
    const removedChild = completedTask("removed-child");
    const keptChild = completedTask("kept-child", OTHER_DAY);
    const parent = completedTask("parent", DAY, [removedChild, keptChild]);
    const removedParent = completedTask("removed-parent");
    const last = openTask("last");
    const state = appState([first, parent, removedParent, last]);
    const targets = [
      childTarget(parent.id, removedChild.id),
      parentTarget(removedParent.id)
    ];
    const plan = createHistoryDeletionPlan(state, targets);
    expect(plan).not.toBeNull();

    const deleted = todoReducer(state, { type: "deleteHistoryEntries", targets });
    const restored = todoReducer(deleted, {
      type: "restoreHistoryEntries",
      snapshot: plan!.snapshot
    });

    expect(restored.tasks).toEqual(state.tasks);
    expect(restored.tasks.map((task) => task.id)).toEqual([
      "first",
      "parent",
      "removed-parent",
      "last"
    ]);
    expect(restored.tasks[1].children.map((child) => child.id)).toEqual([
      "removed-child",
      "kept-child"
    ]);
  });

  it("returns the original state for empty or conflicting restore snapshots", () => {
    const existing = completedTask("existing");
    const state = appState([existing]);

    expect(
      todoReducer(state, {
        type: "restoreHistoryEntries",
        snapshot: { parents: [], children: [] }
      })
    ).toBe(state);
    expect(
      todoReducer(state, {
        type: "restoreHistoryEntries",
        snapshot: { parents: [{ task: existing, index: 0 }], children: [] }
      })
    ).toBe(state);
  });

  it("deletes and restores an imported completion record without touching live tasks", () => {
    const record: ArchivedCompletionRecord = {
      id: "archive-1",
      sourceRef: "source-1",
      sourceTaskId: "task-1",
      importBatchId: "batch-1",
      kind: "task",
      title: "导入历史",
      parentTitle: null,
      createdAt: "2026-07-12T01:00:00.000Z",
      completedAt: "2026-07-12T02:00:00.000Z",
      completedOn: DAY,
      important: false,
      scheduledFor: null,
      deadlineAt: null,
      recurrenceLabel: null
    };
    const live = completedTask("live");
    const state = { ...appState([live]), archivedCompletions: [record] };
    const target: HistoryDeleteTarget = {
      kind: "archive",
      recordId: record.id,
      completedOn: DAY
    };
    const plan = createHistoryDeletionPlan(state, [target]);
    const deleted = todoReducer(state, { type: "deleteHistoryEntries", targets: [target] });
    const restored = todoReducer(deleted, {
      type: "restoreHistoryEntries",
      snapshot: plan!.snapshot
    });

    expect(deleted.tasks).toEqual([live]);
    expect(deleted.archivedCompletions).toEqual([]);
    expect(restored.archivedCompletions).toEqual([record]);
  });
});
