import { AppState, LocalDateKey, TodoItem } from "./todoTypes";

export type TaskSearchFilter = "all" | "open" | "completed";
export type TaskSearchStatus = "open" | "scheduled" | "completed";

export interface TaskSearchResult {
  id: string;
  taskId: string;
  parentId: string | null;
  parentTitle: string | null;
  title: string;
  status: TaskSearchStatus;
  important: boolean;
  completedAt: string | null;
  completedOn: LocalDateKey | null;
  scheduledFor: LocalDateKey | null;
  recurrenceSeriesId: string | null;
}

export function searchTasks(
  state: AppState,
  query: string,
  today: LocalDateKey,
  filter: TaskSearchFilter = "all"
): TaskSearchResult[] {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return [];

  const results: Array<TaskSearchResult & { rank: number; sourceIndex: number }> = [];
  let sourceIndex = 0;

  for (const task of state.tasks) {
    addResult(results, task, null, null, task.scheduledFor, normalizedQuery, today, sourceIndex++);
    for (const child of task.children) {
      addResult(
        results,
        child,
        task.id,
        task.title,
        task.scheduledFor,
        normalizedQuery,
        today,
        sourceIndex++
      );
    }
  }

  return results
    .filter((result) => {
      if (filter === "open") return result.status !== "completed";
      if (filter === "completed") return result.status === "completed";
      return true;
    })
    .sort(compareSearchResults)
    .map(({ rank: _rank, sourceIndex: _sourceIndex, ...result }) => result);
}

export function normalizeSearchText(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("zh-CN");
}

function addResult(
  results: Array<TaskSearchResult & { rank: number; sourceIndex: number }>,
  task: TodoItem,
  parentId: string | null,
  parentTitle: string | null,
  scheduledFor: LocalDateKey | null,
  query: string,
  today: LocalDateKey,
  sourceIndex: number
): void {
  const normalizedTitle = normalizeSearchText(task.title);
  const matchIndex = normalizedTitle.indexOf(query);
  if (matchIndex < 0) return;

  const status: TaskSearchStatus = task.done
    ? "completed"
    : scheduledFor !== null && scheduledFor > today
      ? "scheduled"
      : "open";
  results.push({
    id: parentId ? `${parentId}/${task.id}` : task.id,
    taskId: task.id,
    parentId,
    parentTitle,
    title: task.title,
    status,
    important: parentId === null && task.important,
    completedAt: task.completedAt,
    completedOn: task.completedOn,
    scheduledFor,
    recurrenceSeriesId: parentId === null ? task.recurrenceSeriesId : null,
    rank: matchIndex === 0 ? 0 : 1,
    sourceIndex
  });
}

function compareSearchResults(
  left: TaskSearchResult & { rank: number; sourceIndex: number },
  right: TaskSearchResult & { rank: number; sourceIndex: number }
): number {
  if (left.rank !== right.rank) return left.rank - right.rank;

  const statusRank: Record<TaskSearchStatus, number> = {
    open: 0,
    scheduled: 1,
    completed: 2
  };
  const statusDifference = statusRank[left.status] - statusRank[right.status];
  if (statusDifference !== 0) return statusDifference;

  if (left.status === "completed" && right.status === "completed") {
    const completionDifference = (right.completedAt ?? "").localeCompare(left.completedAt ?? "");
    if (completionDifference !== 0) return completionDifference;
  }
  if (left.important !== right.important) return left.important ? -1 : 1;
  return left.sourceIndex - right.sourceIndex;
}
