import { invoke } from "@tauri-apps/api/core";
import { WindowLayerMode } from "../domain/todoTypes";

export const WINDOW_LAYER_COMMAND = "desktodo_apply_window_layer_mode";
export const INITIALIZE_WINDOW_LIFECYCLE_COMMAND = "desktodo_initialize_window_lifecycle";
export const COMPLETE_WINDOW_RECOVERY_COMMAND = "desktodo_complete_window_recovery";

export const WINDOW_LAYER_LABELS: Record<WindowLayerMode, string> = {
  alwaysOnTop: "置顶",
  normal: "普通",
  alwaysOnBottom: "桌面"
};

export interface NativeWindowLayerResult {
  status: "applied" | "stale";
  mode: WindowLayerMode;
  sessionId: string;
}

export interface WindowLayerRequest {
  mode: WindowLayerMode;
  requestId: number;
  sessionId: string;
  recoveryId?: number;
}

export interface WindowLayerRequestOptions {
  recoveryId?: number;
}

export type WindowLayerExecutor = (
  request: WindowLayerRequest
) => Promise<NativeWindowLayerResult>;

export type WindowRecoveryCompletionResult = "completed" | "stale" | "unavailable" | "failed";

export type WindowLayerRequestResult =
  | { status: "applied"; mode: WindowLayerMode; requestId: number }
  | { status: "superseded"; mode: WindowLayerMode; requestId: number }
  | { status: "unavailable"; mode: WindowLayerMode; requestId: number }
  | { status: "failed"; mode: WindowLayerMode; requestId: number; error: unknown };

export interface WindowLayerControllerSnapshot {
  available: boolean;
  isPending: boolean;
  pendingMode: WindowLayerMode | null;
  error: unknown | null;
}

export interface WindowLayerController {
  isAvailable(): boolean;
  getSessionId(): string;
  getLatestRequestId(): number;
  getLastAppliedMode(): WindowLayerMode | null;
  getSnapshot(): WindowLayerControllerSnapshot;
  subscribe(listener: () => void): () => void;
  initialize(mode: WindowLayerMode): Promise<WindowLayerRequestResult>;
  request(
    mode: WindowLayerMode,
    options?: WindowLayerRequestOptions
  ): Promise<WindowLayerRequestResult>;
  completeRecovery(recoveryId: number): Promise<WindowRecoveryCompletionResult>;
  flush(): Promise<void>;
}

export interface WindowLayerControllerOptions {
  execute?: WindowLayerExecutor;
  initialize?: WindowLayerExecutor;
  completeRecovery?: (recoveryId: number, sessionId: string) => Promise<WindowRecoveryCompletionResult>;
  isAvailable?: () => boolean;
  sessionId?: string;
}

interface PendingRequest extends WindowLayerRequest {
  kind: "initialize" | "apply";
  settled: boolean;
  resolve: (result: WindowLayerRequestResult) => void;
}

type InvokeCommand = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

/**
 * Creates the native executors separately from the controller so tests can
 * inject deterministic deferred work without importing a live Tauri window API.
 */
export function createTauriWindowLayerExecutor(
  invokeCommand: InvokeCommand = invokeTauriCommand
): WindowLayerExecutor {
  return async ({ mode, requestId, sessionId, recoveryId }) => {
    return (await invokeCommand(WINDOW_LAYER_COMMAND, {
      mode,
      requestId,
      sessionId,
      ...(recoveryId === undefined ? {} : { recoveryId })
    })) as NativeWindowLayerResult;
  };
}

export function createTauriWindowLifecycleInitializer(
  invokeCommand: InvokeCommand = invokeTauriCommand
): WindowLayerExecutor {
  return async ({ mode, requestId, sessionId }) => {
    return (await invokeCommand(INITIALIZE_WINDOW_LIFECYCLE_COMMAND, {
      mode,
      requestId,
      sessionId
    })) as NativeWindowLayerResult;
  };
}

export function createTauriWindowRecoveryCompleter(
  invokeCommand: InvokeCommand = invokeTauriCommand
): (recoveryId: number, sessionId: string) => Promise<WindowRecoveryCompletionResult> {
  return async (recoveryId, sessionId) => {
    const result = await invokeCommand(COMPLETE_WINDOW_RECOVERY_COMMAND, {
      recoveryId,
      sessionId
    });
    return isRecoveryCompletionResult(result) ? result.status : "failed";
  };
}

/**
 * Serializes native layer requests and resolves superseded callers without
 * allowing an older request to become the frontend's final intent. A unique
 * renderer session makes request ordering valid after a WebView reload too.
 */
