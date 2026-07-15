import { AppState, LocalDateKey, TodoItem } from "./todoTypes";
import {
  getHistoryTargetAvailability,
  getHistoryTargetKey,
  HistoryDeleteTarget
} from "./historyDeletion";

export interface DailyProgress {
  done: number;
  total: number;
}

export interface DailyCompletionEntry {
  key: string;
  target: HistoryDeleteTarget;
  title: string;
  parentTitle: string | null;
  completedAt: string;
  canDelete: boolean;
  blockedReason: string | null;
}

export interface TodayTaskGroups {
  activeTasks: TodoItem[];
  completedTasks: TodoItem[];
}

export function getTodayTasks(state: AppState, today: LocalDateKey): TodoItem[] {
  const groups = getTodayTaskGroups(state, today);
  return [...groups.activeTasks, ...groups.completedTasks];
}

export function getTodayTaskGroups(state: AppState, today: LocalDateKey): TodayTaskGroups {
  const visibleTasks = state.tasks.flatMap((task) => {
    if (!isAvailableByDate(task, today)) return [];
    const visibleChildren = task.children.filter((child) => isVisibleToday(child, today));
    const children = groupOpenTasksFirst(visibleChildren);
    if (!isVisibleToday(task, today) && children.length === 0) return [];

    return hasSameOrder(children, task.children) ? [task] : [{ ...task, children }];
  });

  const activeTasks = groupOpenTasksFirst(
    visibleTasks.filter((task) => !task.done || task.children.some((child) => !child.done))
  );
  const completedTasks = visibleTasks.filter(
    (task) => task.done && task.children.every((child) => child.done)
  );
  return { activeTasks, completedTasks };
}

export function groupOpenTasksFirst(tasks: readonly TodoItem[]): TodoItem[] {
  const importantOpenTasks = tasks.filter((task) => !task.done && task.important);
  const regularOpenTasks = tasks.filter((task) => !task.done && !task.important);
  const doneTasks = tasks.filter((task) => task.done);
  return [...importantOpenTasks, ...regularOpenTasks, ...doneTasks];
}

export function getTodayProgress(state: AppState, today: LocalDateKey): DailyProgress {
  let done = 0;
  let total = 0;

  for (const task of state.tasks) {
    if (!isAvailableByDate(task, today)) continue;
    if (isVisibleToday(task, today)) {
      total += 1;
      if (task.done) done += 1;
    }

    for (const child of task.children) {
      if (isVisibleToday(child, today)) {
        total += 1;
        if (child.done) done += 1;
      }
    }
  }

  return { done, total };
}

export function getCompletedEntriesForDate(
  state: AppState,
  date: LocalDateKey
): DailyCompletionEntry[] {
  const entries: DailyCompletionEntry[] = [];

  for (const task of state.tasks) {
    if (task.done && task.completedOn === date && task.completedAt) {
      const target: HistoryDeleteTarget = { kind: "task", taskId: task.id, completedOn: date };
      const availability = getHistoryTargetAvailability(state, target);
      entries.push({
        key: getHistoryTargetKey(target),
        target,
        title: task.title,
        parentTitle: null,
        completedAt: task.completedAt,
        ...availability
      });
    }

    for (const child of task.children) {
      if (child.done && child.completedOn === date && child.completedAt) {
        const target: HistoryDeleteTarget = {
          kind: "subtask",
          parentId: task.id,
          childId: child.id,
          completedOn: date
        };
        const availability = getHistoryTargetAvailability(state, target);
        entries.push({
          key: getHistoryTargetKey(target),
          target,
          title: child.title,
          parentTitle: task.title,
          completedAt: child.completedAt,
          ...availability
        });
      }
    }
  }

  for (const record of state.archivedCompletions) {
    if (record.completedOn !== date) continue;
    const target: HistoryDeleteTarget = {
      kind: "archive",
      recordId: record.id,
      completedOn: date
    };
    const availability = getHistoryTargetAvailability(state, target);
    entries.push({
      key: getHistoryTargetKey(target),
      target,
      title: record.title,
      parentTitle: record.parentTitle,
      completedAt: record.completedAt,
      ...availability
    });
  }

  return entries.sort((left, right) => left.completedAt.localeCompare(right.completedAt));
}

export function getCompletionCountByDate(state: AppState): Map<LocalDateKey, number> {
  const counts = new Map<LocalDateKey, number>();

  for (const task of state.tasks) {
    addCompletionCount(counts, task);
    for (const child of task.children) addCompletionCount(counts, child);
  }

  for (const record of state.archivedCompletions) {
    counts.set(record.completedOn, (counts.get(record.completedOn) ?? 0) + 1);
  }

  return counts;
}

function addCompletionCount(counts: Map<LocalDateKey, number>, task: TodoItem): void {
  if (!task.done || !task.completedOn) return;
  counts.set(task.completedOn, (counts.get(task.completedOn) ?? 0) + 1);
}

function isVisibleToday(task: TodoItem, today: LocalDateKey): boolean {
  return isAvailableByDate(task, today) && (!task.done || task.completedOn === today);
}

function isAvailableByDate(task: TodoItem, today: LocalDateKey): boolean {
  return task.scheduledFor === null || task.scheduledFor <= today;
}

function hasSameOrder(left: readonly TodoItem[], right: readonly TodoItem[]): boolean {
  return left.length === right.length && left.every((task, index) => task === right[index]);
}
