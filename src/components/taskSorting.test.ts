import { describe, expect, it } from "vitest";
import { TodoItem } from "../domain/todoTypes";
import { createParentSortGroups, createSubtaskSortGroups } from "./taskSorting";

describe("task sorting groups", () => {
  it("keeps important, regular, and completed parent tasks in separate containers", () => {
    const groups = createParentSortGroups(
      [
        task("important", { important: true }),
        task("regular"),
        task("done-with-open-child", {
          done: true,
          children: [task("open-child")]
        }),
        task("completed", { done: true })
      ],
      "active"
    );

    expect(groups.map((group) => group.containerId)).toEqual([
      "parent:active:important-open",
      "parent:active:regular-open",
      "parent:active:done-parent-with-open-child",
      "parent:active:completed"
    ]);
    expect(groups.flatMap((group) => group.orderedIds)).toEqual([
      "important",
      "regular",
      "done-with-open-child",
      "completed"
    ]);
  });

  it("keeps open and completed subtasks separate without allowing reparenting", () => {
    const groups = createSubtaskSortGroups("parent-1", [
      task("open-a"),
      task("open-b"),
      task("done", { done: true })
    ]);

    expect(groups.map((group) => group.containerId)).toEqual([
      "subtask:parent-1:open",
      "subtask:parent-1:completed"
    ]);
    expect(groups[0].sortableIds).toEqual([
      "subtask:parent-1:open-a",
      "subtask:parent-1:open-b"
    ]);
  });
});

function task(id: string, overrides: Partial<TodoItem> = {}): TodoItem {
  return {
    id,
    title: id,
    done: false,
    createdAt: "2026-07-14T00:00:00.000Z",
    updatedAt: "2026-07-14T00:00:00.000Z",
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
}
