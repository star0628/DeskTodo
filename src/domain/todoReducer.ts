import {
  createRecurrenceTemplate,
  getNextOccurrenceDate,
  materializeDueRecurrences,
  normalizeRecurrenceRule,
  recurrenceRulesEqual
} from "./recurrence";
import { getIsoTimestamp, isLocalDateKey, toLocalDateKey } from "../utils/date";
import { createId } from "../utils/ids";
import {
  createDeadlinePattern,
  isDeadlineDisplayMode,
  isValidDeadlineInstant
} from "./deadline";
import {
  AppState,
  ArchivedCompletionRecord,
  ColorThemeId,
  CustomThemeColors,
  DeadlineDisplayMode,
  LocalDateKey,
  MAX_BACKGROUND_OPACITY,
  MAX_FONT_SIZE,
  MIN_BACKGROUND_OPACITY,
  MIN_FONT_SIZE,
  RecurrenceRule,
  RecurrenceSeries,
  TodoId,
  TodoItem,
  WindowLayerMode
} from "./todoTypes";
import {
  customThemeColorsEqual,
  getColorScheme,
  normalizeCustomThemeColors
} from "../settings/customTheme";
import { reorderSubset } from "./todoOrdering";
import {
  deleteHistoryEntries,
  HistoryDeleteTarget,
  HistoryDeletionSnapshot,
  restoreHistoryEntries
} from "./historyDeletion";

export type RecurringDeleteBehavior = "skip" | "stop";

export type TodoAction =
  | {
      type: "addTask";
      title: string;
      scheduledFor?: LocalDateKey | null;
      today?: LocalDateKey;
    }
  | { type: "editTask"; id: TodoId; title: string }
  | { type: "toggleTask"; id: TodoId }
  | { type: "deleteTask"; id: TodoId; recurringBehavior?: RecurringDeleteBehavior }
  | { type: "addSubtask"; parentId: TodoId; title: string }
  | { type: "editSubtask"; parentId: TodoId; childId: TodoId; title: string }
  | { type: "toggleSubtask"; parentId: TodoId; childId: TodoId }
  | { type: "deleteSubtask"; parentId: TodoId; childId: TodoId }
  | { type: "deleteHistoryEntries"; targets: readonly HistoryDeleteTarget[] }
  | { type: "restoreHistoryEntries"; snapshot: HistoryDeletionSnapshot }
  | { type: "importCompletionRecords"; records: readonly ArchivedCompletionRecord[] }
  | { type: "removeImportedCompletionBatch"; importBatchId: string }
  | { type: "reorderTasks"; orderedIds: readonly TodoId[] }
  | { type: "reorderSubtasks"; parentId: TodoId; orderedIds: readonly TodoId[] }
  | { type: "restoreTask"; task: TodoItem; index: number; series?: RecurrenceSeries }
  | { type: "restoreSubtask"; parentId: TodoId; task: TodoItem; index: number }
  | { type: "setTaskImportant"; id: TodoId; important: boolean }
  | { type: "setTaskRecurrence"; id: TodoId; rule: RecurrenceRule | null; today: LocalDateKey }
  | {
      type: "setTaskSchedule";
      id: TodoId;
      deadlineAt: string | null;
      deadlineDisplayMode: DeadlineDisplayMode;
      rule: RecurrenceRule | null;
      scheduledFor?: LocalDateKey | null;
      today: LocalDateKey;
    }
  | { type: "materializeRecurrences"; today: LocalDateKey }
  | { type: "setWindowLayerMode"; mode: WindowLayerMode }
  | { type: "setColorTheme"; theme: ColorThemeId }
  | { type: "setCustomThemeColors"; colors: CustomThemeColors }
  | { type: "setFontSize"; size: number }
  | { type: "setBackgroundOpacity"; percent: number }
  | { type: "setCompactMode"; enabled: boolean }
  | { type: "setCollapseCompletedByDefault"; enabled: boolean }
  | { type: "hydrateState"; state: AppState };

