import { describe, expect, it } from "vitest";
import { AppState, TodoItem } from "./todoTypes";
import { todoReducer } from "./todoReducer";

function stateWithTasks(tasks: TodoItem[] = []): AppState {
  return {
    schemaVersion: 1,
    tasks,
    settings: {
      alwaysOnTop: true,
      compactMode: false,
      theme: "dark",
      windowLayerMode: "alwaysOnTop"
    }
  };
}

function task(overrides: Partial<TodoItem> = {}): TodoItem {
  return {
    id: "task-1",
    title: "Original",
    done: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    children: [],
    ...overrides
  };
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
    const done = todoReducer(stateWithTasks([task()]), { type: "toggleTask", id: "task-1" });
    const open = todoReducer(done, { type: "toggleTask", id: "task-1" });

    expect(done.tasks[0].done).toBe(true);
    expect(open.tasks[0].done).toBe(false);
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
});
