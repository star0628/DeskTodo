import { describe, expect, it } from "vitest";
import { todoReducer } from "../domain/todoReducer";
import { AppState, ArchivedCompletionRecord, TodoItem } from "../domain/todoTypes";
import { fallbackDefaultState } from "./appStateSchema";
import { LoadStatus } from "./appStateRepository";
import { shouldSaveTodoMutation } from "./savePolicy";

function task(overrides: Partial<TodoItem> = {}): TodoItem {
  const result: TodoItem = {
    id: "task-1",
    title: "Original",
    done: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    completedAt: null,
    completedOn: null,
    important: false,
    scheduledFor: null,
    deadlineAt: null,
    deadlineDisplayMode: "countdown",
    recurrenceSeriesId: null,
    children: [],
    ...overrides
  };

  if (result.done && overrides.completedAt === undefined) {
    result.completedAt = result.updatedAt;
    result.completedOn = "2026-01-01";
  }

  return result;
}

function state(tasks: TodoItem[] = []): AppState {
  return {
    ...fallbackDefaultState(),
    tasks
  };
}

describe("savePolicy", () => {
  function shouldSave({
    hasHydrated = true,
    loadStatus = "ok",
    previousState,
    nextState,
    action
  }: {
    hasHydrated?: boolean;
    loadStatus?: LoadStatus;
    previousState: AppState;
    nextState: AppState;
    action: Parameters<typeof todoReducer>[1];
  }) {
    return shouldSaveTodoMutation({ hasHydrated, loadStatus, previousState, nextState, action });
  }

  it("does not save before hydration", () => {
    const previousState = fallbackDefaultState();
    const action = { type: "addTask", title: "Task" } as const;
    const nextState = todoReducer(previousState, action);

    expect(shouldSave({ hasHydrated: false, previousState, nextState, action })).toBe(false);
  });

  it("does not save hydration/default state without a user mutation", () => {
    const hydratedState = fallbackDefaultState();
    const action = { type: "hydrateState", state: hydratedState } as const;

    expect(
      shouldSave({
        previousState: hydratedState,
        nextState: hydratedState,
        action
      })
    ).toBe(false);
  });

  it("saves after a real addTask mutation", () => {
    const previousState = fallbackDefaultState();
    const action = { type: "addTask", title: "Task" } as const;
    const nextState = todoReducer(previousState, action);

    expect(shouldSave({ previousState, nextState, action })).toBe(true);
  });

  it("does not save no-op empty editTask", () => {
    const previousState = state([task()]);
    const action = { type: "editTask", id: "task-1", title: " " } as const;
    const nextState = todoReducer(previousState, action);

    expect(nextState).toBe(previousState);
    expect(shouldSave({ previousState, nextState, action })).toBe(false);
  });

  it("does not save no-op identical editTask title", () => {
    const previousState = state([task()]);
    const action = { type: "editTask", id: "task-1", title: "  Original  " } as const;
    const nextState = todoReducer(previousState, action);

    expect(nextState).toBe(previousState);
    expect(shouldSave({ previousState, nextState, action })).toBe(false);
  });

  it("does not save no-op missing task id", () => {
    const previousState = state([task()]);
    const action = { type: "toggleTask", id: "missing" } as const;
    const nextState = todoReducer(previousState, action);

    expect(nextState).toBe(previousState);
    expect(shouldSave({ previousState, nextState, action })).toBe(false);
  });

  it("allows multiple consecutive real mutations to be saved in order", () => {
    const first = state([task()]);
    const toggleAction = { type: "toggleTask", id: "task-1" } as const;
    const editAction = { type: "editTask", id: "task-1", title: "Updated" } as const;
    const second = todoReducer(first, toggleAction);
    const third = todoReducer(second, editAction);

    expect(shouldSave({ previousState: first, nextState: second, action: toggleAction })).toBe(true);
    expect(shouldSave({ previousState: second, nextState: third, action: editAction })).toBe(true);
  });

  it("saves only real window layer mode changes", () => {
    const previousState = fallbackDefaultState();
    const sameAction = { type: "setWindowLayerMode", mode: "alwaysOnTop" } as const;
    const normalAction = { type: "setWindowLayerMode", mode: "normal" } as const;
    const same = todoReducer(previousState, sameAction);
    const normal = todoReducer(previousState, normalAction);

    expect(same).toBe(previousState);
    expect(shouldSave({ previousState, nextState: same, action: sameAction })).toBe(false);
    expect(shouldSave({ previousState, nextState: normal, action: normalAction })).toBe(true);
  });

  it("does not save a settings-only mutation after invalid load", () => {
    const previousState = fallbackDefaultState();
    const action = { type: "setWindowLayerMode", mode: "normal" } as const;
    const nextState = todoReducer(previousState, action);

    expect(shouldSave({ loadStatus: "invalid", previousState, nextState, action })).toBe(false);
  });

  it("saves a Todo mutation after invalid load", () => {
    const previousState = fallbackDefaultState();
    const action = { type: "addTask", title: "Clean task" } as const;
    const nextState = todoReducer(previousState, action);

    expect(shouldSave({ loadStatus: "invalid", previousState, nextState, action })).toBe(true);
  });

  it("allows settings mutations after a clean Todo state has been saved", () => {
    const previousState = state([task()]);
    const action = { type: "setWindowLayerMode", mode: "normal" } as const;
    const nextState = todoReducer(previousState, action);

    expect(shouldSave({ loadStatus: "ok", previousState, nextState, action })).toBe(true);
  });

  it("allows settings mutations after missing load", () => {
    const previousState = fallbackDefaultState();
    const action = { type: "setWindowLayerMode", mode: "normal" } as const;
    const nextState = todoReducer(previousState, action);

    expect(shouldSave({ loadStatus: "missing", previousState, nextState, action })).toBe(true);
  });

  it("saves changed visual settings but not identical values", () => {
    const previousState = fallbackDefaultState();
    const themeAction = { type: "setColorTheme", theme: "frost-blue" } as const;
    const sameFontAction = { type: "setFontSize", size: 16 } as const;
    const themed = todoReducer(previousState, themeAction);
    const sameFont = todoReducer(previousState, sameFontAction);

    expect(shouldSave({ previousState, nextState: themed, action: themeAction })).toBe(true);
    expect(sameFont).toBe(previousState);
    expect(shouldSave({ previousState, nextState: sameFont, action: sameFontAction })).toBe(false);
  });

  it("does not let visual settings overwrite an invalid fallback state", () => {
    const previousState = fallbackDefaultState();
    const action = { type: "setColorTheme", theme: "ink-gold" } as const;
    const nextState = todoReducer(previousState, action);

    expect(shouldSave({ loadStatus: "invalid", previousState, nextState, action })).toBe(false);
  });

  it("does not let opacity settings overwrite an invalid fallback state", () => {
    const previousState = fallbackDefaultState();
    const action = { type: "setBackgroundOpacity", percent: 50 } as const;
    const nextState = todoReducer(previousState, action);

    expect(shouldSave({ loadStatus: "invalid", previousState, nextState, action })).toBe(false);
  });

  it("saves changed custom colors only from a trusted state", () => {
    const previousState = fallbackDefaultState();
    const changedAction = {
      type: "setCustomThemeColors",
      colors: { canvas: "#101820", surface: "#223548", accent: "#4DA3FF" }
    } as const;
    const sameAction = {
      type: "setCustomThemeColors",
      colors: { canvas: "#111318", surface: "#2b303a", accent: "#84cc16" }
    } as const;
    const changed = todoReducer(previousState, changedAction);
    const same = todoReducer(previousState, sameAction);

    expect(shouldSave({ previousState, nextState: changed, action: changedAction })).toBe(true);
    expect(
      shouldSave({ loadStatus: "invalid", previousState, nextState: changed, action: changedAction })
    ).toBe(false);
    expect(same).toBe(previousState);
    expect(shouldSave({ previousState, nextState: same, action: sameAction })).toBe(false);
  });

  it("saves recurrence materialization only from a trusted loaded state", () => {
    const previousState = {
      ...fallbackDefaultState(),
      recurrenceSeries: [
        {
          id: "series-1",
          rule: { kind: "daily" } as const,
          template: {
            title: "Daily",
            important: false,
            childTitles: [],
            deadlinePattern: null,
            deadlineDisplayMode: "countdown" as const
          },
          nextOccurrenceOn: "2026-07-13",
          activeTaskId: null,
          enabled: true,
          createdAt: "2026-07-13T00:00:00.000Z",
          updatedAt: "2026-07-13T00:00:00.000Z"
        }
      ]
    };
    const action = { type: "materializeRecurrences", today: "2026-07-13" } as const;
    const nextState = todoReducer(previousState, action);

    expect(nextState).not.toBe(previousState);
    expect(shouldSave({ loadStatus: "ok", previousState, nextState, action })).toBe(true);
    expect(shouldSave({ loadStatus: "invalid", previousState, nextState, action })).toBe(false);
    expect(shouldSave({ loadStatus: "error", previousState, nextState, action })).toBe(false);
  });

  it("treats important and recurrence changes as Todo mutations after invalid fallback recovery", () => {
    const previousState = state([task()]);
    const importantAction = {
      type: "setTaskImportant",
      id: "task-1",
      important: true
    } as const;
    const importantState = todoReducer(previousState, importantAction);
    const recurrenceAction = {
      type: "setTaskRecurrence",
      id: "task-1",
      rule: { kind: "daily" } as const,
      today: "2026-07-13"
    } as const;
    const recurringState = todoReducer(previousState, recurrenceAction);

    expect(
      shouldSave({
        loadStatus: "invalid",
        previousState,
        nextState: importantState,
        action: importantAction
      })
    ).toBe(true);
    expect(
      shouldSave({
        loadStatus: "invalid",
        previousState,
        nextState: recurringState,
        action: recurrenceAction
      })
    ).toBe(true);
  });

  it("treats a deadline schedule change as Todo content recovery", () => {
    const previousState = state([task()]);
    const action = {
      type: "setTaskSchedule",
      id: "task-1",
      deadlineAt: new Date(2026, 6, 14, 22, 0).toISOString(),
      deadlineDisplayMode: "countdown",
      rule: null,
      today: "2026-07-14"
    } as const;
    const nextState = todoReducer(previousState, action);

    expect(
      shouldSave({ loadStatus: "invalid", previousState, nextState, action })
    ).toBe(true);
  });

  it("saves a real deadline display change and skips the same display mode", () => {
    const deadlineAt = new Date(2026, 6, 14, 22, 0).toISOString();
    const previousState = state([task({ deadlineAt })]);
    const changeAction = {
      type: "setTaskSchedule",
      id: "task-1",
      deadlineAt,
      deadlineDisplayMode: "dateTime",
      rule: null,
      today: "2026-07-14"
    } as const;
    const changed = todoReducer(previousState, changeAction);

    expect(
      shouldSave({ loadStatus: "invalid", previousState, nextState: changed, action: changeAction })
    ).toBe(true);

    const sameAction = { ...changeAction, deadlineDisplayMode: "countdown" as const };
    const unchanged = todoReducer(previousState, sameAction);
    expect(unchanged).toBe(previousState);
    expect(
      shouldSave({ previousState, nextState: unchanged, action: sameAction })
    ).toBe(false);
  });

  it("allows real mutations after a valid v1 migration", () => {
    const previousState = fallbackDefaultState();
    const action = { type: "setWindowLayerMode", mode: "normal" } as const;
    const nextState = todoReducer(previousState, action);

    expect(shouldSave({ loadStatus: "migrated", previousState, nextState, action })).toBe(true);
  });

  it("saves parent and child restore mutations", () => {
    const previousState = state([task({ children: [task({ id: "child-1" })] })]);
    const deletedParent = task({ id: "deleted-parent" });
    const restoreParent = { type: "restoreTask", task: deletedParent, index: 0 } as const;
    const parentState = todoReducer(previousState, restoreParent);
    expect(shouldSave({ previousState, nextState: parentState, action: restoreParent })).toBe(true);

    const deletedChild = task({ id: "deleted-child" });
    const restoreChild = {
      type: "restoreSubtask",
      parentId: "task-1",
      task: deletedChild,
      index: 1
    } as const;
    const childState = todoReducer(previousState, restoreChild);
    expect(shouldSave({ previousState, nextState: childState, action: restoreChild })).toBe(true);
  });

  it("saves real history deletion and restore actions but skips invalid history no-ops", () => {
    const completed = task({ id: "history", done: true });
    const previousState = state([completed]);
    const deleteAction = {
      type: "deleteHistoryEntries",
      targets: [{ kind: "task", taskId: completed.id, completedOn: completed.completedOn! }]
    } as const;
    const deletedState = todoReducer(previousState, deleteAction);

    expect(
      shouldSave({ previousState, nextState: deletedState, action: deleteAction })
    ).toBe(true);

    const invalidAction = {
      type: "deleteHistoryEntries",
      targets: [{ kind: "task", taskId: "missing", completedOn: "2026-01-01" }]
    } as const;
    expect(
      shouldSave({
        previousState,
        nextState: todoReducer(previousState, invalidAction),
        action: invalidAction
      })
    ).toBe(false);

    const planSnapshot = {
      parents: [{ task: completed, index: 0 }],
      children: []
    };
    const restoreAction = { type: "restoreHistoryEntries", snapshot: planSnapshot } as const;
    const restoredState = todoReducer(deletedState, restoreAction);
    expect(
      shouldSave({ previousState: deletedState, nextState: restoredState, action: restoreAction })
    ).toBe(true);
  });

  it("saves real parent and child reorder mutations but skips unchanged order", () => {
    const childA = task({ id: "child-a" });
    const childB = task({ id: "child-b" });
    const parentA = task({ id: "parent-a", children: [childA, childB] });
    const parentB = task({ id: "parent-b" });
    const previousState = state([parentA, parentB]);

    const parentAction = {
      type: "reorderTasks",
      orderedIds: [parentB.id, parentA.id]
    } as const;
    const reorderedParents = todoReducer(previousState, parentAction);
    expect(
      shouldSave({ previousState, nextState: reorderedParents, action: parentAction })
    ).toBe(true);

    const childAction = {
      type: "reorderSubtasks",
      parentId: parentA.id,
      orderedIds: [childB.id, childA.id]
    } as const;
    const reorderedChildren = todoReducer(previousState, childAction);
    expect(
      shouldSave({ previousState, nextState: reorderedChildren, action: childAction })
    ).toBe(true);

    const unchangedAction = {
      type: "reorderTasks",
      orderedIds: [parentA.id, parentB.id]
    } as const;
    const unchanged = todoReducer(previousState, unchangedAction);
    expect(unchanged).toBe(previousState);
    expect(
      shouldSave({ previousState, nextState: unchanged, action: unchangedAction })
    ).toBe(false);
  });

  it("saves imported completion content, including after an invalid load", () => {
    const record: ArchivedCompletionRecord = {
      id: "archive-1",
      sourceRef: "source-1",
      sourceTaskId: "task-1",
      importBatchId: "batch-1",
      kind: "task",
      title: "导入记录",
      parentTitle: null,
      createdAt: "2026-07-14T01:00:00.000Z",
      completedAt: "2026-07-14T02:00:00.000Z",
      completedOn: "2026-07-14",
      important: false,
      scheduledFor: null,
      deadlineAt: null,
      recurrenceLabel: null
    };
    const previousState = state([]);
    const action = { type: "importCompletionRecords", records: [record] } as const;
    const nextState = todoReducer(previousState, action);

    expect(
      shouldSaveTodoMutation({
        hasHydrated: true,
        loadStatus: "invalid",
        previousState,
        nextState,
        action
      })
    ).toBe(true);
  });
});