interface CreateTodoItemOptions {
  timestamp?: string;
  scheduledFor?: LocalDateKey | null;
}

export function createTodoItem(
  title: string,
  { timestamp = getIsoTimestamp(), scheduledFor = null }: CreateTodoItemOptions = {}
): TodoItem {
  return {
    id: createId(),
    title,
    done: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    completedAt: null,
    completedOn: null,
    important: false,
    scheduledFor,
    deadlineAt: null,
    deadlineDisplayMode: "countdown",
    recurrenceSeriesId: null,
    children: []
  };
}

export function todoReducer(state: AppState, action: TodoAction): AppState {
  switch (action.type) {
    case "hydrateState":
      return action.state;

    case "addTask": {
      const title = normalizeTitle(action.title);
      if (!title) return state;
      const scheduledFor = action.scheduledFor ?? null;
      if (
        scheduledFor !== null &&
        (!isLocalDateKey(scheduledFor) ||
          !isLocalDateKey(action.today) ||
          scheduledFor < action.today)
      ) {
        return state;
      }
      return {
        ...state,
        tasks: [...state.tasks, createTodoItem(title, { scheduledFor })]
      };
    }

    case "editTask": {
      const title = normalizeTitle(action.title);
      if (!title) return state;
      const task = state.tasks.find((item) => item.id === action.id);
      if (!task || task.title === title) return state;
      const timestamp = getIsoTimestamp();
      const tasks = state.tasks.map((item) =>
        item.id === action.id ? { ...item, title, updatedAt: timestamp } : item
      );
      return withSyncedSeriesTemplate(state, tasks, action.id, timestamp);
    }

    case "toggleTask": {
      const task = state.tasks.find((item) => item.id === action.id);
      if (!task) return state;
      const series = getEnabledSeries(state, task.recurrenceSeriesId);
      if (
        task.done &&
        series &&
        series.activeTaskId !== null &&
        series.activeTaskId !== task.id
      ) {
        return state;
      }

      const timestamp = getIsoTimestamp();
      const done = !task.done;
      const updatedTask: TodoItem = {
        ...task,
        done,
        updatedAt: timestamp,
        completedAt: done ? timestamp : null,
        completedOn: done ? toLocalDateKey(new Date(timestamp)) : null
      };
      const tasks = state.tasks.map((item) => (item.id === action.id ? updatedTask : item));
      return withRecurringLifecycle(state, tasks, updatedTask, timestamp);
    }

    case "deleteTask": {
      const task = state.tasks.find((item) => item.id === action.id);
      if (!task) return state;
      const timestamp = getIsoTimestamp();
      const series = getEnabledSeries(state, task.recurrenceSeriesId);
      const recurrenceSeries = series
        ? state.recurrenceSeries.map((item) =>
            item.id === series.id
              ? action.recurringBehavior === "skip"
                ? {
                    ...item,
                    activeTaskId: null,
                    nextOccurrenceOn: getNextOccurrenceDate(
                      item.rule,
                      getRecurrenceAnchor(task, toLocalDateKey(new Date(timestamp)))
                    ),
                    template: createRecurrenceTemplate(task),
                    updatedAt: timestamp
                  }
                : { ...item, enabled: false, activeTaskId: null, updatedAt: timestamp }
              : item
          )
        : state.recurrenceSeries;
      return {
        ...state,
        tasks: state.tasks.filter((item) => item.id !== action.id),
        recurrenceSeries
      };
    }

    case "reorderTasks": {
      const tasks = reorderSubset(state.tasks, action.orderedIds);
      return tasks === state.tasks ? state : { ...state, tasks: [...tasks] };
    }

    case "addSubtask": {
      const title = normalizeTitle(action.title);
      if (!title) return state;
      const parent = state.tasks.find((task) => task.id === action.parentId);
      if (!parent) return state;
      const timestamp = getIsoTimestamp();
      const updatedParent = {
        ...parent,
        children: [...parent.children, createTodoItem(title, { timestamp })],
        updatedAt: timestamp
      };
      const tasks = state.tasks.map((task) =>
        task.id === action.parentId ? updatedParent : task
      );
      return withRecurringLifecycle(state, tasks, updatedParent, timestamp);
    }

    case "reorderSubtasks": {
      const parent = state.tasks.find((task) => task.id === action.parentId);
      if (!parent) return state;
      const children = reorderSubset(parent.children, action.orderedIds);
      if (children === parent.children) return state;

      const updatedParent = { ...parent, children: [...children] };
      return {
        ...state,
        tasks: state.tasks.map((task) => (task.id === parent.id ? updatedParent : task))
      };
    }

    case "editSubtask": {
      const title = normalizeTitle(action.title);
      if (!title) return state;
      const parent = state.tasks.find((task) => task.id === action.parentId);
      if (!parent) return state;
      const child = parent.children.find((item) => item.id === action.childId);
      if (!child || child.title === title) return state;
      const timestamp = getIsoTimestamp();
      const tasks = state.tasks.map((task) =>
        task.id === action.parentId
          ? {
              ...task,
              children: task.children.map((item) =>
                item.id === action.childId ? { ...item, title, updatedAt: timestamp } : item
              ),
              updatedAt: timestamp
            }
          : task
      );
      return withSyncedSeriesTemplate(state, tasks, action.parentId, timestamp);
    }

    case "toggleSubtask": {
      const parent = state.tasks.find((task) => task.id === action.parentId);
      if (!parent) return state;
      const child = parent.children.find((item) => item.id === action.childId);
      if (!child) return state;
      const timestamp = getIsoTimestamp();
      const done = !child.done;
      const updatedParent: TodoItem = {
        ...parent,
        children: parent.children.map((item) =>
          item.id === action.childId
            ? {
                ...item,
                done,
                updatedAt: timestamp,
                completedAt: done ? timestamp : null,
                completedOn: done ? toLocalDateKey(new Date(timestamp)) : null
              }
            : item
        ),
        updatedAt: timestamp
      };
      const tasks = state.tasks.map((task) =>
        task.id === action.parentId ? updatedParent : task
      );
      return withRecurringLifecycle(state, tasks, updatedParent, timestamp);
    }

    case "deleteSubtask": {
      const parent = state.tasks.find((task) => task.id === action.parentId);
      if (!parent || !parent.children.some((item) => item.id === action.childId)) return state;
      const timestamp = getIsoTimestamp();
      const updatedParent = {
        ...parent,
        children: parent.children.filter((item) => item.id !== action.childId),
        updatedAt: timestamp
      };
      const tasks = state.tasks.map((task) =>
        task.id === action.parentId ? updatedParent : task
      );
      return withRecurringLifecycle(state, tasks, updatedParent, timestamp);
    }

    case "deleteHistoryEntries":
      return deleteHistoryEntries(state, action.targets);

    case "restoreHistoryEntries":
      return restoreHistoryEntries(state, action.snapshot);

    case "importCompletionRecords": {
      if (action.records.length === 0) return state;
      const existingIds = new Set([
        ...state.archivedCompletions.map((record) => record.id),
        ...state.tasks.flatMap((task) => [task.id, ...task.children.map((child) => child.id)])
      ]);
      const existingSourceRefs = new Set(
        state.archivedCompletions.map((record) => record.sourceRef)
      );
      const incomingIds = new Set<string>();
      const incomingSourceRefs = new Set<string>();
      for (const record of action.records) {
        if (
          existingIds.has(record.id) ||
          existingSourceRefs.has(record.sourceRef) ||
          incomingIds.has(record.id) ||
          incomingSourceRefs.has(record.sourceRef)
        ) {
          return state;
        }
        incomingIds.add(record.id);
        incomingSourceRefs.add(record.sourceRef);
      }
      return {
        ...state,
        archivedCompletions: [...state.archivedCompletions, ...action.records]
      };
    }

    case "removeImportedCompletionBatch": {
      if (!state.archivedCompletions.some((record) => record.importBatchId === action.importBatchId)) {
        return state;
      }
      return {
        ...state,
        archivedCompletions: state.archivedCompletions.filter(
          (record) => record.importBatchId !== action.importBatchId
        )
      };
    }

    case "restoreTask": {
      if (state.tasks.some((task) => task.id === action.task.id)) return state;
      const index = clampIndex(action.index, state.tasks.length);
      const tasks = [...state.tasks];
      tasks.splice(index, 0, action.task);
      const recurrenceSeries = action.series
        ? restoreSeriesSnapshot(state.recurrenceSeries, action.series)
        : state.recurrenceSeries;
      return { ...state, tasks, recurrenceSeries };
    }

    case "restoreSubtask": {
      const parent = state.tasks.find((task) => task.id === action.parentId);
      if (!parent || parent.children.some((child) => child.id === action.task.id)) return state;
      const timestamp = getIsoTimestamp();
      const index = clampIndex(action.index, parent.children.length);
      const children = [...parent.children];
      children.splice(index, 0, action.task);
      const updatedParent = { ...parent, children, updatedAt: timestamp };
      const tasks = state.tasks.map((task) =>
        task.id === action.parentId ? updatedParent : task
      );
      return withRecurringLifecycle(state, tasks, updatedParent, timestamp);
    }

    case "setTaskImportant": {
      const task = state.tasks.find((item) => item.id === action.id);
      if (!task || task.important === action.important) return state;
      const timestamp = getIsoTimestamp();
      const tasks = state.tasks.map((item) =>
        item.id === action.id
          ? { ...item, important: action.important, updatedAt: timestamp }
          : item
      );
      return withSyncedSeriesTemplate(state, tasks, action.id, timestamp);
    }

    case "setTaskRecurrence": {
      const task = state.tasks.find((item) => item.id === action.id);
      if (!task) return state;
      return updateTaskSchedule(
        state,
        task,
        task.scheduledFor,
        task.deadlineAt,
        task.deadlineDisplayMode,
        action.rule,
        action.today
      );
    }

    case "setTaskSchedule": {
      const task = state.tasks.find((item) => item.id === action.id);
      if (!task) return state;
      if (action.deadlineAt !== null && !isValidDeadlineInstant(action.deadlineAt)) return state;
      if (!isDeadlineDisplayMode(action.deadlineDisplayMode)) return state;
      const scheduledFor =
        action.scheduledFor === undefined ? task.scheduledFor : action.scheduledFor;
      if (scheduledFor !== null && !isLocalDateKey(scheduledFor)) return state;
      if (
        scheduledFor !== task.scheduledFor &&
        (scheduledFor === null ? task.recurrenceSeriesId !== null : scheduledFor < action.today)
      ) {
        return state;
      }
      return updateTaskSchedule(
        state,
        task,
        scheduledFor,
        action.deadlineAt,
        action.deadlineDisplayMode,
        action.rule,
        action.today
      );
    }

    case "materializeRecurrences":
      return materializeDueRecurrences(state, action.today);

    case "setWindowLayerMode": {
      if (state.settings.windowLayerMode === action.mode) return state;
      return {
        ...state,
        settings: {
          ...state.settings,
          windowLayerMode: action.mode,
          alwaysOnTop: action.mode === "alwaysOnTop"
        }
      };
    }

    case "setColorTheme": {
      if (state.settings.colorTheme === action.theme) return state;
      return {
        ...state,
        settings: {
          ...state.settings,
          colorTheme: action.theme,
          theme:
            action.theme === "citic-red"
              ? "light"
              : action.theme === "custom"
                ? getColorScheme(state.settings.customThemeColors.canvas)
                : "dark"
        }
      };
    }

    case "setCustomThemeColors": {
      const colors = normalizeCustomThemeColors(action.colors);
      if (!colors || customThemeColorsEqual(state.settings.customThemeColors, colors)) {
        return state;
      }
      return {
        ...state,
        settings: {
          ...state.settings,
          customThemeColors: colors,
          theme:
            state.settings.colorTheme === "custom"
              ? getColorScheme(colors.canvas)
              : state.settings.theme
        }
      };
    }

    case "setFontSize": {
      if (!Number.isInteger(action.size)) return state;
      if (action.size < MIN_FONT_SIZE || action.size > MAX_FONT_SIZE) return state;
      if (state.settings.fontSize === action.size) return state;
      return { ...state, settings: { ...state.settings, fontSize: action.size } };
    }

    case "setBackgroundOpacity": {
      if (!Number.isInteger(action.percent)) return state;
      if (
        action.percent < MIN_BACKGROUND_OPACITY ||
        action.percent > MAX_BACKGROUND_OPACITY ||
        state.settings.backgroundOpacityPercent === action.percent
      ) {
        return state;
      }
      return {
        ...state,
        settings: { ...state.settings, backgroundOpacityPercent: action.percent }
      };
    }

    case "setCompactMode": {
      if (state.settings.compactMode === action.enabled) return state;
      return { ...state, settings: { ...state.settings, compactMode: action.enabled } };
    }

    case "setCollapseCompletedByDefault": {
      if (state.settings.collapseCompletedByDefault === action.enabled) return state;
      return {
        ...state,
        settings: { ...state.settings, collapseCompletedByDefault: action.enabled }
      };
    }

    default:
      return state;
  }
}

