import {
  AppState,
  LocalDateKey,
  RecurrenceRule,
  RecurrenceSeries,
  RecurrenceTemplate,
  TodoItem,
  Weekday
} from "./todoTypes";
import { addLocalDays, localDateKeyToDate } from "../utils/date";
import { createId } from "../utils/ids";
import { createDeadlinePattern, materializeDeadlineAt } from "./deadline";

export const WEEKDAY_ORDER: readonly Weekday[] = [1, 2, 3, 4, 5, 6, 0];

export function normalizeRecurrenceRule(rule: RecurrenceRule): RecurrenceRule | null {
  if (rule.kind === "daily" || rule.kind === "weekdays") return { kind: rule.kind };
  if (rule.kind !== "weekly" || !Array.isArray(rule.weekdays)) return null;

  const selected = new Set<Weekday>();
  for (const weekday of rule.weekdays) {
    if (!isWeekday(weekday)) return null;
    selected.add(weekday);
  }
  const weekdays = WEEKDAY_ORDER.filter((weekday) => selected.has(weekday));
  return weekdays.length > 0 ? { kind: "weekly", weekdays } : null;
}

export function recurrenceRulesEqual(
  left: RecurrenceRule,
  right: RecurrenceRule
): boolean {
  const normalizedLeft = normalizeRecurrenceRule(left);
  const normalizedRight = normalizeRecurrenceRule(right);
  if (!normalizedLeft || !normalizedRight || normalizedLeft.kind !== normalizedRight.kind) {
    return false;
  }
  if (normalizedLeft.kind !== "weekly" || normalizedRight.kind !== "weekly") return true;
  return (
    normalizedLeft.weekdays.length === normalizedRight.weekdays.length &&
    normalizedLeft.weekdays.every((weekday, index) => weekday === normalizedRight.weekdays[index])
  );
}

export function isOccurrenceDate(rule: RecurrenceRule, date: LocalDateKey): boolean {
  const weekday = localDateKeyToDate(date).getDay() as Weekday;
  if (rule.kind === "daily") return true;
  if (rule.kind === "weekdays") return weekday >= 1 && weekday <= 5;
  return rule.weekdays.includes(weekday);
}

export function getNextOccurrenceDate(
  rule: RecurrenceRule,
  afterDate: LocalDateKey
): LocalDateKey {
  for (let offset = 1; offset <= 7; offset += 1) {
    const candidate = addLocalDays(afterDate, offset);
    if (isOccurrenceDate(rule, candidate)) return candidate;
  }
  return addLocalDays(afterDate, 1);
}

export function getLatestDueOccurrence(
  rule: RecurrenceRule,
  firstDueDate: LocalDateKey,
  today: LocalDateKey
): LocalDateKey | null {
  if (firstDueDate > today) return null;

  for (let offset = 0; offset <= 6; offset += 1) {
    const candidate = addLocalDays(today, -offset);
    if (candidate < firstDueDate) return null;
    if (isOccurrenceDate(rule, candidate)) return candidate;
  }
  return null;
}

export function getRecurrenceLabel(rule: RecurrenceRule): string {
  if (rule.kind === "daily") return "每天";
  if (rule.kind === "weekdays") return "工作日";
  return rule.weekdays.map(getWeekdayShortLabel).join("、");
}

export function getWeekdayShortLabel(weekday: Weekday): string {
  return ["日", "一", "二", "三", "四", "五", "六"][weekday];
}

export function createRecurrenceTemplate(
  task: TodoItem,
  baseDate: LocalDateKey | null = task.scheduledFor
): RecurrenceTemplate {
  return {
    title: task.title,
    important: task.important,
    childTitles: task.children.map((child) => child.title),
    deadlinePattern: baseDate ? createDeadlinePattern(task.deadlineAt, baseDate) : null,
    deadlineDisplayMode: task.deadlineDisplayMode
  };
}

interface MaterializeOptions {
  timestamp?: string;
  createId?: () => string;
}

export function materializeDueRecurrences(
  state: AppState,
  today: LocalDateKey,
  options: MaterializeOptions = {}
): AppState {
  const dueSeries = state.recurrenceSeries.filter(
    (series) => series.enabled && series.activeTaskId === null && series.nextOccurrenceOn <= today
  );
  if (dueSeries.length === 0) return state;

  const timestamp = options.timestamp ?? new Date().toISOString();
  const nextId = options.createId ?? createId;
  const tasks = [...state.tasks];
  const seriesById = new Map<string, RecurrenceSeries>();

  for (const series of dueSeries) {
    const existingOpenTask = tasks.find(
      (task) =>
        task.recurrenceSeriesId === series.id &&
        !(task.done && task.children.every((child) => child.done))
    );
    if (existingOpenTask) {
      seriesById.set(series.id, { ...series, activeTaskId: existingOpenTask.id });
      continue;
    }

    const scheduledFor = getLatestDueOccurrence(
      series.rule,
      series.nextOccurrenceOn,
      today
    );
    if (!scheduledFor) continue;

    const task = createRecurringOccurrence(series, scheduledFor, timestamp, nextId);
    tasks.push(task);
    seriesById.set(series.id, {
      ...series,
      activeTaskId: task.id,
      nextOccurrenceOn: getNextOccurrenceDate(series.rule, scheduledFor),
      updatedAt: timestamp
    });
  }

  if (seriesById.size === 0) return state;
  return {
    ...state,
    tasks,
    recurrenceSeries: state.recurrenceSeries.map((series) => seriesById.get(series.id) ?? series)
  };
}

function createRecurringOccurrence(
  series: RecurrenceSeries,
  scheduledFor: LocalDateKey,
  timestamp: string,
  nextId: () => string
): TodoItem {
  return {
    id: nextId(),
    title: series.template.title,
    done: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    completedAt: null,
    completedOn: null,
    important: series.template.important,
    scheduledFor,
    deadlineAt: materializeDeadlineAt(series.template.deadlinePattern, scheduledFor),
    deadlineDisplayMode: series.template.deadlineDisplayMode,
    recurrenceSeriesId: series.id,
    children: series.template.childTitles.map((title) => ({
      id: nextId(),
      title,
      done: false,
      createdAt: timestamp,
      updatedAt: timestamp,
      completedAt: null,
      completedOn: null,
      important: false,
      scheduledFor: null,
      deadlineAt: null,
      deadlineDisplayMode: "countdown",
      recurrenceSeriesId: null,
      children: []
    }))
  };
}

function isWeekday(value: unknown): value is Weekday {
  return Number.isInteger(value) && typeof value === "number" && value >= 0 && value <= 6;
}
