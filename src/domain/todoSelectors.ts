import { AppState, TodoItem } from "./todoTypes";

export function getTotalTaskCount(state: AppState): number {
  return state.tasks.reduce((total, task) => total + 1 + task.children.length, 0);
}

export function getDoneTaskCount(state: AppState): number {
  return state.tasks.reduce((total, task) => {
    const childDoneCount = task.children.filter((child) => child.done).length;
    return total + (task.done ? 1 : 0) + childDoneCount;
  }, 0);
}

export function getOpenTaskCount(state: AppState): number {
  return getTotalTaskCount(state) - getDoneTaskCount(state);
}

export function getParentSubtaskProgress(task: TodoItem): { done: number; total: number } {
  return {
    done: task.children.filter((child) => child.done).length,
    total: task.children.length
  };
}

export function getCompletionRatio(state: AppState): number {
  const total = getTotalTaskCount(state);
  if (total === 0) return 0;
  return getDoneTaskCount(state) / total;
}
