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
import {
  createHistoryDeletionPlan,
  HistoryDeletionPlan,
  HistoryDeletionSnapshot
} from "./domain/historyDeletion";
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
  getDateViewMode,
  getFutureProgress,
  getFutureTaskGroups,
  getScheduledCountByDate,
  getTodayTaskGroups,
  getTodayProgress
} from "./domain/dailyViewSelectors";
import {
  AppState,
  CustomThemeColors,
  RecurrenceSeries,
  TodoItem,
  WindowLayerMode
} from "./domain/todoTypes";
import { shouldSaveTodoMutation } from "./persistence/savePolicy";
import { windowLayerController } from "./persistence/windowLayer";
import { getRecoveredWindowLayerMode } from "./persistence/windowRecovery";
import { LoadStatus } from "./persistence/appStateRepository";
import { useLocalDay } from "./hooks/useLocalDay";
import { formatLocalDateLabel } from "./utils/date";
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
  const [persistenceRevision, setPersistenceRevision] = useState(0);
  const [windowLayerInitialized, setWindowLayerInitialized] = useState(false);
  const [windowLayerSnapshot, setWindowLayerSnapshot] = useState(() =>
    windowLayerController.getSnapshot()
  );
  const previousTodayRef = useRef(today);
  const stateRef = useRef<AppState>(state);
  const hasHydratedRef = useRef(false);
  const loadStatusRef = useRef<LoadStatus>("missing");
  const lastSavedStateRef = useRef<AppState | null>(null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const pendingSaveRevisionRef = useRef(0);
  const queuedSaveRevisionRef = useRef(0);
  const savedSaveRevisionRef = useRef(0);
  const failedSaveRevisionRef = useRef(0);
  const latestWindowLayerRequestIdRef = useRef(0);
  const pendingRecoveryRef = useRef<WindowRecoveryEvent | null>(null);
  const latestRecoveryIdRef = useRef(0);
  const latestHideRequestIdRef = useRef(0);
  const windowLayerInitializationStartedRef = useRef(false);
  const windowLayerInitializedRef = useRef(false);
  const quickAddInputRef = useRef<HTMLInputElement>(null);
  const searchTriggerRef = useRef<HTMLButtonElement>(null);

  const queueSave = useCallback((nextState: AppState, revision: number) => {
    if (nextState === lastSavedStateRef.current) {
      savedSaveRevisionRef.current = Math.max(savedSaveRevisionRef.current, revision);
      return saveQueueRef.current;
    }

    const saveTask = saveQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        if (nextState === lastSavedStateRef.current) return;
        await appStateRepository.save(nextState);
        lastSavedStateRef.current = nextState;
        loadStatusRef.current = "ok";
        savedSaveRevisionRef.current = Math.max(savedSaveRevisionRef.current, revision);
        if (failedSaveRevisionRef.current <= revision) {
          failedSaveRevisionRef.current = 0;
        }

        // A settings-only change can legitimately be withheld while repairing
        // an invalid/error fallback. Once the first real content save succeeds,
        // mark the newest committed state dirty without breaking serial ordering.
        const newestState = stateRef.current;
        if (newestState !== nextState && pendingSaveRevisionRef.current <= revision) {
          pendingSaveRevisionRef.current += 1;
          setPersistenceRevision(pendingSaveRevisionRef.current);
        }
      });

    saveQueueRef.current = saveTask;
    return saveTask;
  }, []);

  const queuePendingSave = useCallback(() => {
    const revision = pendingSaveRevisionRef.current;
    if (revision === 0 || revision <= savedSaveRevisionRef.current) {
      return saveQueueRef.current;
    }

    const retryFailedRevision = failedSaveRevisionRef.current >= revision;
    if (revision <= queuedSaveRevisionRef.current && !retryFailedRevision) {
      return saveQueueRef.current;
    }

    queuedSaveRevisionRef.current = revision;
    failedSaveRevisionRef.current = 0;
    const saveTask = queueSave(stateRef.current, revision);
    void saveTask.catch((error) => {
      failedSaveRevisionRef.current = Math.max(failedSaveRevisionRef.current, revision);
      console.warn("DeskTodo state save failed.", error);
    });
    return saveTask;
  }, [queueSave]);
  // Persistence runs after React has committed the reducer result. It never
  // runs inside a state updater, which keeps StrictMode/concurrent retries pure.
  useEffect(() => {
    void queuePendingSave().catch(() => undefined);
  }, [persistenceRevision, queuePendingSave]);

  const dispatchTodoAction = useCallback((action: TodoAction) => {
    if (!hasHydratedRef.current) return;

    const currentState = stateRef.current;
    const nextState = todoReducer(currentState, action);
    if (nextState === currentState) return;

    stateRef.current = nextState;
    setState(nextState);

    if (
      shouldSaveTodoMutation({
        hasHydrated: true,
        loadStatus: loadStatusRef.current,
        previousState: currentState,
        nextState,
        action
      })
    ) {
      pendingSaveRevisionRef.current += 1;
      setPersistenceRevision(pendingSaveRevisionRef.current);
    }
  }, []);

  const requestWindowLayerMode = useCallback(
    async (
      mode: WindowLayerMode,
      persistOnSuccess = true,
      options?: { recoveryId?: number }
    ) => {
      const request = windowLayerController.request(mode, options);
      const requestId = windowLayerController.getLatestRequestId();
      latestWindowLayerRequestIdRef.current = Math.max(
        latestWindowLayerRequestIdRef.current,
        requestId
      );

      const result = await request;
      if (
        persistOnSuccess &&
        result.status === "applied" &&
        result.requestId === latestWindowLayerRequestIdRef.current
      ) {
        dispatchTodoAction({ type: "setWindowLayerMode", mode: result.mode });
      }

      return result;
    },
    [dispatchTodoAction]
  );

  const flushState = useCallback(async () => {
    await windowLayerController.flush();
    try {
      await queuePendingSave();
    } catch (error) {
      // A previous failed write remains retryable. A flush is an explicit
      // durability boundary, so make one fresh serial attempt before giving up.
      console.warn("DeskTodo retrying a failed state save during flush.", error);
      await queuePendingSave();
    }
    await saveQueueRef.current;
  }, [queuePendingSave]);

  const requestQuitFromFrontend = useCallback(async () => {
    if (!isTauriRuntime()) return;

    try {
      await flushState();
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
  }, [flushState]);

  useEffect(() => {
    let isActive = true;

    async function hydrateState() {
      let loadResult: Awaited<ReturnType<typeof appStateRepository.load>>;
      try {
        loadResult = await appStateRepository.load();
      } catch (error) {
        console.warn("DeskTodo state hydration failed; using safe fallback.", error);
        loadResult = { state: fallbackDefaultState(), status: "error" };
      }
      if (!isActive) return;

      const hydratedState = todoReducer(fallbackDefaultState(), {
        type: "hydrateState",
        state: loadResult.state
      });

      loadStatusRef.current = loadResult.status;
      lastSavedStateRef.current = loadResult.status === "ok" ? hydratedState : null;
      stateRef.current = hydratedState;
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
    setSelectedDate((current) => (current === previousToday ? today : current));
    previousTodayRef.current = today;
  }, [today]);

  useEffect(() => {
    window.__DESKTODO_FLUSH_STATE__ = flushState;
    window.__DESKTODO_REQUEST_QUIT__ = requestQuitFromFrontend;

    return () => {
      delete window.__DESKTODO_FLUSH_STATE__;
      delete window.__DESKTODO_REQUEST_QUIT__;
    };
  }, [flushState, requestQuitFromFrontend]);

  useEffect(() => {
    return windowLayerController.subscribe(() => {
      setWindowLayerSnapshot(windowLayerController.getSnapshot());
    });
  }, []);

  const handleWindowRecovery = useCallback(
    (payload: WindowRecoveryEvent) => {
      if (payload.recoveryId <= 0) return;
      if (!hasHydratedRef.current || !windowLayerInitializedRef.current) {
        const pending = pendingRecoveryRef.current;
        if (!pending || payload.recoveryId >= pending.recoveryId) {
          pendingRecoveryRef.current = payload;
        }
        return;
      }

      if (payload.recoveryId <= latestRecoveryIdRef.current) return;
      latestRecoveryIdRef.current = payload.recoveryId;

      void (async () => {
        // Let an in-flight native acknowledgement settle before deciding the
        // recovery target. This prevents recovery from reading a stale React
        // state between a successful native apply and its reducer commit.
        await windowLayerController.flush();

        const startedInCurrentSession =
          payload.modeSessionIdAtStart === windowLayerController.getSessionId();
        if (
          startedInCurrentSession &&
          payload.modeRequestIdAtStart < latestWindowLayerRequestIdRef.current
        ) {
          return;
        }

        const currentMode =
          windowLayerController.getLastAppliedMode() ?? stateRef.current.settings.windowLayerMode;
        const recoveredMode = getRecoveredWindowLayerMode(currentMode);
        const result = await requestWindowLayerMode(
          recoveredMode,
          recoveredMode !== currentMode,
          { recoveryId: payload.recoveryId }
        );
        if (result.status !== "applied") return;

        const acknowledgement = await windowLayerController.completeRecovery(payload.recoveryId);
        if (acknowledgement === "failed") {
          console.warn("DeskTodo native window recovery acknowledgement failed.");
        }
      })().catch((error) => {
        console.warn("DeskTodo window recovery reconciliation failed.", error);
      });
    },
    [requestWindowLayerMode]
  );

  const handleNativeHideRequest = useCallback(
    (payload: WindowHideEvent) => {
      if (payload.hideId <= latestHideRequestIdRef.current) return;
      latestHideRequestIdRef.current = payload.hideId;

      void (async () => {
        try {
          await flushState();
        } catch (error) {
          console.warn("DeskTodo state flush before native hide acknowledgement failed.", error);
        } finally {
          await invoke("desktodo_hide_main_window", { hideId: payload.hideId });
        }
      })().catch((error) => {
        console.warn("DeskTodo native hide acknowledgement failed.", error);
      });
    },
    [flushState]
  );

  useEffect(() => {
    if (!hasHydrated || windowLayerInitializationStartedRef.current) return;
    windowLayerInitializationStartedRef.current = true;
    let isActive = true;

    void (async () => {
      if (isTauriRuntime()) {
        const mode = stateRef.current.settings.windowLayerMode;
        const result = await windowLayerController.initialize(mode);
        latestWindowLayerRequestIdRef.current = Math.max(
          latestWindowLayerRequestIdRef.current,
          windowLayerController.getLatestRequestId()
        );
        if (result.status === "failed") {
          console.warn("DeskTodo native startup window initialization failed.", result.error);
        }
      }

      if (!isActive) return;
      windowLayerInitializedRef.current = true;
      setWindowLayerInitialized(true);
    })().catch((error) => {
      console.warn("DeskTodo window layer initialization failed.", error);
      if (!isActive) return;
      windowLayerInitializedRef.current = true;
      setWindowLayerInitialized(true);
    });

    return () => {
      isActive = false;
    };
  }, [hasHydrated]);

  useEffect(() => {
    if (!hasHydrated || !windowLayerInitialized || !pendingRecoveryRef.current) return;
    const pending = pendingRecoveryRef.current;
    pendingRecoveryRef.current = null;
    handleWindowRecovery(pending);
  }, [handleWindowRecovery, hasHydrated, windowLayerInitialized]);

  useEffect(() => {
    if (!isTauriRuntime()) return;

    let unlistenQuit: (() => void) | undefined;
    let unlistenRecovery: (() => void) | undefined;
    let unlistenHide: (() => void) | undefined;

    void listen("desktodo://request-quit", () => {
      void requestQuitFromFrontend();
    })
      .then((handler) => {
        unlistenQuit = handler;
      })
      .catch((error) => console.warn("DeskTodo quit listener failed.", error));

    void listen<unknown>("desktodo://recover-window", (event) => {
      handleWindowRecovery(parseWindowRecoveryEvent(event.payload));
    })
      .then((handler) => {
        unlistenRecovery = handler;
      })
      .catch((error) => console.warn("DeskTodo recovery listener failed.", error));

    void listen<unknown>("desktodo://request-hide", (event) => {
      const payload = parseWindowHideEvent(event.payload);
      if (payload) handleNativeHideRequest(payload);
    })
      .then((handler) => {
        unlistenHide = handler;
      })
      .catch((error) => console.warn("DeskTodo hide listener failed.", error));

    return () => {
      unlistenQuit?.();
      unlistenRecovery?.();
      unlistenHide?.();
    };
  }, [handleNativeHideRequest, handleWindowRecovery, requestQuitFromFrontend]);

  const dateViewMode = getDateViewMode(selectedDate, today);
  const isToday = dateViewMode === "today";
  const isEditableTaskDate = dateViewMode !== "past";

  useEffect(() => {
    if (!hasHydrated) return;
    dispatchTodoAction({ type: "materializeRecurrences", today });
  }, [dispatchTodoAction, hasHydrated, today]);

  const todayTaskGroups = useMemo(() => getTodayTaskGroups(state, today), [state, today]);
  const todayProgress = useMemo(() => getTodayProgress(state, today), [state, today]);
  const futureTaskGroups = useMemo(
    () => getFutureTaskGroups(state, selectedDate),
    [selectedDate, state]
  );
  const futureProgress = useMemo(
    () => getFutureProgress(state, selectedDate),
    [selectedDate, state]
  );
  const historyEntries = useMemo(
    () => getCompletedEntriesForDate(state, selectedDate),
    [selectedDate, state]
  );
  const completionCounts = useMemo(() => getCompletionCountByDate(state), [state]);
  const scheduledCounts = useMemo(
    () => getScheduledCountByDate(state, today),
    [state, today]
  );
  const selectedTaskGroups = isToday ? todayTaskGroups : futureTaskGroups;
  const selectedProgress = isToday ? todayProgress : futureProgress;
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
  const progressLabel =
    dateViewMode === "past"
      ? `${historyEntries.length} done`
      : `${selectedProgress.done} / ${selectedProgress.total} done`;
  const progressRatio =
    dateViewMode === "past"
      ? historyEntries.length > 0
        ? 1
        : 0
      : selectedProgress.total === 0
        ? 0
        : selectedProgress.done / selectedProgress.total;

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
          hasHydrated && isEditableTaskDate,
          document.querySelector("dialog[open]") !== null
        )
      ) {
        event.preventDefault();
        quickAddInputRef.current?.focus();
      }
    }

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [hasHydrated, isEditableTaskDate]);

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

  const createHistoryDeletePlan = useCallback(
    (targets: Parameters<typeof createHistoryDeletionPlan>[1]) =>
      createHistoryDeletionPlan(state, targets),
    [state]
  );

  const deleteHistory = useCallback(
    (plan: HistoryDeletionPlan) => {
      const currentPlan = createHistoryDeletionPlan(state, plan.targets);
      if (!currentPlan) return;
      setPendingUndo({
        kind: "history",
        snapshot: currentPlan.snapshot,
        count: currentPlan.deletedEntryCount,
        focusId: currentPlan.focusId
      });
      dispatchTodoAction({ type: "deleteHistoryEntries", targets: currentPlan.targets });
    },
    [dispatchTodoAction, state]
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
      scheduleTodoFocus(pendingUndo.task.id);
    } else if (pendingUndo.kind === "subtask") {
      dispatchTodoAction({
        type: "restoreSubtask",
        parentId: pendingUndo.parentId,
        task: pendingUndo.task,
        index: pendingUndo.index
      });
      scheduleTodoFocus(pendingUndo.task.id);
    } else {
      dispatchTodoAction({
        type: "restoreHistoryEntries",
        snapshot: pendingUndo.snapshot
      });
      scheduleTodoReveal(pendingUndo.focusId);
    }
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
        onWindowLayerModeChange={(mode) => {
          void requestWindowLayerMode(mode);
        }}
        windowLayerReady={hasHydrated && windowLayerInitialized}
        windowLayerAvailable={windowLayerSnapshot.available}
        windowLayerPending={windowLayerSnapshot.isPending}
        windowLayerError={getWindowLayerErrorMessage(windowLayerSnapshot.error)}
        flushWindowState={flushState}
        settings={state.settings}
        appState={state}
        dispatch={dispatchTodoAction}
        onBackgroundOpacityPreview={setBackgroundOpacityPreview}
        onCustomThemePreview={setCustomThemePreview}
      />
      <DateNavigator
        selectedDate={selectedDate}
        today={today}
        completionCounts={completionCounts}
        scheduledCounts={scheduledCounts}
        onChange={setSelectedDate}
        onOpenSearch={() => setIsSearchOpen(true)}
        searchTriggerRef={searchTriggerRef}
      />
      {!hasHydrated ? (
        <section className="loading-state" aria-live="polite">
          正在加载…
        </section>
      ) : (
        isEditableTaskDate ? (
          <>
            <QuickAddInput
              key={`quick-add-${selectedDate}`}
              ref={quickAddInputRef}
              placeholder={
                isToday
                  ? "在此添加任务，Enter 创建"
                  : `为${formatLocalDateLabel(selectedDate, today)}添加任务，Enter 创建`
              }
              onAdd={(title) =>
                dispatchTodoAction({
                  type: "addTask",
                  title,
                  scheduledFor: isToday ? null : selectedDate,
                  today
                })
              }
            />
            {selectedTaskGroups.activeTasks.length +
                selectedTaskGroups.completedTasks.length ===
              0 ? (
              <EmptyState
                message={
                  isToday
                    ? undefined
                    : "这一天还没有计划。先安排一件要做的事。"
                }
              />
            ) : (
              <TaskList
                key={`task-list-${selectedDate}`}
                activeTasks={selectedTaskGroups.activeTasks}
                completedTasks={selectedTaskGroups.completedTasks}
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
          <DailyHistoryList
            key={selectedDate}
            entries={historyEntries}
            onCreateDeletePlan={createHistoryDeletePlan}
            onConfirmDelete={deleteHistory}
          />
        )
      )}
      {pendingUndo && (
        <UndoToast
          key={getPendingUndoKey(pendingUndo)}
          message={getPendingUndoMessage(pendingUndo)}
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
  | { kind: "subtask"; parentId: string; task: TodoItem; index: number }
  | {
      kind: "history";
      snapshot: HistoryDeletionSnapshot;
      count: number;
      focusId: string;
    };

interface WindowRecoveryEvent {
  recoveryId: number;
  modeRequestIdAtStart: number;
  modeSessionIdAtStart: string | null;
}

interface WindowHideEvent {
  hideId: number;
}

function getPendingUndoKey(pendingUndo: PendingUndo): string {
  return pendingUndo.kind === "history"
    ? `history-${pendingUndo.focusId}-${pendingUndo.count}`
    : `${pendingUndo.kind}-${pendingUndo.task.id}`;
}

function getPendingUndoMessage(pendingUndo: PendingUndo): string {
  return pendingUndo.kind === "history"
    ? `已删除 ${pendingUndo.count} 条完成记录`
    : `已删除“${pendingUndo.task.title}”`;
}

function parseWindowRecoveryEvent(value: unknown): WindowRecoveryEvent {
  if (!isRecord(value)) {
    return { recoveryId: 0, modeRequestIdAtStart: 0, modeSessionIdAtStart: null };
  }

  return {
    recoveryId: isNonNegativeInteger(value.recoveryId) ? value.recoveryId : 0,
    modeRequestIdAtStart: isNonNegativeInteger(value.modeRequestIdAtStart)
      ? value.modeRequestIdAtStart
      : 0,
    modeSessionIdAtStart:
      typeof value.modeSessionIdAtStart === "string" && value.modeSessionIdAtStart.length > 0
        ? value.modeSessionIdAtStart
        : null
  };
}

function parseWindowHideEvent(value: unknown): WindowHideEvent | null {
  return isRecord(value) && isNonNegativeInteger(value.hideId) ? { hideId: value.hideId } : null;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getWindowLayerErrorMessage(error: unknown): string | null {
  if (!error) return null;
  if (error instanceof Error && error.message.trim()) return error.message;
  return "原生窗口操作未完成，请重试";
}

export default App;
