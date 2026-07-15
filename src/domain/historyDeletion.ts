import {
  AppState,
  ArchivedCompletionRecord,
  LocalDateKey,
  TodoId,
  TodoItem
} from "./todoTypes";

export type HistoryDeleteTarget =
  | { kind: "task"; taskId: TodoId; completedOn: LocalDateKey }
  | { kind: "archive"; recordId: string; completedOn: LocalDateKey }
  | {
      kind: "subtask";
      parentId: TodoId;
      childId: TodoId;
      completedOn: LocalDateKey;
    };

export interface HistoryDeletionSnapshot {
  parents: Array<{ task: TodoItem; index: number }>;
  children: Array<{ parentId: TodoId; task: TodoItem; index: number }>;
  archived?: Array<{ record: ArchivedCompletionRecord; index: number }>;
}

export interface HistoryDeletionPlan {
  targets: HistoryDeleteTarget[];
  snapshot: HistoryDeletionSnapshot;
  selectedCount: number;
  deletedEntryCount: number;
  otherDateCount: number;
  focusId: TodoId;
}

export interface HistoryTargetAvailability {
  canDelete: boolean;
  blockedReason: string | null;
}

export function getHistoryTargetKey(target: HistoryDeleteTarget): string {
  if (target.kind === "task") return `task:${target.taskId}:${target.completedOn}`;
  if (target.kind === "archive") return `archive:${target.recordId}:${target.completedOn}`;
  return `subtask:${target.parentId}:${target.childId}:${target.completedOn}`;
}

export function getHistoryTargetAvailability(
  state: AppState,
  target: HistoryDeleteTarget
): HistoryTargetAvailability {
  if (target.kind === "task") {
    const task = state.tasks.find((item) => item.id === target.taskId);
    if (!task || !task.done || task.completedOn !== target.completedOn) {
      return { canDelete: false, blockedReason: "完成记录已发生变化" };
    }
    if (task.children.some((child) => !child.done)) {
      return { canDelete: false, blockedReason: "仍有未完成子任务" };
    }
    if (state.recurrenceSeries.some((series) => series.activeTaskId === task.id)) {
      return { canDelete: false, blockedReason: "当前重复实例不能从历史删除" };
    }
    return { canDelete: true, blockedReason: null };
  }

  if (target.kind === "archive") {
    const record = state.archivedCompletions.find((item) => item.id === target.recordId);
    return record?.completedOn === target.completedOn
      ? { canDelete: true, blockedReason: null }
      : { canDelete: false, blockedReason: "完成记录已发生变化" };
  }

  const parent = state.tasks.find((item) => item.id === target.parentId);
  const child = parent?.children.find((item) => item.id === target.childId);
  return child?.done && child.completedOn === target.completedOn
    ? { canDelete: true, blockedReason: null }
    : { canDelete: false, blockedReason: "完成记录已发生变化" };
}

export function createHistoryDeletionPlan(
  state: AppState,
  requestedTargets: readonly HistoryDeleteTarget[]
): HistoryDeletionPlan | null {
  if (requestedTargets.length === 0) return null;

  const uniqueTargets = Array.from(
    new Map(requestedTargets.map((target) => [getHistoryTargetKey(target), target])).values()
  );
  if (
    uniqueTargets.some(
      (target) => !getHistoryTargetAvailability(state, target).canDelete
    )
  ) {
    return null;
  }

  const selectedParentIds = new Set(
    uniqueTargets.flatMap((target) => (target.kind === "task" ? [target.taskId] : []))
  );
  const targets = uniqueTargets.filter(
    (target) => target.kind !== "subtask" || !selectedParentIds.has(target.parentId)
  );
  if (targets.length === 0) return null;

  const parents: HistoryDeletionSnapshot["parents"] = [];
  const children: HistoryDeletionSnapshot["children"] = [];
  const archived: NonNullable<HistoryDeletionSnapshot["archived"]> = [];
  let deletedEntryCount = 0;
  let otherDateCount = 0;

  for (const target of targets) {
    if (target.kind === "task") {
      const index = state.tasks.findIndex((task) => task.id === target.taskId);
      const task = state.tasks[index];
      if (!task) return null;
      parents.push({ task, index });
      deletedEntryCount += 1 + task.children.length;
      otherDateCount += task.children.filter(
        (child) => child.completedOn !== target.completedOn
      ).length;
      continue;
    }

    if (target.kind === "archive") {
      const index = state.archivedCompletions.findIndex(
        (record) => record.id === target.recordId
      );
      const record = state.archivedCompletions[index];
      if (!record) return null;
      archived.push({ record, index });
      deletedEntryCount += 1;
      continue;
    }

    const parent = state.tasks.find((task) => task.id === target.parentId);
    const index = parent?.children.findIndex((child) => child.id === target.childId) ?? -1;
    const task = index >= 0 ? parent?.children[index] : undefined;
    if (!parent || !task) return null;
    children.push({ parentId: parent.id, task, index });
    deletedEntryCount += 1;
  }

  const firstTarget = targets[0];
  return {
    targets,
    snapshot: { parents, children, archived },
    selectedCount: targets.length,
    deletedEntryCount,
    otherDateCount,
    focusId:
      firstTarget.kind === "task"
        ? firstTarget.taskId
        : firstTarget.kind === "archive"
          ? firstTarget.recordId
          : firstTarget.childId
  };
}

