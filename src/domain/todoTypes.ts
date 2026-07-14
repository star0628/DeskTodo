export type TodoId = string;
export type LocalDateKey = string;
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type DeadlineDisplayMode = "countdown" | "dateTime";

export interface DeadlinePattern {
  dayOffset: number;
  localTime: string;
}

export type RecurrenceRule =
  | { kind: "daily" }
  | { kind: "weekdays" }
  | { kind: "weekly"; weekdays: Weekday[] };

export interface RecurrenceTemplate {
  title: string;
  important: boolean;
  childTitles: string[];
  deadlinePattern: DeadlinePattern | null;
  deadlineDisplayMode: DeadlineDisplayMode;
}

export interface RecurrenceSeries {
  id: string;
  rule: RecurrenceRule;
  template: RecurrenceTemplate;
  nextOccurrenceOn: LocalDateKey;
  activeTaskId: TodoId | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TodoItem {
  id: TodoId;
  title: string;
  done: boolean;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  completedOn: LocalDateKey | null;
  important: boolean;
  scheduledFor: LocalDateKey | null;
  deadlineAt: string | null;
  deadlineDisplayMode: DeadlineDisplayMode;
  recurrenceSeriesId: string | null;
  children: TodoItem[];
}

export type WindowLayerMode = "alwaysOnTop" | "normal" | "alwaysOnBottom";
export type HexColor = `#${string}`;

export interface CustomThemeColors {
  canvas: HexColor;
  surface: HexColor;
  accent: HexColor;
}

export type ColorThemeId =
  | "graphite-lime"
  | "citic-red"
  | "frost-blue"
  | "jade-forest"
  | "ink-gold"
  | "custom";

export const MIN_FONT_SIZE = 12;
export const MAX_FONT_SIZE = 20;
export const DEFAULT_FONT_SIZE = 16;
export const MIN_BACKGROUND_OPACITY = 10;
export const MAX_BACKGROUND_OPACITY = 100;
export const DEFAULT_BACKGROUND_OPACITY = 90;

export interface AppSettings {
  alwaysOnTop: boolean;
  compactMode: boolean;
  theme: "system" | "dark" | "light";
  windowLayerMode: WindowLayerMode;
  colorTheme: ColorThemeId;
  customThemeColors: CustomThemeColors;
  fontSize: number;
  backgroundOpacityPercent: number;
  collapseCompletedByDefault: boolean;
}

export interface AppState {
  schemaVersion: 7;
  tasks: TodoItem[];
  recurrenceSeries: RecurrenceSeries[];
  settings: AppSettings;
}