export function createWindowLayerController(
  options: WindowLayerControllerOptions = {}
): WindowLayerController {
  const isAvailable = options.isAvailable ?? isTauriRuntime;
  const execute = options.execute ?? createTauriWindowLayerExecutor();
  const initialize = options.initialize ?? createTauriWindowLifecycleInitializer();
  const completeRecovery = options.completeRecovery ?? createTauriWindowRecoveryCompleter();
  const sessionId = options.sessionId ?? createRendererSessionId();
  const listeners = new Set<() => void>();
  let nextRequestId = 0;
  let latestRequestId = 0;
  let lastAppliedMode: WindowLayerMode | null = null;
  let latestRequest: PendingRequest | null = null;
  let worker: Promise<void> | null = null;
  let snapshot: WindowLayerControllerSnapshot = {
    available: isAvailable(),
    isPending: false,
    pendingMode: null,
    error: null
  };

  function publish(next: WindowLayerControllerSnapshot) {
    snapshot = next;
    for (const listener of listeners) listener();
  }

  function settle(request: PendingRequest, result: WindowLayerRequestResult) {
    if (request.settled) return;
    request.settled = true;
    request.resolve(result);
  }

  function startWorker() {
    if (worker) return;

    let run: Promise<void>;
    run = drain().finally(() => {
      if (worker !== run) return;
      worker = null;
      if (latestRequest) startWorker();
    });
    worker = run;
  }

  async function drain() {
    while (latestRequest) {
      const request = latestRequest;

      try {
        const nativeRequest: WindowLayerRequest = {
          mode: request.mode,
          requestId: request.requestId,
          sessionId: request.sessionId,
          ...(request.recoveryId === undefined ? {} : { recoveryId: request.recoveryId })
        };
        const nativeResult = await (request.kind === "initialize" ? initialize : execute)(nativeRequest);

        if (latestRequest !== request) continue;
        latestRequest = null;

        const responseError = getNativeResponseError(nativeResult, request, sessionId);
        if (responseError) {
          settle(request, {
            status: "failed",
            mode: request.mode,
            requestId: request.requestId,
            error: responseError
          });
          publish({
            available: isAvailable(),
            isPending: false,
            pendingMode: null,
            error: responseError
          });
          continue;
        }

        if (nativeResult.status === "stale") {
          settle(request, {
            status: "superseded",
            mode: request.mode,
            requestId: request.requestId
          });
          publish({
            available: isAvailable(),
            isPending: false,
            pendingMode: null,
            error: null
          });
          continue;
        }

        lastAppliedMode = request.mode;
        settle(request, {
          status: "applied",
          mode: request.mode,
          requestId: request.requestId
        });
        publish({
          available: isAvailable(),
          isPending: false,
          pendingMode: null,
          error: null
        });
      } catch (error) {
        if (latestRequest !== request) continue;
        latestRequest = null;
        settle(request, {
          status: "failed",
          mode: request.mode,
          requestId: request.requestId,
          error
        });
        publish({
          available: isAvailable(),
          isPending: false,
          pendingMode: null,
          error
        });
      }
    }
  }

  function enqueue(
    mode: WindowLayerMode,
    kind: PendingRequest["kind"],
    requestOptions: WindowLayerRequestOptions = {}
  ): Promise<WindowLayerRequestResult> {
    const requestId = ++nextRequestId;
    latestRequestId = requestId;
    if (!isAvailable()) {
      publish({
        available: false,
        isPending: false,
        pendingMode: null,
        error: null
      });
      return Promise.resolve({ status: "unavailable", mode, requestId });
    }

    return new Promise<WindowLayerRequestResult>((resolve) => {
      const previous = latestRequest;
      if (previous) {
        settle(previous, {
          status: "superseded",
          mode: previous.mode,
          requestId: previous.requestId
        });
      }

      latestRequest = {
        kind,
        mode,
        requestId,
        sessionId,
        recoveryId: requestOptions.recoveryId,
        resolve,
        settled: false
      };
      publish({
        available: true,
        isPending: true,
        pendingMode: mode,
        error: null
      });
      startWorker();
    });
  }

  return {
    isAvailable,
    getSessionId: () => sessionId,
    getLatestRequestId: () => latestRequestId,
    getLastAppliedMode: () => lastAppliedMode,
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    initialize(mode) {
      return enqueue(mode, "initialize");
    },
    request(mode, requestOptions) {
      return enqueue(mode, "apply", requestOptions);
    },
    async completeRecovery(recoveryId) {
      if (!isAvailable()) return "unavailable";
      try {
        return await completeRecovery(recoveryId, sessionId);
      } catch (error) {
        console.warn("DeskTodo native window recovery acknowledgement failed.", error);
        return "failed";
      }
    },
    async flush() {
      while (worker) {
        const currentWorker = worker;
        await currentWorker;
      }
    }
  };
}

export const windowLayerController = createWindowLayerController();

/**
 * Compatibility wrapper for existing callers. New code should use the
 * controller directly to distinguish applied, superseded, and unavailable work.
 */
export async function applyWindowLayerMode(mode: WindowLayerMode): Promise<void> {
  const result = await windowLayerController.request(mode);
  if (result.status === "failed") throw result.error;
}

export function isWindowLayerAvailable(): boolean {
  return windowLayerController.isAvailable();
}

function getNativeResponseError(
  value: unknown,
  request: WindowLayerRequest,
  expectedSessionId: string
): Error | null {
  if (!isNativeWindowLayerResult(value)) {
    return new Error("DeskTodo native window layer response was invalid.");
  }
  if (value.mode !== request.mode) {
    return new Error("DeskTodo native window layer response did not match the requested mode.");
  }
  if (value.sessionId !== expectedSessionId) {
    return new Error("DeskTodo native window layer response belonged to another renderer session.");
  }
  return null;
}

function isNativeWindowLayerResult(value: unknown): value is NativeWindowLayerResult {
  return (
    isRecord(value) &&
    (value.status === "applied" || value.status === "stale") &&
    isWindowLayerMode(value.mode) &&
    typeof value.sessionId === "string" &&
    value.sessionId.length > 0
  );
}

function isRecoveryCompletionResult(value: unknown): value is { status: "completed" | "stale" } {
  return isRecord(value) && (value.status === "completed" || value.status === "stale");
}

function isWindowLayerMode(value: unknown): value is WindowLayerMode {
  return value === "alwaysOnTop" || value === "normal" || value === "alwaysOnBottom";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function createRendererSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `desktodo-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function invokeTauriCommand(command: string, args?: Record<string, unknown>): Promise<unknown> {
  return invoke(command, args);
}

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
