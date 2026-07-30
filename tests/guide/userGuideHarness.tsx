import React, { useMemo, useReducer, useState } from "react";
import ReactDOM from "react-dom/client";
import type {
  CalendarEvent,
  CalendarSource,
  CalendarSourcePaletteColor,
  CalendarState
} from "../../src/calendar/domain/calendarTypes";
import { calendarReducer } from "../../src/calendar/domain/calendarReducer";
import { getCalendarEventCountByDate, getCalendarEventsForDate } from "../../src/calendar/domain/calendarSelectors";
import type { CalendarIntegration } from "../../src/calendar/hooks/useCalendarIntegration";
import { AppShell } from "../../src/components/AppShell";
import { CalendarAgenda } from "../../src/components/CalendarAgenda";
import { DateNavigator } from "../../src/components/DateNavigator";
import { Header } from "../../src/components/Header";
import { QuickAddInput } from "../../src/components/QuickAddInput";
import { TaskList } from "../../src/components/TaskList";
import {
  getTodayProgress,
  getTodayTaskGroups
} from "../../src/domain/dailyViewSelectors";
import { localDeadlineToIso } from "../../src/domain/deadline";
import { TodoAction, todoReducer } from "../../src/domain/todoReducer";
import type {
  AppState,
  LocalDateKey,
  TodoItem
} from "../../src/domain/todoTypes";
import { fallbackDefaultState } from "../../src/persistence";
import { getParentSubtaskProgress } from "../../src/domain/todoSelectors";
import "../../src/styles/fonts.css";
import "../../src/styles/tokens.css";
import "../../src/styles/globals.css";
import "./userGuideHarness.css";

const GUIDE_TODAY = "2026-07-30" as LocalDateKey;
const CREATED_AT = "2026-07-30T00:30:00.000Z";
const UPDATED_AT = "2026-07-30T01:15:00.000Z";

const PRIMARY_SOURCE: CalendarSource = {
  id: "guide-calendar-work",
  name: "项目日历",
  color: "#4da3ff",
  region: "global",
  kind: "published",
  etag: null,
  lastModified: null,
  syncState: "idle",
  activeGeneration: 1,
  lastAttemptAt: "2026-07-30T01:20:00.000Z",
  lastSuccessAt: "2026-07-30T01:20:00.000Z",
  failureCount: 0,
  nextRetryAt: null,
  errorCode: null
};

const GUIDE_EVENTS: CalendarEvent[] = [
  {
    id: "guide-event-product",
    sourceId: PRIMARY_SOURCE.id,
    uid: "guide-product-weekly",
    recurrenceId: null,
    title: "产品周会",
    location: "线上会议",
    description: "确认本周重点和负责人",
    time: {
      kind: "timed",
      startsAt: localDeadlineToIso(GUIDE_TODAY, "10:00")!,
      endsAt: localDeadlineToIso(GUIDE_TODAY, "11:00")!,
      timeZone: "Asia/Shanghai"
    }
  },
  {
    id: "guide-event-review",
    sourceId: PRIMARY_SOURCE.id,
    uid: "guide-design-review",
    recurrenceId: null,
    title: "设计评审",
    location: "会议室 A",
    description: "只读 Apple 日历示例",
    time: {
      kind: "timed",
      startsAt: localDeadlineToIso(GUIDE_TODAY, "14:30")!,
      endsAt: localDeadlineToIso(GUIDE_TODAY, "15:30")!,
      timeZone: "Asia/Shanghai"
    }
  }
];

const INITIAL_CALENDAR_STATE: CalendarState = {
  schemaVersion: 2,
  sources: [PRIMARY_SOURCE],
  snapshotsBySource: {
    [PRIMARY_SOURCE.id]: GUIDE_EVENTS
  }
};

function todo(overrides: Partial<TodoItem> & Pick<TodoItem, "id" | "title">): TodoItem {
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
    timeBlock: null,
    calendarEventRef: null,
    children: [],
    ...overrides
  };
}

