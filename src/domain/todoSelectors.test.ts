import { describe, expect, it } from "vitest";
import {
  getCompletionRatio,
  getDoneTaskCount,
  getOpenTaskCount,
  getParentSubtaskProgress,
  getTotalTaskCount
} from "./todoSelectors";
import { AppState, TodoItem } from "./todoTypes";

function task(id: string, done: boolean, children: TodoItem[] = []): TodoItem {
  return {
    id,
    title: id,
    done,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    children
  };
}

function state(tasks: TodoItem[]): AppState {
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

describe("todoSelectors", () => {
  it("returns zero counts and ratio for an empty state", () => {
    const appState = state([]);

    expect(getTotalTaskCount(appState)).toBe(0);
    expect(getDoneTaskCount(appState)).toBe(0);
    expect(getOpenTaskCount(appState)).toBe(0);
    expect(getCompletionRatio(appState)).toBe(0);
  });

  it("counts total, done, and open tasks including children", () => {
    const appState = state([
      task("parent-1", true, [task("child-1", true), task("child-2", false)]),
      task("parent-2", false)
    ]);

    expect(getTotalTaskCount(appState)).toBe(4);
    expect(getDoneTaskCount(appState)).toBe(2);
    expect(getOpenTaskCount(appState)).toBe(2);
    expect(getCompletionRatio(appState)).toBe(0.5);
  });

  it("returns parent subtask progress", () => {
    const parent = task("parent-1", false, [task("child-1", true), task("child-2", false)]);

    expect(getParentSubtaskProgress(parent)).toEqual({ done: 1, total: 2 });
  });

  it("counts completed children when parent remains open", () => {
    const appState = state([task("parent-1", false, [task("child-1", true), task("child-2", true)])]);

    expect(getTotalTaskCount(appState)).toBe(3);
    expect(getDoneTaskCount(appState)).toBe(2);
    expect(getOpenTaskCount(appState)).toBe(1);
    expect(getCompletionRatio(appState)).toBe(2 / 3);
  });

  it("counts completed parent separately from open children", () => {
    const appState = state([task("parent-1", true, [task("child-1", false), task("child-2", false)])]);

    expect(getTotalTaskCount(appState)).toBe(3);
    expect(getDoneTaskCount(appState)).toBe(1);
    expect(getOpenTaskCount(appState)).toBe(2);
    expect(getCompletionRatio(appState)).toBe(1 / 3);
  });
});
