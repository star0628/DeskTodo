import {
  AppSettings,
  AppState,
  ColorThemeId,
  CustomThemeColors,
  DEFAULT_BACKGROUND_OPACITY,
  DEFAULT_FONT_SIZE,
  MAX_BACKGROUND_OPACITY,
  MAX_FONT_SIZE,
  MIN_BACKGROUND_OPACITY,
  MIN_FONT_SIZE,
  RecurrenceRule,
  RecurrenceSeries,
  TodoItem,
  Weekday,
  WindowLayerMode
} from "../domain/todoTypes";
import {
  DEFAULT_CUSTOM_THEME_COLORS,
  getColorScheme,
  isCustomThemeColors
} from "../settings/customTheme";
import { isOccurrenceDate, normalizeRecurrenceRule } from "../domain/recurrence";
import {
  isDeadlineDisplayMode,
  isValidDeadlineInstant,
  isValidDeadlinePattern
} from "../domain/deadline";
import { isLocalDateKey, localDateKeyFromIso } from "../utils/date";
import { LoadStatus } from "./appStateRepository";

export type ParseStatus = Exclude<LoadStatus, "error">;

export interface ParseAppStateResult {
  state: AppState;
  status: ParseStatus;
}

interface LegacyTodoItem {
  id: string;
  title: string;
  done: boolean;
  createdAt: string;
  updatedAt: string;
  children: LegacyTodoItem[];
}

interface V3TodoItem extends LegacyTodoItem {
  completedAt: string | null;
  completedOn: string | null;
  children: V3TodoItem[];
}

export function fallbackDefaultState(): AppState {
  return {
    schemaVersion: 7,
    tasks: [],
    recurrenceSeries: [],
    settings: {
      alwaysOnTop: true,
      compactMode: false,
      theme: "dark",
      windowLayerMode: "alwaysOnTop",
      colorTheme: "graphite-lime",
      customThemeColors: { ...DEFAULT_CUSTOM_THEME_COLORS },
      fontSize: DEFAULT_FONT_SIZE,
      backgroundOpacityPercent: DEFAULT_BACKGROUND_OPACITY,
      collapseCompletedByDefault: false
    }
  };
}

export function safeParseAppState(rawValue: unknown): AppState {
  return parseAppState(rawValue).state;
}

export function parseAppState(rawValue: unknown): ParseAppStateResult {
  if (rawValue === null || rawValue === undefined || rawValue === "") {
    return { state: fallbackDefaultState(), status: "missing" };
  }

  if (typeof rawValue === "string") {
    try {
      return parseAppState(JSON.parse(rawValue) as unknown);
    } catch {
      return { state: fallbackDefaultState(), status: "invalid" };
    }
  }

  if (!isRecord(rawValue)) {
    return { state: fallbackDefaultState(), status: "invalid" };
  }

  if (rawValue.schemaVersion === 7) {
    const state = toAppState(rawValue);
    return state
      ? { state, status: "ok" }
      : { state: fallbackDefaultState(), status: "invalid" };
  }

  if (rawValue.schemaVersion === 6) {
    const state = migrateV6AppState(rawValue);
    return state
      ? { state, status: "migrated" }
      : { state: fallbackDefaultState(), status: "invalid" };
  }

  if (rawValue.schemaVersion === 5) {
    const state = migrateV5AppState(rawValue);
    return state
      ? { state, status: "migrated" }
      : { state: fallbackDefaultState(), status: "invalid" };
  }

  if (rawValue.schemaVersion === 4) {
    const state = migrateV4AppState(rawValue);
    return state
      ? { state, status: "migrated" }
      : { state: fallbackDefaultState(), status: "invalid" };
  }

  if (rawValue.schemaVersion === 3) {
    const state = migrateV3AppState(rawValue);
    return state
      ? { state, status: "migrated" }
      : { state: fallbackDefaultState(), status: "invalid" };
  }

  if (rawValue.schemaVersion === 2) {
    const state = migrateV2AppState(rawValue);
    return state
      ? { state, status: "migrated" }
      : { state: fallbackDefaultState(), status: "invalid" };
  }

  if (rawValue.schemaVersion === 1) {
    const state = migrateLegacyAppState(rawValue);
    return state
      ? { state, status: "migrated" }
      : { state: fallbackDefaultState(), status: "invalid" };
  }

  return { state: fallbackDefaultState(), status: "invalid" };
}

