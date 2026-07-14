import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { saveWindowState, StateFlags } from "@tauri-apps/plugin-window-state";
import { AppShell } from "./components/AppShell";
import { Header } from "./components/Header";
import { QuickAddInput } from "./components/QuickAddInput";
import { TaskList } from "./components/TaskList";
import { EmptyState } from "./components/EmptyState";
import { DateNavigator } from "./components/DateNavigator";
import { DailyHistoryList } from "./components/DailyHistoryList";
import { UndoToast } from "./components/UndoToast";
import { TaskSearchDialog } from "./components/TaskSearchDialog";
import { appStateRepository, fallbackDefaultState, isTauriRuntime } from "./persistence";
import {
  RecurringDeleteBehavior,
  TodoAction,
  todoReducer
} from "./domain/todoReducer";
import { getParentSubtaskProgress } from "./domain/todoSelectors";
import {
  getCompletedEntriesForDate,
  getCompletionCountByDate,
  getTodayTaskGroups,
  getTodayProgress,
} from "./domain/dailyViewSelectors";
import {
  AppState,
  CustomThemeColors,
  RecurrenceSeries,
  TodoItem
} from "./domain/todoTypes";
import { shouldSaveTodoMutation } from "./persistence/savePolicy";
import { applyWindowLayerMode } from "./persistence/windowLayer";
import { LoadStatus } from "./persistence/appStateRepository";
import { useLocalDay } from "./hooks/useLocalDay";
import { scheduleTodoFocus, scheduleTodoReveal } from "./utils/focus";
import { shouldFocusQuickAdd, shouldUndoDelete } from "./utils/keyboard";

