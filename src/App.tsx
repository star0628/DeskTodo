import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { saveWindowState, StateFlags } from "@tauri-apps/plugin-window-state";
import { AppShell } from "./components/AppShell";
import { Header } from "./components/Header";
import { QuickAddInput } from "./components/QuickAddInput";
import { TaskList } from "./components/TaskList";
import { EmptyState } from "./components/EmptyState";
import { appStateRepository, fallbackDefaultState, isTauriRuntime } from "./persistence";
import { TodoAction, todoReducer } from "./domain/todoReducer";
import { getDoneTaskCount, getTotalTaskCount } from "./domain/todoSelectors";
import { AppState } from "./domain/todoTypes";
import { shouldSaveTodoMutation } from "./persistence/savePolicy";
import { applyWindowLayerMode } from "./persistence/windowLayer";
import { LoadStatus } from "./persistence/appStateRepository";

function App() {
  const [state, setState] = useState<AppState>(() => fallbackDefaultState());
  const [hasHydrated, setHasHydrated] = useState(false);
  const hasHydratedRef = useRef(false);
  const loadStatusRef = useRef<LoadStatus>("missing");
  const hydratedStateRef = useRef<AppState | null>(null);
  const lastSavedStateRef = useRef<AppState | null>(null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());

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

  const totalCount = useMemo(() => getTotalTaskCount(state), [state]);
  const doneCount = useMemo(() => getDoneTaskCount(state), [state]);

  return (
    <AppShell>
      <Header
        doneCount={doneCount}
        totalCount={totalCount}
        windowLayerMode={state.settings.windowLayerMode}
        onWindowLayerModeChange={(mode) => dispatchTodoAction({ type: "setWindowLayerMode", mode })}
      />
      {!hasHydrated ? (
        <section className="loading-state" aria-live="polite">
          Loading...
        </section>
      ) : (
        <>
          <QuickAddInput onAdd={(title) => dispatchTodoAction({ type: "addTask", title })} />
          {state.tasks.length === 0 ? (
            <EmptyState />
          ) : (
            <TaskList tasks={state.tasks} dispatch={dispatchTodoAction} />
          )}
        </>
      )}
    </AppShell>
  );
}

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