export function isAppState(value: unknown): value is AppState {
  return toAppState(value) !== null;
}

export function isTodoItem(value: unknown): value is TodoItem {
  return parseParentTodoItem(value) !== null;
}

function toAppState(value: unknown): AppState | null {
  if (!isRecord(value) || value.schemaVersion !== 7) return null;
  if (!Array.isArray(value.tasks) || !Array.isArray(value.recurrenceSeries)) return null;

  const tasks = value.tasks.map((task) => parseParentTodoItem(task));
  const recurrenceSeries = value.recurrenceSeries.map((series) => parseRecurrenceSeries(series));
  const settings = toAppSettings(value.settings);
  if (tasks.some(isNull) || recurrenceSeries.some(isNull) || !settings) return null;

  const state: AppState = {
    schemaVersion: 7,
    tasks: tasks as TodoItem[],
    recurrenceSeries: recurrenceSeries as RecurrenceSeries[],
    settings
  };
  return hasValidStateRelationships(state) ? state : null;
}

function migrateV6AppState(value: Record<string, unknown>): AppState | null {
  if (!Array.isArray(value.tasks) || !Array.isArray(value.recurrenceSeries)) return null;
  const tasks = value.tasks.map((task) => parseParentTodoItem(task, false, true));
  const recurrenceSeries = value.recurrenceSeries.map((series) =>
    parseRecurrenceSeries(series, false, true)
  );
  const settings = toAppSettings(value.settings);
  if (tasks.some(isNull) || recurrenceSeries.some(isNull) || !settings) return null;
  const state: AppState = {
    schemaVersion: 7,
    tasks: tasks as TodoItem[],
    recurrenceSeries: recurrenceSeries as RecurrenceSeries[],
    settings
  };
  return hasValidStateRelationships(state) ? state : null;
}

function migrateV5AppState(value: Record<string, unknown>): AppState | null {
  if (!Array.isArray(value.tasks) || !Array.isArray(value.recurrenceSeries)) return null;
  const tasks = value.tasks.map((task) => parseParentTodoItem(task, false, true));
  const recurrenceSeries = value.recurrenceSeries.map((series) =>
    parseRecurrenceSeries(series, false, true)
  );
  const settings = migrateV5AppSettings(value.settings);
  if (tasks.some(isNull) || recurrenceSeries.some(isNull) || !settings) return null;
  const state: AppState = {
    schemaVersion: 7,
    tasks: tasks as TodoItem[],
    recurrenceSeries: recurrenceSeries as RecurrenceSeries[],
    settings
  };
  return hasValidStateRelationships(state) ? state : null;
}

function parseParentTodoItem(
  value: unknown,
  allowV4 = false,
  allowMissingDeadlineDisplayMode = false
): TodoItem | null {
  const task = parseTodoItem(value, allowV4, allowMissingDeadlineDisplayMode);
  if (!task || !Array.isArray((value as Record<string, unknown>).children)) return null;
  const children = (value as Record<string, unknown>).children as unknown[];
  const parsedChildren = children.map((child) =>
    parseChildTodoItem(child, allowV4, allowMissingDeadlineDisplayMode)
  );
  if (parsedChildren.some(isNull)) return null;
  return { ...task, children: parsedChildren as TodoItem[] };
}

