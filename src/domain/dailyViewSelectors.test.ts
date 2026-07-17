import { describe, expect, it } from "vitest";
import { fallbackDefaultState } from "../persistence/appStateSchema";
import {
  getCompletedEntriesForDate,
  getCompletionCountByDate,
  getDateViewMode,
  getFutureProgress,
  getFutureTaskGroups,
  getScheduledCountByDate,
  getTodayProgress,
  getTodayTaskGroups,
  getTodayTasks,
  groupOpenTasksFirst
} from "./dailyViewSelectors";
import { AppState, TodoItem } from "./todoTypes";

function task(
  id: string,
  completedOn: string | null,
  children: TodoItem[] = [],
  completedAt = completedOn ? `${completedOn}T08:00:00.000Z` : null
): TodoItem {
  return {
    id,
    title: id,
    done: completedOn !== null,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: completedAt ?? "2026-07-01T00:00:00.000Z",
    completedAt,
    completedOn,
    important: false,
    scheduledFor: null,
    deadlineAt: null,
    deadlineDisplayMode: "countdown",
    recurrenceSeriesId: null,
    children
  };
}

function state(tasks: TodoItem[]): AppState {
  return { ...fallbackDefaultState(), tasks };
}

describe("dailyViewSelectors", () => {
  it("classifies past, today, and future date views", () => {
    expect(getDateViewMode("2026-07-12", "2026-07-13")).toBe("past");
    expect(getDateViewMode("2026-07-13", "2026-07-13")).toBe("today");
    expect(getDateViewMode("2026-07-14", "2026-07-13")).toBe("future");
  });

  it("today contains all open work and tasks completed today", () => {
    const appState = state([
      task("open-old", null),
      task("done-today", "2026-07-13"),
      task("done-yesterday", "2026-07-12")
    ]);

    expect(getTodayTasks(appState, "2026-07-13").map((item) => item.id)).toEqual([
      "open-old",
      "done-today"
    ]);
    expect(getTodayProgress(appState, "2026-07-13")).toEqual({ done: 1, total: 2 });
  });

  it("places completed parent tasks after all open parent tasks", () => {
    const visible = getTodayTasks(
      state([
        task("done-first", "2026-07-13"),
        task("open-first", null),
        task("done-second", "2026-07-13"),
        task("open-second", null)
      ]),
      "2026-07-13"
    );

    expect(visible.map((item) => item.id)).toEqual([
      "open-first",
      "open-second",
      "done-first",
      "done-second"
    ]);
  });

  it("places important open parents before regular open parents without mutation", () => {
    const regular = task("regular", null);
    const important = { ...task("important", null), important: true };
    const source = [regular, important];

    expect(getTodayTasks(state(source), "2026-07-13").map((item) => item.id)).toEqual([
      "important",
      "regular"
    ]);
    expect(source).toEqual([regular, important]);
  });

  it("hides future recurring occurrences until their scheduled date", () => {
    const future = {
      ...task("future", null),
      scheduledFor: "2026-07-14",
      recurrenceSeriesId: "series-1"
    };

    expect(getTodayTasks(state([future]), "2026-07-13")).toEqual([]);
    expect(getTodayProgress(state([future]), "2026-07-13")).toEqual({ done: 0, total: 0 });
    expect(getTodayTasks(state([future]), "2026-07-14").map((item) => item.id)).toEqual([
      "future"
    ]);
  });

  it("shows standalone future work only on its exact planned date", () => {
    const planned = {
      ...task("future", null, [task("child", null)]),
      scheduledFor: "2026-07-20"
    };
    const appState = state([planned, task("backlog", null)]);

    expect(getFutureTaskGroups(appState, "2026-07-19").activeTasks).toEqual([]);
    expect(
      getFutureTaskGroups(appState, "2026-07-20").activeTasks.map((item) => item.id)
    ).toEqual(["future"]);
    expect(getFutureProgress(appState, "2026-07-20")).toEqual({ done: 0, total: 2 });
  });

  it("carries an unfinished planned task into today after its date passes", () => {
    const overdue = {
      ...task("overdue", null),
      scheduledFor: "2026-07-12"
    };

    expect(getTodayTasks(state([overdue]), "2026-07-13").map((item) => item.id)).toEqual([
      "overdue"
    ]);
    expect(getTodayProgress(state([overdue]), "2026-07-13")).toEqual({
      done: 0,
      total: 1
    });
  });

  it("keeps an early completion visible on both its actual and planned dates", () => {
    const completedEarly = {
      ...task("early", "2026-07-18"),
      scheduledFor: "2026-07-20"
    };
    const appState = state([completedEarly]);

    expect(getTodayTaskGroups(appState, "2026-07-18").completedTasks[0].id).toBe("early");
    expect(getFutureTaskGroups(appState, "2026-07-20").completedTasks[0].id).toBe("early");
    expect(getFutureProgress(appState, "2026-07-20")).toEqual({ done: 1, total: 1 });
  });

  it("counts parent and inherited child work on future calendar dates", () => {
    const appState = state([
      {
        ...task("future", null, [task("child", null)]),
        scheduledFor: "2026-07-20"
      },
      {
        ...task("later", null),
        scheduledFor: "2026-07-21"
      },
      {
        ...task("overdue", null),
        scheduledFor: "2026-07-12"
      }
    ]);

    expect(Array.from(getScheduledCountByDate(appState, "2026-07-13").entries())).toEqual([
      ["2026-07-20", 2],
      ["2026-07-21", 1]
    ]);
  });

  it("separates fully completed parents into the completed group", () => {
    const groups = getTodayTaskGroups(
      state([task("done", "2026-07-13"), task("open", null)]),
      "2026-07-13"
    );

    expect(groups.activeTasks.map((item) => item.id)).toEqual(["open"]);
    expect(groups.completedTasks.map((item) => item.id)).toEqual(["done"]);
  });

  it("keeps a completed parent with an open child outside the collapsed group", () => {
    const groups = getTodayTaskGroups(
      state([
        task("completed-parent", "2026-07-13", [task("open-child", null)]),
        task("fully-completed", "2026-07-13")
      ]),
      "2026-07-13"
    );

    expect(groups.activeTasks.map((item) => item.id)).toEqual(["completed-parent"]);
    expect(groups.completedTasks.map((item) => item.id)).toEqual(["fully-completed"]);
  });

  it("preserves relative order within open and completed groups", () => {
    const tasks = [
      task("done-a", "2026-07-13"),
      task("open-a", null),
      task("open-b", null),
      task("done-b", "2026-07-13")
    ];

    expect(groupOpenTasksFirst(tasks).map((item) => item.id)).toEqual([
      "open-a",
      "open-b",
      "done-a",
      "done-b"
    ]);
  });

  it("does not mutate the source task array while grouping", () => {
    const tasks = [task("done", "2026-07-13"), task("open", null)];
    const snapshot = [...tasks];

    const grouped = groupOpenTasksFirst(tasks);

    expect(tasks).toEqual(snapshot);
    expect(tasks[0]).toBe(snapshot[0]);
    expect(grouped).not.toBe(tasks);
  });

  it("places completed subtasks after open subtasks", () => {
    const parent = task("parent", null, [
      task("done-child-a", "2026-07-13"),
      task("open-child-a", null),
      task("done-child-b", "2026-07-13"),
      task("open-child-b", null)
    ]);

    const [visibleParent] = getTodayTasks(state([parent]), "2026-07-13");

    expect(visibleParent.children.map((child) => child.id)).toEqual([
      "open-child-a",
      "open-child-b",
      "done-child-a",
      "done-child-b"
    ]);
    expect(parent.children.map((child) => child.id)).toEqual([
      "done-child-a",
      "open-child-a",
      "done-child-b",
      "open-child-b"
    ]);
  });

  it("keeps original task references when no filtering or reordering is needed", () => {
    const parent = task("parent", null, [task("open-child", null)]);

    const visible = getTodayTasks(state([parent]), "2026-07-13");

    expect(visible[0]).toBe(parent);
    expect(visible[0].children).toBe(parent.children);
  });

  it("places a completed parent at the bottom even when it provides open-child context", () => {
    const completedParent = task("completed-parent", "2026-07-13", [
      task("open-child", null)
    ]);
    const openParent = task("open-parent", null);

    const visible = getTodayTasks(state([completedParent, openParent]), "2026-07-13");

    expect(visible.map((item) => item.id)).toEqual(["open-parent", "completed-parent"]);
    expect(visible[1].children[0].id).toBe("open-child");
  });

  it("keeps a parent as context when it has a visible open child", () => {
    const parent = task("parent", "2026-07-12", [
      task("done-child", "2026-07-12"),
      task("open-child", null)
    ]);

    const visible = getTodayTasks(state([parent]), "2026-07-13");
    expect(visible).toHaveLength(1);
    expect(visible[0].children.map((child) => child.id)).toEqual(["open-child"]);
    expect(getTodayProgress(state([parent]), "2026-07-13")).toEqual({ done: 0, total: 1 });
  });

  it("history returns only work completed on the selected date", () => {
    const entries = getCompletedEntriesForDate(
      state([task("first", "2026-07-12"), task("second", "2026-07-13")]),
      "2026-07-12"
    );

    expect(entries.map((entry) => entry.title)).toEqual(["first"]);
  });

  it("counts parent and child completions by local date", () => {
    const counts = getCompletionCountByDate(
      state([
        task("parent", "2026-07-13", [
          task("child-same-day", "2026-07-13"),
          task("child-previous-day", "2026-07-12")
        ]),
        task("open", null)
      ])
    );

    expect(Array.from(counts.entries())).toEqual([
      ["2026-07-13", 2],
      ["2026-07-12", 1]
    ]);
  });

  it("history flattens completed children with parent context", () => {
    const parent = task("parent", null, [task("child", "2026-07-13")]);
    const entries = getCompletedEntriesForDate(state([parent]), "2026-07-13");

    expect(entries).toEqual([
      {
        key: "subtask:parent:child:2026-07-13",
        target: {
          kind: "subtask",
          parentId: "parent",
          childId: "child",
          completedOn: "2026-07-13"
        },
        title: "child",
        parentTitle: "parent",
        completedAt: "2026-07-13T08:00:00.000Z",
        canDelete: true,
        blockedReason: null
      }
    ]);
  });

  it("history sorts completion records by completion timestamp", () => {
    const entries = getCompletedEntriesForDate(
      state([
        task("later", "2026-07-13", [], "2026-07-13T10:00:00.000Z"),
        task("earlier", "2026-07-13", [], "2026-07-13T08:00:00.000Z")
      ]),
      "2026-07-13"
    );

    expect(entries.map((entry) => entry.title)).toEqual(["earlier", "later"]);
  });

  it("keeps history ordered by completion time rather than today-list grouping", () => {
    const entries = getCompletedEntriesForDate(
      state([
        task("second", "2026-07-13", [], "2026-07-13T09:00:00.000Z"),
        task("first", "2026-07-13", [], "2026-07-13T08:00:00.000Z")
      ]),
      "2026-07-13"
    );

    expect(entries.map((entry) => entry.target)).toEqual([
      { kind: "task", taskId: "first", completedOn: "2026-07-13" },
      { kind: "task", taskId: "second", completedOn: "2026-07-13" }
    ]);
  });

  it("marks completed parents with open children as unsafe to delete from history", () => {
    const entries = getCompletedEntriesForDate(
      state([task("parent", "2026-07-13", [task("open-child", null)])]),
      "2026-07-13"
    );

    expect(entries[0]).toMatchObject({
      canDelete: false,
      blockedReason: "仍有未完成子任务"
    });
  });

  it("includes imported completion records in history and calendar counts only", () => {
    const appState: AppState = {
      ...fallbackDefaultState(),
      archivedCompletions: [
        {
          id: "archive-1",
          sourceRef: "source-1",
          sourceTaskId: "task-1",
          importBatchId: "batch-1",
          kind: "subtask",
          title: "导入子任务",
          parentTitle: "导入父任务",
          createdAt: "2026-07-13T07:00:00.000Z",
          completedAt: "2026-07-13T08:00:00.000Z",
          completedOn: "2026-07-13",
          important: false,
          scheduledFor: null,
          deadlineAt: null,
          recurrenceLabel: null
        }
      ]
    };

    expect(getTodayTasks(appState, "2026-07-13")).toEqual([]);
    expect(getCompletedEntriesForDate(appState, "2026-07-13")[0]).toMatchObject({
      title: "导入子任务",
      parentTitle: "导入父任务",
      target: { kind: "archive", recordId: "archive-1" }
    });
    expect(getCompletionCountByDate(appState).get("2026-07-13")).toBe(1);
  });
});
