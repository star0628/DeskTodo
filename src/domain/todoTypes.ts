export type TodoId = string;

export interface TodoItem {
  id: TodoId;
  title: string;
  done: boolean;
  createdAt: string;
  updatedAt: string;
  children: TodoItem[];
}

export type WindowLayerMode = "alwaysOnTop" | "normal" | "alwaysOnBottom";

export interface AppSettings {
  alwaysOnTop: boolean;
  compactMode: boolean;
  theme: "system" | "dark" | "light";
  windowLayerMode: WindowLayerMode;
}

export interface AppState {
  schemaVersion: 1;
  tasks: TodoItem[];
  settings: AppSettings;
}
