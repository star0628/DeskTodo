import { AppState, LocalDateKey, TodoItem } from "./todoTypes";

export interface DailyProgress {
  done: number;
  total: number;
}

export interface DailyCompletionEntry {
  id: string;
  title: string;
  parentTitle: string | null;
  completedAt: string;
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
      entries.push({
        id: task.id,
        title: task.title,
        parentTitle: null,
        completedAt: task.completedAt
      });
    }

    for (const child of task.children) {
      if (child.done && child.completedOn === date && child.completedAt) {
        entries.push({
          id: `${task.id}/${child.id}`,
          title: child.title,
          parentTitle: task.title,
          completedAt: child.completedAt
        });
      }
    }
  }

  return entries.sort((left, right) => left.completedAt.localeCompare(right.completedAt));
}

export function getCompletionCountByDate(state: AppState): Map<LocalDateKey, number> {
  const counts = new Map<LocalDateKey, number>();

  for (const task of state.tasks) {
    addCompletionCount(counts, task);
    for (const child of task.children) addCompletionCount(counts, child);
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
