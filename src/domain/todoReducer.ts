import { getIsoTimestamp } from "../utils/date";
import { createId } from "../utils/ids";
import { AppState, TodoId, TodoItem, WindowLayerMode } from "./todoTypes";

export type TodoAction =
  | { type: "addTask"; title: string }
  | { type: "editTask"; id: TodoId; title: string }
  | { type: "toggleTask"; id: TodoId }
  | { type: "deleteTask"; id: TodoId }
  | { type: "addSubtask"; parentId: TodoId; title: string }
  | { type: "editSubtask"; parentId: TodoId; childId: TodoId; title: string }
  | { type: "toggleSubtask"; parentId: TodoId; childId: TodoId }
  | { type: "deleteSubtask"; parentId: TodoId; childId: TodoId }
  | { type: "setWindowLayerMode"; mode: WindowLayerMode }
  | { type: "hydrateState"; state: AppState };

export function createTodoItem(title: string, timestamp = getIsoTimestamp()): TodoItem {
  return {
    id: createId(),
    title,
    done: false,
    createdAt: timestamp,
    updatedAt: timestamp,
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

      return {
        ...state,
        tasks: [...state.tasks, createTodoItem(title)]
      };
    }

    case "editTask": {
      const title = normalizeTitle(action.title);
      if (!title) return state;

      const task = state.tasks.find((item) => item.id === action.id);
      if (!task) return state;
      if (task.title === title) return state;

      return {
        ...state,
        tasks: state.tasks.map((task) =>
          task.id === action.id ? { ...task, title, updatedAt: getIsoTimestamp() } : task
        )
      };
    }

    case "toggleTask": {
      const task = state.tasks.find((item) => item.id === action.id);
      if (!task) return state;

      return {
        ...state,
        tasks: state.tasks.map((task) =>
          task.id === action.id ? { ...task, done: !task.done, updatedAt: getIsoTimestamp() } : task
        )
      };
    }

    case "deleteTask": {
      const task = state.tasks.find((item) => item.id === action.id);
      if (!task) return state;

      return {
        ...state,
        tasks: state.tasks.filter((task) => task.id !== action.id)
      };
    }

    case "addSubtask": {
      const title = normalizeTitle(action.title);
      if (!title) return state;

      const parent = state.tasks.find((task) => task.id === action.parentId);
      if (!parent) return state;

      return {
        ...state,
        tasks: state.tasks.map((task) =>
          task.id === action.parentId
            ? { ...task, children: [...task.children, createTodoItem(title)], updatedAt: getIsoTimestamp() }
            : task
        )
      };
    }

    case "editSubtask": {
      const title = normalizeTitle(action.title);
      if (!title) return state;

      const parent = state.tasks.find((task) => task.id === action.parentId);
      if (!parent) return state;

      const child = parent.children.find((item) => item.id === action.childId);
      if (!child) return state;
      if (child.title === title) return state;

      const timestamp = getIsoTimestamp();

      return {
        ...state,
        tasks: state.tasks.map((task) =>
          task.id === action.parentId
            ? {
                ...task,
                children: task.children.map((child) =>
                  child.id === action.childId ? { ...child, title, updatedAt: timestamp } : child
                ),
                updatedAt: timestamp
              }
            : task
        )
      };
    }

    case "toggleSubtask": {
      const parent = state.tasks.find((task) => task.id === action.parentId);
      if (!parent) return state;

      const child = parent.children.find((item) => item.id === action.childId);
      if (!child) return state;

      const timestamp = getIsoTimestamp();

      return {
        ...state,
        tasks: state.tasks.map((task) =>
          task.id === action.parentId
            ? {
                ...task,
                children: task.children.map((child) =>
                  child.id === action.childId
                    ? { ...child, done: !child.done, updatedAt: timestamp }
                    : child
                ),
                updatedAt: timestamp
              }
            : task
        )
      };
    }

    case "deleteSubtask": {
      const parent = state.tasks.find((task) => task.id === action.parentId);
      if (!parent) return state;

      const child = parent.children.find((item) => item.id === action.childId);
      if (!child) return state;

      return {
        ...state,
        tasks: state.tasks.map((task) =>
          task.id === action.parentId
            ? {
                ...task,
                children: task.children.filter((child) => child.id !== action.childId),
                updatedAt: getIsoTimestamp()
              }
            : task
        )
      };
    }

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

    default:
      return state;
  }
}

function normalizeTitle(title: string): string {
  return title.trim();
}
