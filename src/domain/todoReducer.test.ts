import { describe, expect, it, vi } from "vitest";
import { AppState, ArchivedCompletionRecord, TodoItem } from "./todoTypes";
import { todoReducer } from "./todoReducer";

function stateWithTasks(tasks: TodoItem[] = []): AppState {
  return {
    schemaVersion: 9,
    tasks,
    archivedCompletions: [],
    recurrenceSeries: [],
    settings: {
      alwaysOnTop: true,
      compactMode: false,
      theme: "dark",
      windowLayerMode: "alwaysOnTop",
      colorTheme: "graphite-lime",
      customThemeColors: {
        canvas: "#111318",
        surface: "#2B303A",
        accent: "#84CC16"
      },
      fontSize: 16,
      backgroundOpacityPercent: 90,
      collapseCompletedByDefault: false
    }
  };
}

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

describe("todoReducer", () => {
  it("addTask: normally adds a task", () => {
    const next = todoReducer(stateWithTasks(), { type: "addTask", title: "  Write plan  " });

    expect(next.tasks).toHaveLength(1);
    expect(next.tasks[0].title).toBe("Write plan");
    expect(next.tasks[0].children).toEqual([]);
  });

  it("addTask: does not add an empty title", () => {
    const initial = stateWithTasks();
    const next = todoReducer(initial, { type: "addTask", title: "   " });

    expect(next).toBe(initial);
    expect(next.tasks).toHaveLength(0);
  });

  it("addTask: creates a trimmed task on a valid future date", () => {
    const next = todoReducer(stateWithTasks(), {
      type: "addTask",
      title: "  Future plan  ",
      scheduledFor: "2026-07-20",
      today: "2026-07-17"
    });

    expect(next.tasks[0]).toMatchObject({
      title: "Future plan",
      scheduledFor: "2026-07-20",
      recurrenceSeriesId: null,
      children: []
    });
  });

  it("addTask: rejects malformed or past planned dates", () => {
    const initial = stateWithTasks();

    expect(
      todoReducer(initial, {
        type: "addTask",
        title: "Past",
        scheduledFor: "2026-07-16",
        today: "2026-07-17"
      })
    ).toBe(initial);
    expect(
      todoReducer(initial, {
        type: "addTask",
        title: "Malformed",
        scheduledFor: "2026-02-30",
        today: "2026-07-17"
      })
    ).toBe(initial);
  });

  it("editTask: normally edits a task", () => {
    const next = todoReducer(stateWithTasks([task()]), {
      type: "editTask",
      id: "task-1",
      title: "  Updated  "
    });

    expect(next.tasks[0].title).toBe("Updated");
  });

  it("editTask: empty title does not overwrite original title", () => {
    const initial = stateWithTasks([task()]);
    const next = todoReducer(initial, { type: "editTask", id: "task-1", title: " " });

    expect(next).toBe(initial);
    expect(next.tasks[0].title).toBe("Original");
  });

  it("editTask: identical title returns original state", () => {
    const initial = stateWithTasks([task()]);
    const next = todoReducer(initial, { type: "editTask", id: "task-1", title: "  Original  " });

    expect(next).toBe(initial);
  });

  it("toggleTask: toggles done and open states", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 13, 9, 30));
    const done = todoReducer(stateWithTasks([task()]), { type: "toggleTask", id: "task-1" });
    const open = todoReducer(done, { type: "toggleTask", id: "task-1" });

    expect(done.tasks[0].done).toBe(true);
    expect(done.tasks[0].completedAt).toBe(new Date(2026, 6, 13, 9, 30).toISOString());
    expect(done.tasks[0].completedOn).toBe("2026-07-13");
    expect(open.tasks[0].done).toBe(false);
    expect(open.tasks[0].completedAt).toBeNull();
    expect(open.tasks[0].completedOn).toBeNull();
    vi.useRealTimers();
  });

  it("deleteTask: deletes a parent task", () => {
    const next = todoReducer(stateWithTasks([task(), task({ id: "task-2" })]), {
      type: "deleteTask",
      id: "task-1"
    });

    expect(next.tasks.map((item) => item.id)).toEqual(["task-2"]);
  });

  it("deleteTask: deleting a parent also removes its children", () => {
    const next = todoReducer(
      stateWithTasks([
        task({ children: [task({ id: "child-1", title: "Child" })] }),
        task({ id: "task-2" })
      ]),
      { type: "deleteTask", id: "task-1" }
    );

    expect(next.tasks).toHaveLength(1);
    expect(next.tasks[0].id).toBe("task-2");
  });

  it("reorderTasks: reorders only the requested task subset", () => {
    const hidden = task({ id: "hidden" });
    const first = task({ id: "first" });
    const second = task({ id: "second" });
    const initial = stateWithTasks([first, hidden, second]);

    const next = todoReducer(initial, {
      type: "reorderTasks",
      orderedIds: ["second", "first"]
    });

    expect(next.tasks.map((item) => item.id)).toEqual(["second", "hidden", "first"]);
    expect(next.tasks[0]).toBe(second);
    expect(next.tasks[1]).toBe(hidden);
    expect(next.tasks[2]).toBe(first);
    expect(next.tasks[0].updatedAt).toBe(first.updatedAt);
  });

  it("reorderTasks: identical, duplicate, or missing ids are no-ops", () => {
    const initial = stateWithTasks([task({ id: "first" }), task({ id: "second" })]);

    expect(
      todoReducer(initial, { type: "reorderTasks", orderedIds: ["first", "second"] })
    ).toBe(initial);
    expect(
      todoReducer(initial, { type: "reorderTasks", orderedIds: ["first", "first"] })
    ).toBe(initial);
    expect(
      todoReducer(initial, { type: "reorderTasks", orderedIds: ["first", "missing"] })
    ).toBe(initial);
  });

  it("editTask/toggleTask/deleteTask: missing id returns original state", () => {
    const initial = stateWithTasks([task()]);

    expect(todoReducer(initial, { type: "editTask", id: "missing", title: "Updated" })).toBe(initial);
    expect(todoReducer(initial, { type: "toggleTask", id: "missing" })).toBe(initial);
    expect(todoReducer(initial, { type: "deleteTask", id: "missing" })).toBe(initial);
  });

  it("addSubtask: normally adds a child with no nested children", () => {
    const next = todoReducer(stateWithTasks([task()]), {
      type: "addSubtask",
      parentId: "task-1",
      title: "  Child  "
    });

    expect(next.tasks[0].children).toHaveLength(1);
    expect(next.tasks[0].children[0].title).toBe("Child");
    expect(next.tasks[0].children[0].children).toEqual([]);
  });

  it("addSubtask: does not add an empty child title", () => {
    const initial = stateWithTasks([task()]);
    const next = todoReducer(initial, { type: "addSubtask", parentId: "task-1", title: " " });

    expect(next).toBe(initial);
    expect(next.tasks[0].children).toHaveLength(0);
  });

  it("addSubtask: missing parentId does not throw and changes nothing", () => {
    const initial = stateWithTasks([task()]);

    expect(() =>
      todoReducer(initial, { type: "addSubtask", parentId: "missing", title: "Child" })
    ).not.toThrow();
    expect(todoReducer(initial, { type: "addSubtask", parentId: "missing", title: "Child" })).toBe(initial);
  });

  it("editSubtask: normally edits a child task", () => {
    const initial = stateWithTasks([task({ children: [task({ id: "child-1", title: "Child" })] })]);
    const next = todoReducer(initial, {
      type: "editSubtask",
      parentId: "task-1",
      childId: "child-1",
      title: "  Updated child  "
    });

    expect(next.tasks[0].children[0].title).toBe("Updated child");
    expect(next.tasks[0].updatedAt).not.toBe(initial.tasks[0].updatedAt);
  });

  it("editSubtask: empty title does not overwrite original child title", () => {
    const initial = stateWithTasks([task({ children: [task({ id: "child-1", title: "Child" })] })]);
    const next = todoReducer(initial, {
      type: "editSubtask",
      parentId: "task-1",
      childId: "child-1",
      title: " "
    });

    expect(next).toBe(initial);
    expect(next.tasks[0].children[0].title).toBe("Child");
  });

  it("editSubtask: identical child title returns original state", () => {
    const initial = stateWithTasks([task({ children: [task({ id: "child-1", title: "Child" })] })]);
    const next = todoReducer(initial, {
      type: "editSubtask",
      parentId: "task-1",
      childId: "child-1",
      title: "  Child  "
    });

    expect(next).toBe(initial);
  });

  it("editSubtask: missing parentId or childId returns original state", () => {
    const initial = stateWithTasks([task({ children: [task({ id: "child-1", title: "Child" })] })]);

    expect(
      todoReducer(initial, {
        type: "editSubtask",
        parentId: "missing",
        childId: "child-1",
        title: "Updated"
      })
    ).toBe(initial);
    expect(
      todoReducer(initial, {
        type: "editSubtask",
        parentId: "task-1",
        childId: "missing",
        title: "Updated"
      })
    ).toBe(initial);
  });

  it("toggleSubtask: toggles child done state", () => {
    const initial = stateWithTasks([
      task({ children: [task({ id: "child-1", title: "Child" })] })
    ]);
    const next = todoReducer(initial, {
      type: "toggleSubtask",
      parentId: "task-1",
      childId: "child-1"
    });

    expect(next.tasks[0].children[0].done).toBe(true);
    expect(next.tasks[0].children[0].completedAt).not.toBeNull();
    expect(next.tasks[0].children[0].completedOn).not.toBeNull();
  });

  it("toggleSubtask: missing parentId or childId returns original state", () => {
    const initial = stateWithTasks([task({ children: [task({ id: "child-1", title: "Child" })] })]);

    expect(
      todoReducer(initial, { type: "toggleSubtask", parentId: "missing", childId: "child-1" })
    ).toBe(initial);
    expect(
      todoReducer(initial, { type: "toggleSubtask", parentId: "task-1", childId: "missing" })
    ).toBe(initial);
  });

  it("deleteSubtask: deletes a child task", () => {
    const initial = stateWithTasks([
      task({
        children: [task({ id: "child-1", title: "Child" }), task({ id: "child-2", title: "Other" })]
      })
    ]);
    const next = todoReducer(initial, {
      type: "deleteSubtask",
      parentId: "task-1",
      childId: "child-1"
    });

    expect(next.tasks[0].children.map((item) => item.id)).toEqual(["child-2"]);
  });

  it("deleteSubtask: missing parentId or childId returns original state", () => {
    const initial = stateWithTasks([task({ children: [task({ id: "child-1", title: "Child" })] })]);

    expect(
      todoReducer(initial, { type: "deleteSubtask", parentId: "missing", childId: "child-1" })
    ).toBe(initial);
    expect(
      todoReducer(initial, { type: "deleteSubtask", parentId: "task-1", childId: "missing" })
    ).toBe(initial);
  });

  it("restoreTask: restores the original task at its previous position", () => {
    const restored = task({ id: "task-restored", children: [task({ id: "child-1" })] });
    const initial = stateWithTasks([task({ id: "task-a" }), task({ id: "task-b" })]);
    const next = todoReducer(initial, { type: "restoreTask", task: restored, index: 1 });

    expect(next.tasks.map((item) => item.id)).toEqual(["task-a", "task-restored", "task-b"]);
    expect(next.tasks[1]).toBe(restored);
    expect(next.tasks[1].children[0].id).toBe("child-1");
  });

  it("restoreTask: duplicate id is a no-op and out-of-range index is clamped", () => {
    const existing = task();
    const initial = stateWithTasks([existing]);
    expect(todoReducer(initial, { type: "restoreTask", task: existing, index: 0 })).toBe(initial);

    const restored = task({ id: "task-2" });
    const next = todoReducer(initial, { type: "restoreTask", task: restored, index: 99 });
    expect(next.tasks.map((item) => item.id)).toEqual(["task-1", "task-2"]);
  });

  it("restoreSubtask: restores the child at its previous position", () => {
    const restored = task({ id: "child-restored", title: "Restored" });
    const initial = stateWithTasks([
      task({ children: [task({ id: "child-a" }), task({ id: "child-b" })] })
    ]);
    const next = todoReducer(initial, {
      type: "restoreSubtask",
      parentId: "task-1",
      task: restored,
      index: 1
    });

    expect(next.tasks[0].children.map((item) => item.id)).toEqual([
      "child-a",
      "child-restored",
      "child-b"
    ]);
    expect(next.tasks[0].children[1]).toBe(restored);
  });

  it("reorderSubtasks: reorders children without touching their timestamps", () => {
    const first = task({ id: "child-first" });
    const second = task({ id: "child-second" });
    const parent = task({ children: [first, second] });
    const initial = stateWithTasks([parent]);

    const next = todoReducer(initial, {
      type: "reorderSubtasks",
      parentId: parent.id,
      orderedIds: [second.id, first.id]
    });

    expect(next.tasks[0].children).toEqual([second, first]);
    expect(next.tasks[0].updatedAt).toBe(parent.updatedAt);
    expect(next.tasks[0].children[0]).toBe(second);
  });

  it("reorderSubtasks: missing parent, invalid ids, and identical order are no-ops", () => {
    const first = task({ id: "child-first" });
    const second = task({ id: "child-second" });
    const initial = stateWithTasks([task({ children: [first, second] })]);

    expect(
      todoReducer(initial, {
        type: "reorderSubtasks",
        parentId: "missing",
        orderedIds: [second.id, first.id]
      })
    ).toBe(initial);
    expect(
      todoReducer(initial, {
        type: "reorderSubtasks",
        parentId: "task-1",
        orderedIds: [first.id, "missing"]
      })
    ).toBe(initial);
    expect(
      todoReducer(initial, {
        type: "reorderSubtasks",
        parentId: "task-1",
        orderedIds: [first.id, second.id]
      })
    ).toBe(initial);
  });

  it("restoreSubtask: missing parent or duplicate child id is a no-op", () => {
    const child = task({ id: "child-1" });
    const initial = stateWithTasks([task({ children: [child] })]);

    expect(
      todoReducer(initial, { type: "restoreSubtask", parentId: "missing", task: child, index: 0 })
    ).toBe(initial);
    expect(
      todoReducer(initial, { type: "restoreSubtask", parentId: "task-1", task: child, index: 0 })
    ).toBe(initial);
  });

  it("hydrateState: returns the provided state", () => {
    const hydrated = stateWithTasks([task({ id: "hydrated" })]);

    expect(todoReducer(stateWithTasks(), { type: "hydrateState", state: hydrated })).toBe(hydrated);
  });

  it("setWindowLayerMode: updates settings only when the mode changes", () => {
    const initial = stateWithTasks();
    const same = todoReducer(initial, { type: "setWindowLayerMode", mode: "alwaysOnTop" });
    const normal = todoReducer(initial, { type: "setWindowLayerMode", mode: "normal" });

    expect(same).toBe(initial);
    expect(normal).not.toBe(initial);
    expect(normal.settings.windowLayerMode).toBe("normal");
    expect(normal.settings.alwaysOnTop).toBe(false);
  });

  it("settings actions update only on valid, changed values", () => {
    const initial = stateWithTasks();
    const themed = todoReducer(initial, { type: "setColorTheme", theme: "citic-red" });
    const resized = todoReducer(themed, { type: "setFontSize", size: 18 });
    const compact = todoReducer(resized, { type: "setCompactMode", enabled: true });
    const collapsed = todoReducer(compact, {
      type: "setCollapseCompletedByDefault",
      enabled: true
    });

    expect(themed.settings.colorTheme).toBe("citic-red");
    expect(themed.settings.theme).toBe("light");
    expect(resized.settings.fontSize).toBe(18);
    expect(compact.settings.compactMode).toBe(true);
    expect(collapsed.settings.collapseCompletedByDefault).toBe(true);
  });

  it("settings actions return the original state for identical or invalid values", () => {
    const initial = stateWithTasks();

    expect(
      todoReducer(initial, { type: "setWindowLayerMode", mode: "floating" } as never)
    ).toBe(initial);
    expect(todoReducer(initial, { type: "setColorTheme", theme: "graphite-lime" })).toBe(initial);
    expect(todoReducer(initial, { type: "setColorTheme", theme: "neon" } as never)).toBe(initial);
    expect(todoReducer(initial, { type: "setFontSize", size: 16 })).toBe(initial);
    expect(todoReducer(initial, { type: "setFontSize", size: 11 })).toBe(initial);
    expect(todoReducer(initial, { type: "setFontSize", size: 16.5 })).toBe(initial);
    expect(todoReducer(initial, { type: "setCompactMode", enabled: false })).toBe(initial);
    expect(todoReducer(initial, { type: "setCompactMode", enabled: "yes" } as never)).toBe(initial);
    expect(
      todoReducer(initial, { type: "setCollapseCompletedByDefault", enabled: false })
    ).toBe(initial);
    expect(
      todoReducer(initial, { type: "setCollapseCompletedByDefault", enabled: 1 } as never)
    ).toBe(initial);
  });

  it("setCustomThemeColors: normalizes and stores changed colors", () => {
    const initial = stateWithTasks();
    const next = todoReducer(initial, {
      type: "setCustomThemeColors",
      colors: { canvas: "#abc", surface: "#223344", accent: "#55aa77" }
    });

    expect(next.settings.customThemeColors).toEqual({
      canvas: "#AABBCC",
      surface: "#223344",
      accent: "#55AA77"
    });
  });

  it("setCustomThemeColors: identical normalized or invalid colors are no-ops", () => {
    const initial = stateWithTasks();

    expect(
      todoReducer(initial, {
        type: "setCustomThemeColors",
        colors: { canvas: "#111318", surface: "#2b303a", accent: "#84cc16" }
      })
    ).toBe(initial);
    expect(
      todoReducer(initial, {
        type: "setCustomThemeColors",
        colors: { canvas: "#11131888", surface: "#2B303A", accent: "#84CC16" }
      })
    ).toBe(initial);
  });

  it("custom theme keeps the compatibility light/dark field in sync with the canvas", () => {
    const initial = todoReducer(stateWithTasks(), { type: "setColorTheme", theme: "custom" });
    const light = todoReducer(initial, {
      type: "setCustomThemeColors",
      colors: { canvas: "#F7F7F8", surface: "#FFFFFF", accent: "#C8102E" }
    });

    expect(initial.settings.theme).toBe("dark");
    expect(light.settings.theme).toBe("light");
  });

  it("setTaskImportant: toggles importance and identical or missing values are no-ops", () => {
    const initial = stateWithTasks([task()]);
    const important = todoReducer(initial, {
      type: "setTaskImportant",
      id: "task-1",
      important: true
    });

    expect(important.tasks[0].important).toBe(true);
    expect(
      todoReducer(important, { type: "setTaskImportant", id: "task-1", important: true })
    ).toBe(important);
    expect(
      todoReducer(initial, { type: "setTaskImportant", id: "missing", important: true })
    ).toBe(initial);
  });

  it("setTaskRecurrence: creates a daily series and identical rules are no-ops", () => {
    const initial = stateWithTasks([task()]);
    const recurring = todoReducer(initial, {
      type: "setTaskRecurrence",
      id: "task-1",
      rule: { kind: "daily" },
      today: "2026-07-13"
    });

    expect(recurring.tasks[0]).toMatchObject({
      scheduledFor: "2026-07-13",
      recurrenceSeriesId: expect.any(String)
    });
    expect(recurring.recurrenceSeries[0]).toMatchObject({
      rule: { kind: "daily" },
      activeTaskId: "task-1",
      nextOccurrenceOn: "2026-07-14",
      enabled: true
    });
    expect(
      todoReducer(recurring, {
        type: "setTaskRecurrence",
        id: "task-1",
        rule: { kind: "daily" },
        today: "2026-07-13"
      })
    ).toBe(recurring);
  });

  it("recurring completion preserves history and materializes one future occurrence", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 13, 9, 30));
    const recurring = todoReducer(stateWithTasks([task()]), {
      type: "setTaskRecurrence",
      id: "task-1",
      rule: { kind: "daily" },
      today: "2026-07-13"
    });
    const completed = todoReducer(recurring, { type: "toggleTask", id: "task-1" });
    const nextDay = todoReducer(completed, {
      type: "materializeRecurrences",
      today: "2026-07-14"
    });

    expect(completed.tasks[0]).toMatchObject({ done: true, completedOn: "2026-07-13" });
    expect(completed.recurrenceSeries[0].activeTaskId).toBeNull();
    expect(nextDay.tasks).toHaveLength(2);
    expect(nextDay.tasks[1]).toMatchObject({
      title: "Original",
      done: false,
      scheduledFor: "2026-07-14",
      recurrenceSeriesId: completed.recurrenceSeries[0].id
    });
    expect(
      todoReducer(nextDay, { type: "materializeRecurrences", today: "2026-07-14" })
    ).toBe(nextDay);
    vi.useRealTimers();
  });

  it("a recurring parent remains active until its open child is completed", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 13, 9, 30));
    const initial = stateWithTasks([
      task({ children: [task({ id: "child-1", title: "Child" })] })
    ]);
    const recurring = todoReducer(initial, {
      type: "setTaskRecurrence",
      id: "task-1",
      rule: { kind: "daily" },
      today: "2026-07-13"
    });
    const parentDone = todoReducer(recurring, { type: "toggleTask", id: "task-1" });
    const fullyDone = todoReducer(parentDone, {
      type: "toggleSubtask",
      parentId: "task-1",
      childId: "child-1"
    });

    expect(parentDone.recurrenceSeries[0].activeTaskId).toBe("task-1");
    expect(fullyDone.recurrenceSeries[0].activeTaskId).toBeNull();
    vi.useRealTimers();
  });

  it("editing a recurring task updates only its future template", () => {
    const recurring = todoReducer(stateWithTasks([task()]), {
      type: "setTaskRecurrence",
      id: "task-1",
      rule: { kind: "weekdays" },
      today: "2026-07-13"
    });
    const edited = todoReducer(recurring, {
      type: "editTask",
      id: "task-1",
      title: "Updated recurring title"
    });

    expect(edited.recurrenceSeries[0].template.title).toBe("Updated recurring title");
  });

  it("deleteTask: skip keeps the series while stop disables it", () => {
    const recurring = todoReducer(stateWithTasks([task()]), {
      type: "setTaskRecurrence",
      id: "task-1",
      rule: { kind: "daily" },
      today: "2026-07-13"
    });
    const skipped = todoReducer(recurring, {
      type: "deleteTask",
      id: "task-1",
      recurringBehavior: "skip"
    });
    const stopped = todoReducer(recurring, {
      type: "deleteTask",
      id: "task-1",
      recurringBehavior: "stop"
    });

    expect(skipped.recurrenceSeries[0]).toMatchObject({ enabled: true, activeTaskId: null });
    expect(stopped.recurrenceSeries[0]).toMatchObject({ enabled: false, activeTaskId: null });
  });

  it("setBackgroundOpacity: accepts 10-100 integers and rejects no-op or invalid values", () => {
    const initial = stateWithTasks();
    const transparent = todoReducer(initial, { type: "setBackgroundOpacity", percent: 10 });

    expect(transparent.settings.backgroundOpacityPercent).toBe(10);
    expect(todoReducer(transparent, { type: "setBackgroundOpacity", percent: 10 })).toBe(
      transparent
    );
    expect(todoReducer(initial, { type: "setBackgroundOpacity", percent: 9 })).toBe(initial);
    expect(todoReducer(initial, { type: "setBackgroundOpacity", percent: 101 })).toBe(initial);
    expect(todoReducer(initial, { type: "setBackgroundOpacity", percent: 50.5 })).toBe(initial);
  });

  it("setTaskSchedule: sets, updates, clears, and no-ops an exact deadline", () => {
    const initial = stateWithTasks([task()]);
    const deadlineAt = new Date(2026, 6, 14, 22, 0).toISOString();
    const action = {
      type: "setTaskSchedule",
      id: "task-1",
      deadlineAt,
      deadlineDisplayMode: "countdown",
      rule: null,
      today: "2026-07-14"
    } as const;
    const scheduled = todoReducer(initial, action);

    expect(scheduled.tasks[0].deadlineAt).toBe(deadlineAt);
    expect(todoReducer(scheduled, action)).toBe(scheduled);

    const cleared = todoReducer(scheduled, { ...action, deadlineAt: null });
    expect(cleared.tasks[0].deadlineAt).toBeNull();
  });

  it("setTaskSchedule: sets, changes, clears, and no-ops a standalone planned date", () => {
    const initial = stateWithTasks([task()]);
    const planned = todoReducer(initial, {
      type: "setTaskSchedule",
      id: "task-1",
      scheduledFor: "2026-07-20",
      deadlineAt: null,
      deadlineDisplayMode: "countdown",
      rule: null,
      today: "2026-07-17"
    });

    expect(planned.tasks[0].scheduledFor).toBe("2026-07-20");
    expect(
      todoReducer(planned, {
        type: "setTaskSchedule",
        id: "task-1",
        scheduledFor: "2026-07-20",
        deadlineAt: null,
        deadlineDisplayMode: "countdown",
        rule: null,
        today: "2026-07-17"
      })
    ).toBe(planned);

    const changed = todoReducer(planned, {
      type: "setTaskSchedule",
      id: "task-1",
      scheduledFor: "2026-07-21",
      deadlineAt: null,
      deadlineDisplayMode: "countdown",
      rule: null,
      today: "2026-07-17"
    });
    expect(changed.tasks[0].scheduledFor).toBe("2026-07-21");

    const cleared = todoReducer(changed, {
      type: "setTaskSchedule",
      id: "task-1",
      scheduledFor: null,
      deadlineAt: null,
      deadlineDisplayMode: "countdown",
      rule: null,
      today: "2026-07-17"
    });
    expect(cleared.tasks[0].scheduledFor).toBeNull();
  });

  it("setTaskSchedule: rejects moving a standalone task into the past", () => {
    const initial = stateWithTasks([task({ scheduledFor: "2026-07-20" })]);

    expect(
      todoReducer(initial, {
        type: "setTaskSchedule",
        id: "task-1",
        scheduledFor: "2026-07-16",
        deadlineAt: null,
        deadlineDisplayMode: "countdown",
        rule: null,
        today: "2026-07-17"
      })
    ).toBe(initial);
  });

  it("setTaskSchedule: rejects missing tasks, malformed instants, and invalid recurring offsets", () => {
    const initial = stateWithTasks([task()]);

    expect(
      todoReducer(initial, {
        type: "setTaskSchedule",
        id: "missing",
        deadlineAt: null,
        deadlineDisplayMode: "countdown",
        rule: null,
        today: "2026-07-14"
      })
    ).toBe(initial);
    expect(
      todoReducer(initial, {
        type: "setTaskSchedule",
        id: "task-1",
        deadlineAt: "2026-07-14T22:00",
        deadlineDisplayMode: "countdown",
        rule: null,
        today: "2026-07-14"
      })
    ).toBe(initial);
    expect(
      todoReducer(initial, {
        type: "setTaskSchedule",
        id: "task-1",
        deadlineAt: new Date(2026, 6, 13, 22, 0).toISOString(),
        deadlineDisplayMode: "countdown",
        rule: { kind: "daily" },
        today: "2026-07-14"
      })
    ).toBe(initial);
    expect(
      todoReducer(initial, {
        type: "setTaskSchedule",
        id: "task-1",
        deadlineAt: null,
        deadlineDisplayMode: "invalid" as never,
        rule: null,
        today: "2026-07-14"
      })
    ).toBe(initial);
  });

  it("setTaskSchedule: changes the display mode once and no-ops the same mode", () => {
    const initial = stateWithTasks([task()]);
    const action = {
      type: "setTaskSchedule",
      id: "task-1",
      deadlineAt: null,
      deadlineDisplayMode: "dateTime",
      rule: null,
      today: "2026-07-14"
    } as const;

    const changed = todoReducer(initial, action);

    expect(changed).not.toBe(initial);
    expect(changed.tasks[0].deadlineDisplayMode).toBe("dateTime");
    expect(todoReducer(changed, action)).toBe(changed);
  });

  it("setTaskSchedule: atomically stores recurrence and its deadline pattern", () => {
    const deadlineAt = new Date(2026, 6, 15, 9, 30).toISOString();
    const scheduled = todoReducer(stateWithTasks([task()]), {
      type: "setTaskSchedule",
      id: "task-1",
      deadlineAt,
      deadlineDisplayMode: "dateTime",
      rule: { kind: "daily" },
      today: "2026-07-14"
    });

    expect(scheduled.tasks[0]).toMatchObject({
      deadlineAt,
      deadlineDisplayMode: "dateTime",
      scheduledFor: "2026-07-14"
    });
    expect(scheduled.recurrenceSeries[0].template.deadlinePattern).toEqual({
      dayOffset: 1,
      localTime: "09:30"
    });
    expect(scheduled.recurrenceSeries[0].template.deadlineDisplayMode).toBe("dateTime");
  });

  it("setTaskSchedule: starts a new recurring series from its future planned date", () => {
    const scheduled = todoReducer(stateWithTasks([task()]), {
      type: "setTaskSchedule",
      id: "task-1",
      scheduledFor: "2026-07-20",
      deadlineAt: null,
      deadlineDisplayMode: "countdown",
      rule: { kind: "daily" },
      today: "2026-07-17"
    });

    expect(scheduled.tasks[0].scheduledFor).toBe("2026-07-20");
    expect(scheduled.recurrenceSeries[0]).toMatchObject({
      nextOccurrenceOn: "2026-07-21",
      activeTaskId: "task-1"
    });
  });

  it("early recurring completion keeps the next occurrence after the planned date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 18, 9, 0));
    const scheduled = todoReducer(stateWithTasks([task()]), {
      type: "setTaskSchedule",
      id: "task-1",
      scheduledFor: "2026-07-20",
      deadlineAt: null,
      deadlineDisplayMode: "countdown",
      rule: { kind: "daily" },
      today: "2026-07-17"
    });

    const completed = todoReducer(scheduled, { type: "toggleTask", id: "task-1" });

    expect(completed.tasks[0]).toMatchObject({
      done: true,
      completedOn: "2026-07-18",
      scheduledFor: "2026-07-20"
    });
    expect(completed.recurrenceSeries[0]).toMatchObject({
      activeTaskId: null,
      nextOccurrenceOn: "2026-07-21"
    });
    vi.useRealTimers();
  });

  it("importCompletionRecords: appends snapshots and rejects duplicate source refs", () => {
    const record: ArchivedCompletionRecord = {
      id: "archive-1",
      sourceRef: "task:source-1:2026-07-14T02:00:00.000Z",
      sourceTaskId: "source-1",
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
    const initial = stateWithTasks();
    const imported = todoReducer(initial, { type: "importCompletionRecords", records: [record] });

    expect(imported.archivedCompletions).toEqual([record]);
    expect(todoReducer(imported, { type: "importCompletionRecords", records: [record] })).toBe(
      imported
    );
  });

  it("removeImportedCompletionBatch: removes only the requested import batch", () => {
    const makeRecord = (id: string, batch: string): ArchivedCompletionRecord => ({
      id,
      sourceRef: `source:${id}`,
      sourceTaskId: id,
      importBatchId: batch,
      kind: "task",
      title: id,
      parentTitle: null,
      createdAt: "2026-07-14T01:00:00.000Z",
      completedAt: "2026-07-14T02:00:00.000Z",
      completedOn: "2026-07-14",
      important: false,
      scheduledFor: null,
      deadlineAt: null,
      recurrenceLabel: null
    });
    const first = makeRecord("first", "batch-1");
    const second = makeRecord("second", "batch-2");
    const initial = { ...stateWithTasks(), archivedCompletions: [first, second] };
    const next = todoReducer(initial, {
      type: "removeImportedCompletionBatch",
      importBatchId: "batch-1"
    });

    expect(next.archivedCompletions).toEqual([second]);
    expect(
      todoReducer(next, { type: "removeImportedCompletionBatch", importBatchId: "missing" })
    ).toBe(next);
  });
});