function createInitialAppState(): AppState {
  const state = fallbackDefaultState();
  return {
    ...state,
    settings: {
      ...state.settings,
      backgroundOpacityPercent: 96,
      collapseCompletedByDefault: false,
      calendarAgendaCollapsed: false
    },
    tasks: [
      todo({
        id: "guide-important",
        title: "准备项目汇报",
        important: true,
        children: [
          todo({
            id: "guide-child-data",
            title: "整理核心数据",
            done: true,
            completedAt: "2026-07-30T01:00:00.000Z",
            completedOn: GUIDE_TODAY
          }),
          todo({
            id: "guide-child-risk",
            title: "补充风险事项"
          })
        ]
      }),
      todo({
        id: "guide-email",
        title: "回复客户邮件"
      }),
      todo({
        id: "guide-notes",
        title: "整理会议纪要",
        scheduledFor: GUIDE_TODAY,
        timeBlock: {
          kind: "timed",
          startsAt: localDeadlineToIso(GUIDE_TODAY, "14:00")!,
          endsAt: localDeadlineToIso(GUIDE_TODAY, "15:00")!
        }
      }),
      todo({
        id: "guide-completed",
        title: "完成晨会同步",
        done: true,
        completedAt: "2026-07-30T00:50:00.000Z",
        completedOn: GUIDE_TODAY
      })
    ]
  };
}

function GuideAppHarness() {
  const [state, dispatch] = useReducer(todoReducer, undefined, createInitialAppState);
  const [selectedDate, setSelectedDate] = useState<LocalDateKey>(GUIDE_TODAY);
  const [calendarState, setCalendarState] = useState(INITIAL_CALENDAR_STATE);

  const calendar = useMemo<CalendarIntegration>(
    () => ({
      state: calendarState,
      hasHydrated: true,
      available: true,
      addSource: async ({ name }) => {
        const source: CalendarSource = {
          ...PRIMARY_SOURCE,
          id: "guide-calendar-added",
          name: name?.trim() || "家庭安排",
          color: "#2dd4bf",
          region: "chinaMainland",
          activeGeneration: 1,
          lastAttemptAt: "2026-07-30T01:25:00.000Z",
          lastSuccessAt: "2026-07-30T01:25:00.000Z"
        };
        setCalendarState((current) =>
          calendarReducer(current, {
            type: "addCalendarSource",
            source,
            events: []
          })
        );
      },
      removeSource: async (sourceId) => {
        setCalendarState((current) =>
          calendarReducer(current, {
            type: "removeCalendarSource",
            sourceId
          })
        );
      },
      renameSource: async (sourceId, name) => {
        setCalendarState((current) =>
          calendarReducer(current, {
            type: "renameCalendarSource",
            sourceId,
            name
          })
        );
      },
      setSourceColor: async (
        sourceId: string,
        color: CalendarSourcePaletteColor
      ) => {
        setCalendarState((current) =>
          calendarReducer(current, {
            type: "setCalendarSourceColor",
            sourceId,
            color
          })
        );
      },
      refreshSource: async () => undefined,
      refreshAll: async () => undefined,
      flush: async () => undefined
    }),
    [calendarState]
  );

  const progress = getTodayProgress(state, GUIDE_TODAY);
  const groups = getTodayTaskGroups(state, GUIDE_TODAY);
  const progressByTaskId = useMemo(
    () =>
      new Map(
        state.tasks.map((task) => [
          task.id,
          getParentSubtaskProgress(task)
        ])
      ),
    [state.tasks]
  );
  const calendarEvents = getCalendarEventsForDate(calendarState, selectedDate);
  const calendarEventCounts = getCalendarEventCountByDate(calendarState);
  const importedEventRefs = new Set(
    state.tasks.flatMap((task) =>
      task.calendarEventRef ? [task.calendarEventRef] : []
    )
  );

  function dispatchAction(action: TodoAction) {
    dispatch(action);
  }

  return (
    <AppShell settings={state.settings}>
      <Header
        progressLabel={`${progress.done} / ${progress.total}`}
        progressRatio={progress.total === 0 ? 0 : progress.done / progress.total}
        windowLayerMode={state.settings.windowLayerMode}
        onWindowLayerModeChange={(mode) =>
          dispatchAction({ type: "setWindowLayerMode", mode })
        }
        windowLayerReady
        windowLayerAvailable
        windowLayerPending={false}
        windowLayerError={null}
        flushWindowState={async () => undefined}
        settings={state.settings}
        appState={state}
        dispatch={dispatchAction}
        calendarIntegration={calendar}
      />
      <DateNavigator
        selectedDate={selectedDate}
        today={GUIDE_TODAY}
        calendarEventCounts={calendarEventCounts}
        onChange={setSelectedDate}
        onOpenSearch={() => undefined}
      />
      <CalendarAgenda
        date={selectedDate}
        today={GUIDE_TODAY}
        events={calendarEvents}
        sources={calendarState.sources}
        collapsed={state.settings.calendarAgendaCollapsed}
        importedEventRefs={importedEventRefs}
        onCollapsedChange={(collapsed) =>
          dispatchAction({
            type: "setCalendarAgendaCollapsed",
            collapsed
          })
        }
        onAddEvent={(draft) =>
          dispatchAction({
            type: "addTaskFromCalendar",
            ...draft,
            today: GUIDE_TODAY
          })
        }
      />
      <QuickAddInput
        onAdd={(title) =>
          dispatchAction({
            type: "addTask",
            title,
            today: GUIDE_TODAY
          })
        }
      />
      <TaskList
        activeTasks={groups.activeTasks}
        completedTasks={groups.completedTasks}
        today={GUIDE_TODAY}
        dispatch={dispatchAction}
        onDeleteTask={(task) =>
          dispatchAction({ type: "deleteTask", id: task.id })
        }
        onDeleteSubtask={(parentId, task) =>
          dispatchAction({
            type: "deleteSubtask",
            parentId,
            childId: task.id
          })
        }
        progressByTaskId={progressByTaskId}
      />
    </AppShell>
  );
}

