import { TodoId, TodoItem } from "./todoTypes";

export type ParentSortBucket =
  | "important-open"
  | "regular-open"
  | "done-parent-with-open-child"
  | "completed";

export type SubtaskSortBucket = "open" | "completed";

export function getParentSortBucket(task: TodoItem): ParentSortBucket {
  if (!task.done) return task.important ? "important-open" : "regular-open";
  return task.children.some((child) => !child.done)
    ? "done-parent-with-open-child"
    : "completed";
}

export function getSubtaskSortBucket(task: TodoItem): SubtaskSortBucket {
  return task.done ? "completed" : "open";
}

export function reorderSubset<T extends { id: TodoId }>(
  items: readonly T[],
  orderedIds: readonly TodoId[]
): readonly T[] {
  if (orderedIds.length < 2 || new Set(orderedIds).size !== orderedIds.length) return items;

  const requestedIds = new Set(orderedIds);
  const positions: number[] = [];
  const itemsById = new Map<TodoId, T>();

  items.forEach((item, index) => {
    if (!requestedIds.has(item.id)) return;
    positions.push(index);
    itemsById.set(item.id, item);
  });

  if (positions.length !== orderedIds.length || itemsById.size !== orderedIds.length) return items;

  const currentIds = positions.map((index) => items[index].id);
  if (currentIds.every((id, index) => id === orderedIds[index])) return items;

  const nextItems = [...items];
  positions.forEach((position, index) => {
    nextItems[position] = itemsById.get(orderedIds[index]) as T;
  });
  return nextItems;
}
