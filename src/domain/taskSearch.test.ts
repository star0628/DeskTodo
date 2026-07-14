import { describe, expect, it } from "vitest";
import { fallbackDefaultState } from "../persistence/appStateSchema";
import { normalizeSearchText, searchTasks } from "./taskSearch";
import { AppState, TodoItem } from "./todoTypes";

describe("taskSearch", () => {
  it("normalizes full-width characters, whitespace, and English case", () => {
    expect(normalizeSearchText("  ＡＢＣ   Report  ")).toBe("abc report");
  });

  it("searches parent and child titles with parent context", () => {
    const appState = state([
      task({
        id: "parent",
        title: "季度报告",
        children: [task({ id: "child", title: "核对 Report 数据" })]
      })
    ]);

    expect(searchTasks(appState, "报告", "2026-07-13")).toEqual([
      expect.objectContaining({ id: "parent", title: "季度报告", parentTitle: null })
    ]);
    expect(searchTasks(appState, "report", "2026-07-13")).toEqual([
      expect.objectContaining({ id: "parent/child", title: "核对 Report 数据", parentTitle: "季度报告" })
    ]);
  });

  it("supports emoji and completed-only filtering", () => {
    const appState = state([
      task({ id: "open", title: "发布 🚀" }),
      task({
        id: "done",
        title: "复盘 🚀",
        done: true,
        completedAt: "2026-07-12T10:00:00.000Z",
        completedOn: "2026-07-12"
      })
    ]);

    expect(searchTasks(appState, "🚀", "2026-07-13", "completed")).toEqual([
      expect.objectContaining({ id: "done", status: "completed", completedOn: "2026-07-12" })
    ]);
  });

  it("classifies future recurring work as scheduled", () => {
    const appState = state([
      task({
        id: "future",
        title: "周报",
        scheduledFor: "2026-07-15",
        recurrenceSeriesId: "series-1"
      })
    ]);

    expect(searchTasks(appState, "周报", "2026-07-13")[0]).toMatchObject({
      status: "scheduled",
      scheduledFor: "2026-07-15"
    });
  });

  it("ranks prefix matches before contained matches and important open tasks first", () => {
    const appState = state([
      task({ id: "contained", title: "完成月度报告" }),
      task({ id: "normal", title: "报告整理" }),
      task({ id: "important", title: "报告复核", important: true })
    ]);

    expect(searchTasks(appState, "报告", "2026-07-13").map((result) => result.id)).toEqual([
      "important",
      "normal",
      "contained"
    ]);
  });

  it("returns an empty result for blank queries", () => {
    expect(searchTasks(state([task()]), "   ", "2026-07-13")).toEqual([]);
  });
});

function state(tasks: TodoItem[]): AppState {
  return { ...fallbackDefaultState(), tasks };
}

function task(overrides: Partial<TodoItem> = {}): TodoItem {
  const result: TodoItem = {
    id: "task",
    title: "Task",
    done: false,
    createdAt: "2026-07-13T08:00:00.000Z",
    updatedAt: "2026-07-13T08:00:00.000Z",
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
  return result;
}