function AppleLinkDiagram() {
  const steps = [
    ["1", "打开“日历”", "轻点底部的“日历”"],
    ["2", "选择 iCloud 日历", "轻点右侧的简介按钮 ⓘ"],
    ["3", "开启“公开日历”", "只公开愿意被链接查看的内容"],
    ["4", "轻点“共享链接”", "选择“拷贝”并粘贴到 DeskTodo"]
  ];

  return (
    <main className="apple-link-guide" aria-label="获取 Apple 公开日历链接">
      <header>
        <span>APPLE CALENDAR</span>
        <h1>复制公开日历链接</h1>
        <p>iPhone / iPad 的四步示意</p>
      </header>
      <div className="apple-link-steps">
        {steps.map(([number, title, detail]) => (
          <section key={number} className="apple-link-step">
            <span className="apple-link-number">{number}</span>
            <div className="apple-link-phone">
              <span className="apple-link-phone-notch" />
              <strong>{title}</strong>
              <p>{detail}</p>
              {number === "3" && (
                <span className="apple-link-toggle" aria-hidden="true">
                  <i />
                </span>
              )}
              {number === "4" && (
                <span className="apple-link-copy">拷贝链接</span>
              )}
            </div>
          </section>
        ))}
      </div>
      <aside>
        <strong>隐私提醒</strong>
        <span>公开链接相当于只读查看凭据，请勿公开发布或截图泄露。</span>
      </aside>
    </main>
  );
}

function GuideHarness() {
  const scene = new URLSearchParams(window.location.search).get("scene") ?? "app";
  if (scene === "app") return <GuideAppHarness />;
  if (scene === "apple-link") return <AppleLinkDiagram />;
  return (
    <main className="guide-error">
      未知文档场景：<code>{scene}</code>
    </main>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <GuideHarness />
  </React.StrictMode>
);