function withSyncedSeriesTemplate(
  state: AppState,
  tasks: TodoItem[],
  taskId: TodoId,
  timestamp: string
): AppState {
  const task = tasks.find((item) => item.id === taskId);
  const series = task ? getEnabledSeries(state, task.recurrenceSeriesId) : undefined;
  if (!task || !series) return { ...state, tasks };
  return {
    ...state,
    tasks,
    recurrenceSeries: state.recurrenceSeries.map((item) =>
      item.id === series.id
        ? { ...item, template: createRecurrenceTemplate(task), updatedAt: timestamp }
        : item
    )
  };
}

function updateTaskSchedule(
  state: AppState,
  task: TodoItem,
  scheduledFor: LocalDateKey | null,
  deadlineAt: string | null,
  deadlineDisplayMode: DeadlineDisplayMode,
  requestedRule: RecurrenceRule | null,
  today: LocalDateKey
): AppState {
  const existingSeries = getEnabledSeries(state, task.recurrenceSeriesId);
  const rule = requestedRule === null ? null : normalizeRecurrenceRule(requestedRule);
  if (requestedRule !== null && !rule) return state;
  if (existingSeries && scheduledFor !== task.scheduledFor) return state;
  const scheduleAnchor = scheduledFor ?? today;
  if (rule && deadlineAt && !createDeadlinePattern(deadlineAt, scheduleAnchor)) {
    return state;
  }

  const scheduleChanged = task.scheduledFor !== scheduledFor;
  const deadlineChanged = task.deadlineAt !== deadlineAt;
  const displayModeChanged = task.deadlineDisplayMode !== deadlineDisplayMode;
  const recurrenceChanged =
    rule === null
      ? existingSeries !== undefined
      : !existingSeries || !recurrenceRulesEqual(existingSeries.rule, rule);
  if (!scheduleChanged && !deadlineChanged && !displayModeChanged && !recurrenceChanged) {
    return state;
  }
  if (rule && !existingSeries && task.done) return state;

  const timestamp = getIsoTimestamp();

  if (rule === null) {
    const updatedTask: TodoItem = {
      ...task,
      scheduledFor,
      deadlineAt,
      deadlineDisplayMode,
      recurrenceSeriesId: existingSeries ? null : task.recurrenceSeriesId,
      updatedAt: timestamp
    };
    return {
      ...state,
      tasks: state.tasks.map((item) => (item.id === task.id ? updatedTask : item)),
      recurrenceSeries: existingSeries
        ? state.recurrenceSeries.map((series) =>
            series.id === existingSeries.id
              ? { ...series, enabled: false, activeTaskId: null, updatedAt: timestamp }
              : series
          )
        : state.recurrenceSeries
    };
  }

  if (existingSeries) {
    const taskChanged = deadlineChanged || displayModeChanged;
    const updatedTask = taskChanged
      ? { ...task, deadlineAt, deadlineDisplayMode, updatedAt: timestamp }
      : task;
    return {
      ...state,
      tasks: taskChanged
        ? state.tasks.map((item) => (item.id === task.id ? updatedTask : item))
        : state.tasks,
      recurrenceSeries: state.recurrenceSeries.map((series) =>
        series.id === existingSeries.id
          ? {
              ...series,
              rule,
              template: createRecurrenceTemplate(
                updatedTask,
                scheduleAnchor
              ),
              nextOccurrenceOn: recurrenceChanged
                ? getNextOccurrenceDate(rule, getRecurrenceAnchor(updatedTask, today))
                : series.nextOccurrenceOn,
              updatedAt: timestamp
            }
          : series
      )
    };
  }

  const seriesId = createId();
  const updatedTask: TodoItem = {
    ...task,
    scheduledFor: scheduleAnchor,
    deadlineAt,
    deadlineDisplayMode,
    recurrenceSeriesId: seriesId,
    updatedAt: timestamp
  };
  const series: RecurrenceSeries = {
    id: seriesId,
    rule,
    template: createRecurrenceTemplate(updatedTask, scheduleAnchor),
    nextOccurrenceOn: getNextOccurrenceDate(rule, scheduleAnchor),
    activeTaskId: task.id,
    enabled: true,
    createdAt: timestamp,
    updatedAt: timestamp
  };
  return {
    ...state,
    tasks: state.tasks.map((item) => (item.id === task.id ? updatedTask : item)),
    recurrenceSeries: [...state.recurrenceSeries, series]
  };
}

