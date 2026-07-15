import { TodoId, TodoItem } from "../domain/todoTypes";
import {
  getParentSortBucket,
  getSubtaskSortBucket
} from "../domain/todoOrdering";

export type TaskSortKind = "parent" | "subtask";

export interface TaskSortData {
  kind: TaskSortKind;
  itemId: TodoId;
  parentId?: TodoId;
  containerId: string;
  orderedIds: readonly TodoId[];
}

export interface TaskSortGroup {
  kind: TaskSortKind;
  parentId?: TodoId;
  containerId: string;
  tasks: TodoItem[];
  orderedIds: TodoId[];
  sortableIds: string[];
}

export function createParentSortGroups(
  tasks: readonly TodoItem[],
  section: "active" | "completed"
): TaskSortGroup[] {
  return createGroups(tasks, (task) => `parent:${section}:${getParentSortBucket(task)}`, "parent");
}

export function createSubtaskSortGroups(
  parentId: TodoId,
  tasks: readonly TodoItem[]
): TaskSortGroup[] {
  return createGroups(
    tasks,
    (task) => `subtask:${parentId}:${getSubtaskSortBucket(task)}`,
    "subtask",
    parentId
  );
}

export function createTaskSortData(group: TaskSortGroup, itemId: TodoId): TaskSortData {
  return {
    kind: group.kind,
    itemId,
    parentId: group.parentId,
    containerId: group.containerId,
    orderedIds: group.orderedIds
  };
}

export function getSortableItemId(
  kind: TaskSortKind,
  itemId: TodoId,
  parentId?: TodoId
): string {
  return kind === "parent" ? `parent:${itemId}` : `subtask:${parentId ?? "missing"}:${itemId}`;
}

function createGroups(
  tasks: readonly TodoItem[],
  getContainerId: (task: TodoItem) => string,
  kind: TaskSortKind,
  parentId?: TodoId
): TaskSortGroup[] {
  const tasksByContainer = new Map<string, TodoItem[]>();

  for (const task of tasks) {
    const containerId = getContainerId(task);
    const groupTasks = tasksByContainer.get(containerId);
    if (groupTasks) groupTasks.push(task);
    else tasksByContainer.set(containerId, [task]);
  }

  return Array.from(tasksByContainer, ([containerId, groupTasks]) => ({
    kind,
    parentId,
    containerId,
    tasks: groupTasks,
    orderedIds: groupTasks.map((task) => task.id),
    sortableIds: groupTasks.map((task) => getSortableItemId(kind, task.id, parentId))
  }));
}
