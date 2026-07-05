import { AppSettings, AppState, TodoItem, WindowLayerMode } from "../domain/todoTypes";
import { LoadStatus } from "./appStateRepository";

export type ParseStatus = Exclude<LoadStatus, "error">;

export interface ParseAppStateResult {
  state: AppState;
  status: ParseStatus;
}

export function fallbackDefaultState(): AppState {
  return {
    schemaVersion: 1,
    tasks: [],
    settings: {
      alwaysOnTop: true,
      compactMode: false,
      theme: "dark",
      windowLayerMode: "alwaysOnTop"
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

  const state = toAppState(rawValue);
  if (state) {
    return { state, status: "ok" };
  }

  return { state: fallbackDefaultState(), status: "invalid" };
}

export function isAppState(value: unknown): value is AppState {
  return toAppState(value) !== null;
}

export function isTodoItem(value: unknown): value is TodoItem {
  return isParentTodoItem(value);
}

function isParentTodoItem(value: unknown): value is TodoItem {
  if (!hasTodoItemShape(value)) return false;
  return value.children.every(isChildTodoItem);
}

function isChildTodoItem(value: unknown): value is TodoItem {
  if (!hasTodoItemShape(value)) return false;
  return value.children.length === 0;
}

function hasTodoItemShape(value: unknown): value is TodoItem {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.done === "boolean" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string" &&
    Array.isArray(value.children)
  );
}

function toAppState(value: unknown): AppState | null {
  if (!isRecord(value)) return null;
  if (value.schemaVersion !== 1) return null;
  if (!Array.isArray(value.tasks) || !value.tasks.every(isParentTodoItem)) return null;

  const settings = toAppSettings(value.settings);
  if (!settings) return null;

  return {
    schemaVersion: 1,
    tasks: value.tasks,
    settings
  };
}

function toAppSettings(value: unknown): AppSettings | null {
  if (!isRecord(value)) return null;

  const { compactMode, theme } = value;
  if (typeof compactMode !== "boolean") return null;
  if (theme !== "system" && theme !== "dark" && theme !== "light") return null;

  const windowLayerMode = parseWindowLayerMode(value.windowLayerMode);
  if (!windowLayerMode) return null;

  return {
    alwaysOnTop: windowLayerMode === "alwaysOnTop",
    compactMode,
    theme,
    windowLayerMode
  };
}

function parseWindowLayerMode(value: unknown): WindowLayerMode | null {
  if (value === undefined) return "alwaysOnTop";
  if (value === "alwaysOnTop" || value === "normal" || value === "alwaysOnBottom") return value;
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
