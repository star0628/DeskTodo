import { describe, expect, it, vi } from "vitest";
import {
  createTauriWindowLayerExecutor,
  createTauriWindowLifecycleInitializer,
  createWindowLayerController,
  INITIALIZE_WINDOW_LIFECYCLE_COMMAND,
  WINDOW_LAYER_COMMAND,
  WINDOW_LAYER_LABELS
} from "./windowLayer";

const SESSION_ID = "test-renderer-session";

describe("windowLayer", () => {
  it("defines compact labels for all supported modes", () => {
    expect(WINDOW_LAYER_LABELS).toEqual({
      alwaysOnTop: "置顶",
      normal: "普通",
      alwaysOnBottom: "桌面"
    });
  });

  it("sends an apply request with a renderer session, sequence, and recovery id", async () => {
    const invokeCommand = vi.fn().mockResolvedValue(nativeResult("normal"));
    const execute = createTauriWindowLayerExecutor(invokeCommand);

    await expect(
      execute({ mode: "normal", requestId: 42, sessionId: SESSION_ID, recoveryId: 9 })
    ).resolves.toEqual(nativeResult("normal"));
    expect(invokeCommand).toHaveBeenCalledWith(WINDOW_LAYER_COMMAND, {
      mode: "normal",
      requestId: 42,
      sessionId: SESSION_ID,
      recoveryId: 9
    });
  });

  it("uses a dedicated atomic initialize command before normal mode requests", async () => {
    const invokeCommand = vi.fn().mockResolvedValue(nativeResult("alwaysOnTop"));
    const initialize = createTauriWindowLifecycleInitializer(invokeCommand);

    await expect(
      initialize({ mode: "alwaysOnTop", requestId: 1, sessionId: SESSION_ID })
    ).resolves.toEqual(nativeResult("alwaysOnTop"));
    expect(invokeCommand).toHaveBeenCalledWith(INITIALIZE_WINDOW_LIFECYCLE_COMMAND, {
      mode: "alwaysOnTop",
      requestId: 1,
      sessionId: SESSION_ID
    });
  });

  it("keeps native calls serial and settles only the latest intent as applied", async () => {
    const first = deferred<ReturnType<typeof nativeResult>>();
    const second = deferred<ReturnType<typeof nativeResult>>();
    const execute = vi
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const controller = createWindowLayerController({
      execute,
      isAvailable: () => true,
      sessionId: SESSION_ID
    });

    const topRequest = controller.request("alwaysOnTop");
    expect(controller.getLatestRequestId()).toBe(1);
    const normalRequest = controller.request("normal");
    expect(controller.getLatestRequestId()).toBe(2);

    await expect(topRequest).resolves.toEqual({
      status: "superseded",
      mode: "alwaysOnTop",
      requestId: 1
    });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenLastCalledWith(expect.objectContaining({
      mode: "alwaysOnTop",
      requestId: 1,
      sessionId: SESSION_ID
    }));

    first.resolve(nativeResult("alwaysOnTop"));
    await waitForMicrotasks();
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls[1][0]).toMatchObject({
      mode: "normal",
      requestId: 2,
      sessionId: SESSION_ID
    });

    second.resolve(nativeResult("normal"));
    await expect(normalRequest).resolves.toEqual({
      status: "applied",
      mode: "normal",
      requestId: 2
    });
    expect(controller.getLastAppliedMode()).toBe("normal");
    await controller.flush();
    expect(controller.getSnapshot()).toEqual({
      available: true,
      isPending: false,
      pendingMode: null,
      error: null
    });
  });

  it("treats a stale native response as superseded without pretending success", async () => {
    const controller = createWindowLayerController({
      execute: vi.fn().mockResolvedValue({ ...nativeResult("alwaysOnBottom"), status: "stale" }),
      isAvailable: () => true,
      sessionId: SESSION_ID
    });

    await expect(controller.request("alwaysOnBottom")).resolves.toEqual({
      status: "superseded",
      mode: "alwaysOnBottom",
      requestId: 1
    });
    expect(controller.getSnapshot().isPending).toBe(false);
    expect(controller.getSnapshot().error).toBeNull();
  });

  it("rejects malformed native responses instead of treating future statuses as applied", async () => {
    const controller = createWindowLayerController({
      execute: vi.fn().mockResolvedValue({ ...nativeResult("normal"), status: "queued" }),
      isAvailable: () => true,
      sessionId: SESSION_ID
    });

    await expect(controller.request("normal")).resolves.toMatchObject({
      status: "failed",
      mode: "normal",
      requestId: 1,
      error: expect.any(Error)
    });
    expect(controller.getLastAppliedMode()).toBeNull();
  });

  it("reports an unavailable browser bridge without invoking native work", async () => {
    const execute = vi.fn();
    const controller = createWindowLayerController({
      execute,
      isAvailable: () => false,
      sessionId: SESSION_ID
    });

    await expect(controller.request("alwaysOnTop")).resolves.toEqual({
      status: "unavailable",
      mode: "alwaysOnTop",
      requestId: 1
    });
    expect(controller.getLatestRequestId()).toBe(1);
    expect(execute).not.toHaveBeenCalled();
    expect(controller.getSnapshot()).toMatchObject({ available: false, isPending: false });
  });

  it("exposes a failed latest request without leaving the controller pending", async () => {
    const error = new Error("native failure");
    const controller = createWindowLayerController({
      execute: vi.fn().mockRejectedValue(error),
      isAvailable: () => true,
      sessionId: SESSION_ID
    });

    await expect(controller.request("normal")).resolves.toEqual({
      status: "failed",
      mode: "normal",
      requestId: 1,
      error
    });
    await controller.flush();
    expect(controller.getSnapshot()).toMatchObject({
      available: true,
      isPending: false,
      pendingMode: null,
      error
    });
  });
});

function nativeResult(mode: "alwaysOnTop" | "normal" | "alwaysOnBottom") {
  return { status: "applied" as const, mode, sessionId: SESSION_ID };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

async function waitForMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}
