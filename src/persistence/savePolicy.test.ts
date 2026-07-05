import { describe, expect, it } from "vitest";
import { todoReducer } from "../domain/todoReducer";
import { AppState, TodoItem } from "../domain/todoTypes";
import { fallbackDefaultState } from "./appStateSchema";
import { LoadStatus } from "./appStateRepository";
import { shouldSaveTodoMutation } from "./savePolicy";

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
});