function parseChildTodoItem(
  value: unknown,
  allowV4 = false,
  allowMissingDeadlineDisplayMode = false
): TodoItem | null {
  const task = parseTodoItem(value, allowV4, allowMissingDeadlineDisplayMode);
  const children = isRecord(value) ? value.children : null;
  if (!task || !Array.isArray(children)) return null;
  if (children.length !== 0) return null;
  if (
    task.important ||
    task.scheduledFor !== null ||
    task.deadlineAt !== null ||
    task.deadlineDisplayMode !== "countdown" ||
    task.recurrenceSeriesId !== null
  ) {
    return null;
  }
  return task;
}

function parseTodoItem(
  value: unknown,
  allowV4 = false,
  allowMissingDeadlineDisplayMode = false
): TodoItem | null {
  if (!hasBaseTodoItemShape(value)) return null;
  if (!Array.isArray(value.children)) return null;
  if (typeof value.important !== "boolean") return null;
  if (value.scheduledFor !== null && !isLocalDateKey(value.scheduledFor)) return null;
  if (value.recurrenceSeriesId !== null && typeof value.recurrenceSeriesId !== "string") return null;
  if ((value.recurrenceSeriesId === null) !== (value.scheduledFor === null)) return null;
  const deadlineAt = allowV4 && value.deadlineAt === undefined ? null : value.deadlineAt;
  if (deadlineAt !== null && !isValidDeadlineInstant(deadlineAt)) return null;
  const deadlineDisplayMode =
    allowMissingDeadlineDisplayMode && value.deadlineDisplayMode === undefined
      ? "countdown"
      : value.deadlineDisplayMode;
  if (!isDeadlineDisplayMode(deadlineDisplayMode)) return null;

  if (value.done) {
    if (
      typeof value.completedAt !== "string" ||
      !isIsoTimestamp(value.completedAt) ||
      !isLocalDateKey(value.completedOn)
    ) {
      return null;
    }
  } else if (value.completedAt !== null || value.completedOn !== null) {
    return null;
  }

  return {
    id: value.id,
    title: value.title,
    done: value.done,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    completedAt: value.completedAt as string | null,
    completedOn: value.completedOn as string | null,
    important: value.important,
    scheduledFor: value.scheduledFor as string | null,
    deadlineAt: deadlineAt as string | null,
    deadlineDisplayMode,
    recurrenceSeriesId: value.recurrenceSeriesId as string | null,
    children: []
  };
}

function parseRecurrenceSeries(
  value: unknown,
  allowV4 = false,
  allowMissingDeadlineDisplayMode = false
): RecurrenceSeries | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== "string" ||
    !isLocalDateKey(value.nextOccurrenceOn) ||
    (value.activeTaskId !== null && typeof value.activeTaskId !== "string") ||
    typeof value.enabled !== "boolean" ||
    typeof value.createdAt !== "string" ||
    !isIsoTimestamp(value.createdAt) ||
    typeof value.updatedAt !== "string" ||
    !isIsoTimestamp(value.updatedAt)
  ) {
    return null;
  }

  const rule = parseRecurrenceRule(value.rule);
  const template = parseRecurrenceTemplate(
    value.template,
    allowV4,
    allowMissingDeadlineDisplayMode
  );
  if (!rule || !template || !isOccurrenceDate(rule, value.nextOccurrenceOn)) return null;
  if (!value.enabled && value.activeTaskId !== null) return null;

  return {
    id: value.id,
    rule,
    template,
    nextOccurrenceOn: value.nextOccurrenceOn,
    activeTaskId: value.activeTaskId,
    enabled: value.enabled,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt
  };
}

function parseRecurrenceRule(value: unknown): RecurrenceRule | null {
  if (!isRecord(value)) return null;
  if (value.kind === "daily" || value.kind === "weekdays") return { kind: value.kind };
  if (value.kind !== "weekly" || !Array.isArray(value.weekdays)) return null;
  const weekdays = value.weekdays.filter(isWeekday);
  if (weekdays.length !== value.weekdays.length) return null;
  return normalizeRecurrenceRule({ kind: "weekly", weekdays });
}