function withRecurringLifecycle(
  state: AppState,
  tasks: TodoItem[],
  task: TodoItem,
  timestamp: string
): AppState {
  const series = getEnabledSeries(state, task.recurrenceSeriesId);
  if (!series) return { ...state, tasks };
  const fullyComplete = isTaskFullyComplete(task);
  if (!fullyComplete) {
    const competingTask = tasks.find(
      (item) =>
        item.id !== task.id &&
        item.recurrenceSeriesId === series.id &&
        !isTaskFullyComplete(item)
    );
    if (competingTask) return state;
  }
  const today = toLocalDateKey(new Date(timestamp));
  const recurrenceAnchor = getRecurrenceAnchor(task, today);
  return {
    ...state,
    tasks,
    recurrenceSeries: state.recurrenceSeries.map((item) =>
      item.id === series.id
        ? {
            ...item,
            template: createRecurrenceTemplate(task),
            activeTaskId: fullyComplete ? null : task.id,
            nextOccurrenceOn: fullyComplete
              ? getNextOccurrenceDate(item.rule, recurrenceAnchor)
              : item.nextOccurrenceOn,
            updatedAt: timestamp
          }
        : item
    )
  };
}

function getEnabledSeries(
  state: AppState,
  seriesId: string | null
): RecurrenceSeries | undefined {
  if (!seriesId) return undefined;
  return state.recurrenceSeries.find((series) => series.id === seriesId && series.enabled);
}

function restoreSeriesSnapshot(
  series: RecurrenceSeries[],
  snapshot: RecurrenceSeries
): RecurrenceSeries[] {
  const index = series.findIndex((item) => item.id === snapshot.id);
  if (index < 0) return [...series, snapshot];
  return series.map((item) => (item.id === snapshot.id ? snapshot : item));
}

function isTaskFullyComplete(task: TodoItem): boolean {
  return task.done && task.children.every((child) => child.done);
}

function getRecurrenceAnchor(task: TodoItem, today: LocalDateKey): LocalDateKey {
  return task.scheduledFor && task.scheduledFor > today ? task.scheduledFor : today;
}

function normalizeTitle(title: string): string {
  return title.trim();
}

function clampIndex(index: number, length: number): number {
  return Math.max(0, Math.min(Math.trunc(index), length));
}