export function deleteHistoryEntries(
  state: AppState,
  requestedTargets: readonly HistoryDeleteTarget[]
): AppState {
  const plan = createHistoryDeletionPlan(state, requestedTargets);
  if (!plan) return state;

  const deletedParentIds = new Set(plan.snapshot.parents.map(({ task }) => task.id));
  const deletedChildIds = new Map<TodoId, Set<TodoId>>();
  for (const child of plan.snapshot.children) {
    const ids = deletedChildIds.get(child.parentId) ?? new Set<TodoId>();
    ids.add(child.task.id);
    deletedChildIds.set(child.parentId, ids);
  }

  const tasks = state.tasks.flatMap((task) => {
    if (deletedParentIds.has(task.id)) return [];
    const childIds = deletedChildIds.get(task.id);
    if (!childIds) return [task];
    return [{ ...task, children: task.children.filter((child) => !childIds.has(child.id)) }];
  });

  const deletedArchiveIds = new Set(
    (plan.snapshot.archived ?? []).map(({ record }) => record.id)
  );

  return {
    ...state,
    tasks,
    archivedCompletions: state.archivedCompletions.filter(
      (record) => !deletedArchiveIds.has(record.id)
    )
  };
}

export function restoreHistoryEntries(
  state: AppState,
  snapshot: HistoryDeletionSnapshot
): AppState {
  if (
    snapshot.parents.length === 0 &&
    snapshot.children.length === 0 &&
    (snapshot.archived?.length ?? 0) === 0
  ) {
    return state;
  }

  const parentIds = new Set(state.tasks.map((task) => task.id));
  const snapshotParentIds = new Set<TodoId>();
  for (const { task } of snapshot.parents) {
    if (parentIds.has(task.id) || snapshotParentIds.has(task.id)) return state;
    snapshotParentIds.add(task.id);
    parentIds.add(task.id);
  }

  const childKeys = new Set<string>();
  for (const item of snapshot.children) {
    const parent = state.tasks.find((task) => task.id === item.parentId);
    if (!parent || parent.children.some((child) => child.id === item.task.id)) return state;
    const key = `${item.parentId}:${item.task.id}`;
    if (childKeys.has(key)) return state;
    childKeys.add(key);
  }


  const archiveIds = new Set(state.archivedCompletions.map((record) => record.id));
  const archiveSourceRefs = new Set(
    state.archivedCompletions.map((record) => record.sourceRef)
  );
  for (const { record } of snapshot.archived ?? []) {
    if (archiveIds.has(record.id) || archiveSourceRefs.has(record.sourceRef)) return state;
    archiveIds.add(record.id);
    archiveSourceRefs.add(record.sourceRef);
  }

  const tasks = [...state.tasks];
  for (const item of [...snapshot.parents].sort((left, right) => left.index - right.index)) {
    tasks.splice(clampIndex(item.index, tasks.length), 0, item.task);
  }

  const childrenByParent = new Map<TodoId, HistoryDeletionSnapshot["children"]>();
  for (const item of snapshot.children) {
    const children = childrenByParent.get(item.parentId) ?? [];
    children.push(item);
    childrenByParent.set(item.parentId, children);
  }

  const restoredTasks = tasks.map((task) => {
    const restoredChildren = childrenByParent.get(task.id);
    if (!restoredChildren) return task;
    const children = [...task.children];
    for (const item of [...restoredChildren].sort((left, right) => left.index - right.index)) {
      children.splice(clampIndex(item.index, children.length), 0, item.task);
    }
    return { ...task, children };
  });

  const archivedCompletions = [...state.archivedCompletions];
  for (const item of [...(snapshot.archived ?? [])].sort((left, right) => left.index - right.index)) {
    archivedCompletions.splice(
      clampIndex(item.index, archivedCompletions.length),
      0,
      item.record
    );
  }

  return { ...state, tasks: restoredTasks, archivedCompletions };
}

function clampIndex(index: number, length: number): number {
  return Math.min(Math.max(index, 0), length);
}