function parseRecurrenceTemplate(
  value: unknown,
  allowV4 = false,
  allowMissingDeadlineDisplayMode = false
): RecurrenceSeries["template"] | null {
  if (!isRecord(value)) return null;
  if (!isNormalizedTitle(value.title) || typeof value.important !== "boolean") return null;
  if (!Array.isArray(value.childTitles) || !value.childTitles.every(isNormalizedTitle)) return null;
  const deadlinePattern =
    allowV4 && value.deadlinePattern === undefined ? null : value.deadlinePattern;
  if (deadlinePattern !== null && !isValidDeadlinePattern(deadlinePattern)) return null;
  const deadlineDisplayMode =
    allowMissingDeadlineDisplayMode && value.deadlineDisplayMode === undefined
      ? "countdown"
      : value.deadlineDisplayMode;
  if (!isDeadlineDisplayMode(deadlineDisplayMode)) return null;
  return {
    title: value.title,
    important: value.important,
    childTitles: [...value.childTitles],
    deadlinePattern,
    deadlineDisplayMode
  };
}

function hasValidStateRelationships(state: AppState): boolean {
  const taskIds = new Set<string>();
  for (const task of state.tasks) {
    if (taskIds.has(task.id)) return false;
    taskIds.add(task.id);
    for (const child of task.children) {
      if (taskIds.has(child.id)) return false;
      taskIds.add(child.id);
    }
  }

  const seriesIds = new Set<string>();
  for (const series of state.recurrenceSeries) {
    if (seriesIds.has(series.id)) return false;
    seriesIds.add(series.id);
  }

  for (const task of state.tasks) {
    if (task.recurrenceSeriesId !== null && !seriesIds.has(task.recurrenceSeriesId)) return false;
  }

  for (const series of state.recurrenceSeries) {
    const openTasks = state.tasks.filter(
      (task) =>
        task.recurrenceSeriesId === series.id &&
        !(task.done && task.children.every((child) => child.done))
    );
    if (openTasks.length > 1) return false;
    if (series.activeTaskId === null) {
      if (openTasks.length !== 0) return false;
      continue;
    }
    if (openTasks.length !== 1 || openTasks[0].id !== series.activeTaskId) return false;
  }
  return true;
}

function migrateV4AppState(value: Record<string, unknown>): AppState | null {
  if (!Array.isArray(value.tasks) || !Array.isArray(value.recurrenceSeries)) return null;
  const tasks = value.tasks.map((task) => parseParentTodoItem(task, true, true));
  const recurrenceSeries = value.recurrenceSeries.map((series) =>
    parseRecurrenceSeries(series, true, true)
  );
  const settings = migrateV5AppSettings(value.settings);
  if (tasks.some(isNull) || recurrenceSeries.some(isNull) || !settings) return null;
  const state: AppState = {
    schemaVersion: 7,
    tasks: tasks as TodoItem[],
    recurrenceSeries: recurrenceSeries as RecurrenceSeries[],
    settings
  };
  return hasValidStateRelationships(state) ? state : null;
}

function migrateV3AppState(value: Record<string, unknown>): AppState | null {
  if (!Array.isArray(value.tasks) || !value.tasks.every(isV3ParentTodoItem)) return null;
  const settings = migrateV3AppSettings(value.settings);
  if (!settings) return null;
  return {
    schemaVersion: 7,
    tasks: value.tasks.map(migrateV3TodoItem),
    recurrenceSeries: [],
    settings
  };
}

function migrateV2AppState(value: Record<string, unknown>): AppState | null {
  if (!Array.isArray(value.tasks) || !value.tasks.every(isV3ParentTodoItem)) return null;
  const settings = migrateLegacyAppSettings(value.settings);
  if (!settings) return null;
  return {
    schemaVersion: 7,
    tasks: value.tasks.map(migrateV3TodoItem),
    recurrenceSeries: [],
    settings
  };
}