function App() {
  const [state, setState] = useState<AppState>(() => fallbackDefaultState());
  const [hasHydrated, setHasHydrated] = useState(false);
  const today = useLocalDay();
  const [selectedDate, setSelectedDate] = useState(today);
  const [pendingUndo, setPendingUndo] = useState<PendingUndo | null>(null);
  const [backgroundOpacityPreview, setBackgroundOpacityPreview] = useState<number | null>(null);
  const [customThemePreview, setCustomThemePreview] = useState<CustomThemeColors | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [pendingSearchTarget, setPendingSearchTarget] = useState<string | null>(null);
  const previousTodayRef = useRef(today);
  const hasHydratedRef = useRef(false);
  const loadStatusRef = useRef<LoadStatus>("missing");
  const hydratedStateRef = useRef<AppState | null>(null);
  const lastSavedStateRef = useRef<AppState | null>(null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const quickAddInputRef = useRef<HTMLInputElement>(null);
  const searchTriggerRef = useRef<HTMLButtonElement>(null);

  const queueSave = useCallback((nextState: AppState) => {
    if (nextState === lastSavedStateRef.current) {
      return saveQueueRef.current;
    }

    const saveTask = saveQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        await appStateRepository.save(nextState);
        lastSavedStateRef.current = nextState;
        loadStatusRef.current = "ok";
      });

    saveQueueRef.current = saveTask.catch((error) => {
      console.warn("DeskTodo state save failed.", error);
    });

    return saveQueueRef.current;
  }, []);

  useEffect(() => {
    let isActive = true;

    async function hydrateState() {
      const loadResult = await appStateRepository.load();
      if (!isActive) return;

      const hydratedState = todoReducer(fallbackDefaultState(), {
        type: "hydrateState",
        state: loadResult.state
      });

      hydratedStateRef.current = hydratedState;
      loadStatusRef.current = loadResult.status;
      lastSavedStateRef.current = loadResult.status === "ok" ? hydratedState : null;
      setState(hydratedState);
      hasHydratedRef.current = true;
      setHasHydrated(true);
    }

    void hydrateState();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    const previousToday = previousTodayRef.current;
    setSelectedDate((current) => (current === previousToday || current > today ? today : current));
    previousTodayRef.current = today;
  }, [today]);

  useEffect(() => {
    window.__DESKTODO_FLUSH_STATE__ = () => saveQueueRef.current;
    window.__DESKTODO_LAST_STATE__ = state;
    window.__DESKTODO_REQUEST_QUIT__ = requestQuitFromFrontend;

    return () => {
      delete window.__DESKTODO_FLUSH_STATE__;
      delete window.__DESKTODO_LAST_STATE__;
      delete window.__DESKTODO_REQUEST_QUIT__;
    };
  }, [state]);

  useEffect(() => {
    if (!isTauriRuntime()) return;

    let unlistenQuit: (() => void) | undefined;
    let unlistenReapplyLayer: (() => void) | undefined;

    void listen("desktodo://request-quit", () => {
      void requestQuitFromFrontend();
    }).then((handler) => {
      unlistenQuit = handler;
    });

    void listen("desktodo://reapply-window-layer", () => {
      const mode = window.__DESKTODO_LAST_STATE__?.settings.windowLayerMode;
      if (!mode) return;

      void applyWindowLayerMode(mode).catch((error) => {
        console.warn("DeskTodo window layer reapply failed.", error);
      });
    }).then((handler) => {
      unlistenReapplyLayer = handler;
    });

    return () => {
      unlistenQuit?.();
      unlistenReapplyLayer?.();
    };
  }, []);

  useEffect(() => {
    if (!hasHydrated) return;

    void applyWindowLayerMode(state.settings.windowLayerMode).catch((error) => {
      console.warn("DeskTodo window layer update failed.", error);
    });
  }, [hasHydrated, state.settings.windowLayerMode]);

  const dispatchTodoAction = useCallback(
    (action: TodoAction) => {
      setState((currentState) => {
        const nextState = todoReducer(currentState, action);

        if (
          shouldSaveTodoMutation({
            hasHydrated: hasHydratedRef.current,
            loadStatus: loadStatusRef.current,
            previousState: currentState,
            nextState,
            action
          })
        ) {
          void queueSave(nextState);
        }

        return nextState;
      });
    },
    [queueSave]
  );

  const isToday = selectedDate === today;

  useEffect(() => {
    if (!hasHydrated) return;
    dispatchTodoAction({ type: "materializeRecurrences", today });
  }, [dispatchTodoAction, hasHydrated, today]);

  const todayTaskGroups = useMemo(() => getTodayTaskGroups(state, today), [state, today]);
  const todayProgress = useMemo(() => getTodayProgress(state, today), [state, today]);
  const historyEntries = useMemo(
    () => getCompletedEntriesForDate(state, selectedDate),
    [selectedDate, state]
  );
  const completionCounts = useMemo(() => getCompletionCountByDate(state), [state]);
  const progressByTaskId = useMemo(
    () => new Map(state.tasks.map((task) => [task.id, getParentSubtaskProgress(task)])),
    [state.tasks]
  );
  const recurrenceById = useMemo(
    () =>
      new Map(
        state.recurrenceSeries
          .filter((series) => series.enabled)
          .map((series) => [series.id, series])
      ),
    [state.recurrenceSeries]
  );
  const progressLabel = isToday
    ? `${todayProgress.done} / ${todayProgress.total} done`
    : `${historyEntries.length} done`;
  const progressRatio = isToday
    ? todayProgress.total === 0 ? 0 : todayProgress.done / todayProgress.total
    : historyEntries.length > 0 ? 1 : 0;

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if (
        hasHydrated &&
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "f" &&
        document.querySelector("dialog[open]") === null
      ) {
        event.preventDefault();
        setIsSearchOpen(true);
        return;
      }
      if (
        shouldFocusQuickAdd(
          event,
          hasHydrated && isToday,
          document.querySelector("dialog[open]") !== null
        )
      ) {
        event.preventDefault();
        quickAddInputRef.current?.focus();
      }
    }

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [hasHydrated, isToday]);

  useEffect(() => {
    if (!pendingSearchTarget) return;
    scheduleTodoReveal(pendingSearchTarget);
    setPendingSearchTarget(null);
  }, [pendingSearchTarget, selectedDate]);

  const deleteTask = useCallback(
    (task: TodoItem, behavior?: RecurringDeleteBehavior) => {
      const index = state.tasks.findIndex((item) => item.id === task.id);
      if (index < 0) return;
      const series = task.recurrenceSeriesId
        ? state.recurrenceSeries.find((item) => item.id === task.recurrenceSeriesId)
        : undefined;
      setPendingUndo({ kind: "task", task, index, series });
      dispatchTodoAction({ type: "deleteTask", id: task.id, recurringBehavior: behavior });
    },
    [dispatchTodoAction, state.recurrenceSeries, state.tasks]
  );

  const deleteSubtask = useCallback(
    (parentId: string, task: TodoItem) => {
      const parent = state.tasks.find((item) => item.id === parentId);
      const index = parent?.children.findIndex((child) => child.id === task.id) ?? -1;
      if (index < 0) return;
      setPendingUndo({ kind: "subtask", parentId, task, index });
      dispatchTodoAction({ type: "deleteSubtask", parentId, childId: task.id });
    },
    [dispatchTodoAction, state.tasks]
  );

  const undoDelete = useCallback(() => {
    if (!pendingUndo) return;
    if (pendingUndo.kind === "task") {
      dispatchTodoAction({
        type: "restoreTask",
        task: pendingUndo.task,
        index: pendingUndo.index,
        series: pendingUndo.series
      });
    } else {
      dispatchTodoAction({
        type: "restoreSubtask",
        parentId: pendingUndo.parentId,
        task: pendingUndo.task,
        index: pendingUndo.index
      });
    }
    scheduleTodoFocus(pendingUndo.task.id);
    setPendingUndo(null);
  }, [dispatchTodoAction, pendingUndo]);

  const dismissUndo = useCallback(() => setPendingUndo(null), []);

  useEffect(() => {
    function handleUndoShortcut(event: KeyboardEvent) {
      if (!shouldUndoDelete(event, pendingUndo !== null)) return;
      event.preventDefault();
      undoDelete();
    }

    window.addEventListener("keydown", handleUndoShortcut);
    return () => window.removeEventListener("keydown", handleUndoShortcut);
  }, [pendingUndo, undoDelete]);

  return (
    <AppShell
      settings={
        {
          ...state.settings,
          backgroundOpacityPercent:
            backgroundOpacityPreview ?? state.settings.backgroundOpacityPercent,
          customThemeColors: customThemePreview ?? state.settings.customThemeColors
        }
      }
    >
      <Header
        progressLabel={progressLabel}
        progressRatio={progressRatio}
        windowLayerMode={state.settings.windowLayerMode}
        onWindowLayerModeChange={(mode) => dispatchTodoAction({ type: "setWindowLayerMode", mode })}
        settings={state.settings}
        dispatch={dispatchTodoAction}
        onBackgroundOpacityPreview={setBackgroundOpacityPreview}
        onCustomThemePreview={setCustomThemePreview}
      />
      <DateNavigator
        selectedDate={selectedDate}
        today={today}
        completionCounts={completionCounts}
        onChange={setSelectedDate}
        onOpenSearch={() => setIsSearchOpen(true)}
        searchTriggerRef={searchTriggerRef}
      />
      {!hasHydrated ? (
        <section className="loading-state" aria-live="polite">
          正在加载…
        </section>
      ) : (
        isToday ? (
          <>
            <QuickAddInput
              ref={quickAddInputRef}
              onAdd={(title) => dispatchTodoAction({ type: "addTask", title })}
            />
            {todayTaskGroups.activeTasks.length + todayTaskGroups.completedTasks.length === 0 ? (
              <EmptyState />
            ) : (
              <TaskList
                activeTasks={todayTaskGroups.activeTasks}
                completedTasks={todayTaskGroups.completedTasks}
                today={today}
                recurrenceById={recurrenceById}
                dispatch={dispatchTodoAction}
                onDeleteTask={deleteTask}
                onDeleteSubtask={deleteSubtask}
                progressByTaskId={progressByTaskId}
                collapseCompletedByDefault={state.settings.collapseCompletedByDefault}
              />
            )}
          </>
        ) : (
          <DailyHistoryList entries={historyEntries} />
        )
      )}
      {pendingUndo && (
        <UndoToast
          key={`${pendingUndo.kind}-${pendingUndo.task.id}`}
          message={`已删除“${pendingUndo.task.title}”`}
          onUndo={undoDelete}
          onDismiss={dismissUndo}
        />
      )}
      <TaskSearchDialog
        open={isSearchOpen}
        state={state}
        today={today}
        onNavigate={(date, targetId) => {
          setSelectedDate(date);
          setPendingSearchTarget(targetId);
        }}
        onClose={() => setIsSearchOpen(false)}
        returnFocusRef={searchTriggerRef}
      />
    </AppShell>
  );
}

type PendingUndo =
  | { kind: "task"; task: TodoItem; index: number; series?: RecurrenceSeries }
  | { kind: "subtask"; parentId: string; task: TodoItem; index: number };

async function requestQuitFromFrontend() {
  if (!isTauriRuntime()) return;

  try {
    await window.__DESKTODO_FLUSH_STATE__?.();
    await saveWindowState(StateFlags.POSITION | StateFlags.SIZE);
    await invoke("desktodo_quit");
  } catch (error) {
    console.warn("DeskTodo quit flush failed.", error);
    try {
      await invoke("desktodo_quit");
    } catch (quitError) {
      console.warn("DeskTodo quit failed.", quitError);
    }
  }
}

export default App;
