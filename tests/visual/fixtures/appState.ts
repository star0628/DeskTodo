import type {
  AppSettings,
  AppState,
  ColorThemeId,
  TodoItem
} from "../../../src/domain/todoTypes";

export const VISUAL_STORAGE_KEY = "desktodo:app-state";
export const VISUAL_TODAY = "2026-07-13";
export const VISUAL_FIXED_TIME = "2026-07-13T09:00:00+08:00";

export type VisualFixtureName = "empty" | "standard" | "stress" | "typography" | "history";

const CREATED_AT = "2026-07-10T01:00:00.000Z";
const UPDATED_AT = "2026-07-13T01:00:00.000Z";

const defaultSettings: AppSettings = {
  alwaysOnTop: true,
  compactMode: false,
  theme: "dark",
  windowLayerMode: "alwaysOnTop",
  colorTheme: "graphite-lime",
  customThemeColors: {
    canvas: "#111318",
    surface: "#2B303A",
    accent: "#84CC16"
  },
  fontSize: 16,
  backgroundOpacityPercent: 90,
  collapseCompletedByDefault: false
};

const standardTasks: TodoItem[] = [
  task({
    id: "important-open",
    title: "完成季度项目复盘并确认关键结论",
    important: true,
    deadlineAt: "2026-07-13T01:20:00.000Z"
  }),
  task({
    id: "parent-progress",
    title: "准备周一项目进度汇报",
    children: [
      child("progress-child-1", "整理核心数据", true, "2026-07-13T01:20:00.000Z"),
      child("progress-child-2", "复核会议附件", true, "2026-07-13T01:30:00.000Z"),
      child("progress-child-3", "补充风险事项"),
  child("progress-child-4", "发送参会人员名单")
    ]
  }),
  task({
    id: "recurring-open",
    title: "工作日检查项目待办",
    scheduledFor: VISUAL_TODAY,
    recurrenceSeriesId: "series-weekdays"
  }),
  task({
    id: "regular-open",
    title: "回复客户关于交付时间的邮件",
    deadlineAt: "2026-07-14T14:00:00.000Z",
    deadlineDisplayMode: "dateTime"
  }),
  task({
    id: "completed-today",
    title: "完成今日晨会纪要",
    done: true,
    completedAt: "2026-07-13T02:00:00.000Z",
    completedOn: VISUAL_TODAY
  }),
  task({
    id: "completed-yesterday",
    title: "归档昨日项目资料",
    done: true,
    completedAt: "2026-07-12T09:00:00.000Z",
    completedOn: "2026-07-12"
  })
];

const standardState: AppState = {
  schemaVersion: 9,
  tasks: standardTasks,
  archivedCompletions: [],
  recurrenceSeries: [
    {
      id: "series-weekdays",
      rule: { kind: "weekdays" },
      template: {
        title: "工作日检查项目待办",
        important: false,
        childTitles: [],
        deadlinePattern: null,
        deadlineDisplayMode: "countdown"
      },
      nextOccurrenceOn: "2026-07-14",
      activeTaskId: "recurring-open",
      enabled: true,
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT
    }
  ],
  settings: defaultSettings
};

const fixtureStates: Record<VisualFixtureName, AppState> = {
  empty: {
    schemaVersion: 9,
    tasks: [],
    archivedCompletions: [],
    recurrenceSeries: [],
    settings: defaultSettings
  },
  standard: standardState,
  stress: {
    schemaVersion: 9,
    tasks: Array.from({ length: 24 }, (_, index) => {
      const number = index + 1;
      const done = index >= 18;
      return task({
        id: `stress-${number}`,
        title: `${number.toString().padStart(2, "0")} · ${stressTitle(index)}`,
        important: index === 0 || index === 5,
        done,
        completedAt: done ? `2026-07-13T0${index - 17}:00:00.000Z` : null,
        completedOn: done ? VISUAL_TODAY : null
      });
    }),
    archivedCompletions: [],
    recurrenceSeries: [],
    settings: defaultSettings
  },
  typography: {
    ...standardState,
    tasks: [
      task({
        id: "long-chinese",
        title: "准备周一项目进度汇报并复核全部附件及会议材料确保最终版本准确无误"
      }),
      task({
        id: "long-english",
        title: "SuperLongEnglishTaskTitleWithoutAnyWhitespaceForOverflowTesting"
      }),
      task({
        id: "mixed-content",
        title: "中英文 Mixed Content 2026-Q3 🚀✅📌"
      }),
      ...standardTasks
    ]
  },
  history: {
    ...standardState,
    tasks: [
      ...standardTasks,
      task({
        id: "history-july-10",
        title: "提交项目周报",
        done: true,
        completedAt: "2026-07-10T08:00:00.000Z",
        completedOn: "2026-07-10"
      }),
      task({
        id: "history-july-11",
        title: "完成合同条款复核",
        done: true,
        completedAt: "2026-07-11T08:30:00.000Z",
        completedOn: "2026-07-11"
      })
    ]
  }
};

export function createVisualState(
  fixture: VisualFixtureName = "standard",
  settings: Partial<AppSettings> = {}
): AppState {
  const state = cloneState(fixtureStates[fixture]);
  const colorTheme = settings.colorTheme ?? state.settings.colorTheme;
  state.settings = {
    ...state.settings,
    ...settings,
    colorTheme,
    theme: colorTheme === "citic-red" ? "light" : "dark",
    alwaysOnTop: (settings.windowLayerMode ?? state.settings.windowLayerMode) === "alwaysOnTop"
  };
  return state;
}

export const VISUAL_THEME_IDS: readonly ColorThemeId[] = [
  "graphite-lime",
  "citic-red",
  "frost-blue",
  "jade-forest",
  "ink-gold",
  "custom"
];

function task(overrides: Partial<TodoItem> & Pick<TodoItem, "id" | "title">): TodoItem {
  return {
    id: overrides.id,
    title: overrides.title,
    done: false,
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    completedAt: null,
    completedOn: null,
    important: false,
    scheduledFor: null,
    deadlineAt: null,
    deadlineDisplayMode: "countdown",
    recurrenceSeriesId: null,
    children: [],
    ...overrides
  };
}

function child(id: string, title: string, done = false, completedAt: string | null = null): TodoItem {
  return task({
    id,
    title,
    done,
    completedAt,
    completedOn: done ? VISUAL_TODAY : null,
    important: false,
    scheduledFor: null,
    recurrenceSeriesId: null,
    children: []
  });
}

function stressTitle(index: number): string {
  return [
    "确认今天最重要的交付事项",
    "检查会议材料与附件",
    "回复客户邮件并更新记录",
    "整理项目进度和风险事项"
  ][index % 4];
}

function cloneState(state: AppState): AppState {
  return JSON.parse(JSON.stringify(state)) as AppState;
}