function migrateLegacyAppState(value: Record<string, unknown>): AppState | null {
  if (!Array.isArray(value.tasks) || !value.tasks.every(isLegacyParentTodoItem)) return null;
  const settings = migrateLegacyAppSettings(value.settings);
  if (!settings) return null;
  const tasks = value.tasks.map(migrateLegacyTodoItem);
  if (tasks.some(isNull)) return null;
  return {
    schemaVersion: 7,
    tasks: tasks as TodoItem[],
    recurrenceSeries: [],
    settings
  };
}

function migrateV3TodoItem(value: V3TodoItem): TodoItem {
  return {
    id: value.id,
    title: value.title,
    done: value.done,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    completedAt: value.completedAt,
    completedOn: value.completedOn,
    important: false,
    scheduledFor: null,
    deadlineAt: null,
    deadlineDisplayMode: "countdown",
    recurrenceSeriesId: null,
    children: value.children.map(migrateV3TodoItem)
  };
}

function migrateLegacyTodoItem(value: LegacyTodoItem): TodoItem | null {
  const completedOn = value.done ? localDateKeyFromIso(value.updatedAt) : null;
  if (value.done && !completedOn) return null;
  const children = value.children.map(migrateLegacyTodoItem);
  if (children.some(isNull)) return null;
  return {
    id: value.id,
    title: value.title,
    done: value.done,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    completedAt: value.done ? value.updatedAt : null,
    completedOn,
    important: false,
    scheduledFor: null,
    deadlineAt: null,
    deadlineDisplayMode: "countdown",
    recurrenceSeriesId: null,
    children: children as TodoItem[]
  };
}

function isV3ParentTodoItem(value: unknown): value is V3TodoItem {
  return isV3TodoItem(value) && value.children.every(isV3ChildTodoItem);
}

function isV3ChildTodoItem(value: unknown): value is V3TodoItem {
  return isV3TodoItem(value) && value.children.length === 0;
}

function isV3TodoItem(value: unknown): value is V3TodoItem {
  if (!hasBaseTodoItemShape(value) || !Array.isArray(value.children)) return false;
  if (value.done) {
    return (
      typeof value.completedAt === "string" &&
      isIsoTimestamp(value.completedAt) &&
      isLocalDateKey(value.completedOn)
    );
  }
  return value.completedAt === null && value.completedOn === null;
}

function isLegacyParentTodoItem(value: unknown): value is LegacyTodoItem {
  return isLegacyTodoItem(value) && value.children.every(isLegacyChildTodoItem);
}

function isLegacyChildTodoItem(value: unknown): value is LegacyTodoItem {
  return isLegacyTodoItem(value) && value.children.length === 0;
}

function isLegacyTodoItem(value: unknown): value is LegacyTodoItem {
  return hasBaseTodoItemShape(value) && Array.isArray(value.children);
}

function hasBaseTodoItemShape(value: unknown): value is Record<string, unknown> & {
  id: string;
  title: string;
  done: boolean;
  createdAt: string;
  updatedAt: string;
} {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    isNormalizedTitle(value.title) &&
    typeof value.done === "boolean" &&
    typeof value.createdAt === "string" &&
    isIsoTimestamp(value.createdAt) &&
    typeof value.updatedAt === "string" &&
    isIsoTimestamp(value.updatedAt)
  );
}

function toAppSettings(value: unknown): AppSettings | null {
  const base = parseBaseSettings(value);
  if (
    !base ||
    !isValidBackgroundOpacity((value as Record<string, unknown>).backgroundOpacityPercent) ||
    !isCustomThemeColors((value as Record<string, unknown>).customThemeColors)
  ) {
    return null;
  }
  const customThemeColors = (value as Record<string, unknown>)
    .customThemeColors as CustomThemeColors;
  return {
    ...base,
    theme: base.colorTheme === "custom" ? getColorScheme(customThemeColors.canvas) : base.theme,
    backgroundOpacityPercent: (value as Record<string, unknown>).backgroundOpacityPercent as number,
    customThemeColors
  };
}

function migrateV5AppSettings(value: unknown): AppSettings | null {
  const base = parseBaseSettings(value);
  if (
    !base ||
    !isValidBackgroundOpacity((value as Record<string, unknown>).backgroundOpacityPercent)
  ) {
    return null;
  }
  return {
    ...base,
    backgroundOpacityPercent: (value as Record<string, unknown>).backgroundOpacityPercent as number,
    customThemeColors: { ...DEFAULT_CUSTOM_THEME_COLORS }
  };
}

function migrateV3AppSettings(value: unknown): AppSettings | null {
  const base = parseBaseSettings(value);
  if (!base) return null;
  return {
    ...base,
    backgroundOpacityPercent: getThemeDefaultOpacity(base.colorTheme),
    customThemeColors: { ...DEFAULT_CUSTOM_THEME_COLORS }
  };
}

function parseBaseSettings(
  value: unknown
): Omit<AppSettings, "backgroundOpacityPercent" | "customThemeColors"> | null {
  if (!isRecord(value)) return null;
  if (typeof value.compactMode !== "boolean") return null;
  if (value.theme !== "system" && value.theme !== "dark" && value.theme !== "light") return null;
  const windowLayerMode = parseWindowLayerMode(value.windowLayerMode);
  const colorTheme = parseColorTheme(value.colorTheme);
  if (!windowLayerMode || !colorTheme || !isValidFontSize(value.fontSize)) return null;
  if (typeof value.collapseCompletedByDefault !== "boolean") return null;
  return {
    alwaysOnTop: windowLayerMode === "alwaysOnTop",
    compactMode: value.compactMode,
    theme: colorTheme === "citic-red" ? "light" : "dark",
    windowLayerMode,
    colorTheme,
    fontSize: value.fontSize,
    collapseCompletedByDefault: value.collapseCompletedByDefault
  };
}

function migrateLegacyAppSettings(value: unknown): AppSettings | null {
  if (!isRecord(value)) return null;
  if (typeof value.compactMode !== "boolean") return null;
  if (value.theme !== "system" && value.theme !== "dark" && value.theme !== "light") return null;
  const windowLayerMode = parseWindowLayerMode(value.windowLayerMode);
  if (!windowLayerMode) return null;
  return {
    alwaysOnTop: windowLayerMode === "alwaysOnTop",
    compactMode: value.compactMode,
    theme: "dark",
    windowLayerMode,
    colorTheme: "graphite-lime",
    customThemeColors: { ...DEFAULT_CUSTOM_THEME_COLORS },
    fontSize: DEFAULT_FONT_SIZE,
    backgroundOpacityPercent: DEFAULT_BACKGROUND_OPACITY,
    collapseCompletedByDefault: false
  };
}

function getThemeDefaultOpacity(theme: ColorThemeId): number {
  switch (theme) {
    case "citic-red":
      return 96;
    case "frost-blue":
    case "jade-forest":
      return 92;
    case "ink-gold":
      return 93;
    default:
      return DEFAULT_BACKGROUND_OPACITY;
  }
}

function parseColorTheme(value: unknown): ColorThemeId | null {
  if (
    value === "graphite-lime" ||
    value === "citic-red" ||
    value === "frost-blue" ||
    value === "jade-forest" ||
    value === "ink-gold" ||
    value === "custom"
  ) {
    return value;
  }
  return null;
}

function parseWindowLayerMode(value: unknown): WindowLayerMode | null {
  if (value === undefined) return "alwaysOnTop";
  if (value === "alwaysOnTop" || value === "normal" || value === "alwaysOnBottom") return value;
  return null;
}

function isValidFontSize(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIN_FONT_SIZE &&
    value <= MAX_FONT_SIZE
  );
}

function isValidBackgroundOpacity(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIN_BACKGROUND_OPACITY &&
    value <= MAX_BACKGROUND_OPACITY
  );
}

function isNormalizedTitle(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value === value.trim();
}

function isWeekday(value: unknown): value is Weekday {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 6;
}

function isIsoTimestamp(value: string): boolean {
  return !Number.isNaN(new Date(value).getTime());
}

function isNull<T>(value: T | null): value is null {
  return value === null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
