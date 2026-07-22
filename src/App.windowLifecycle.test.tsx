// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fallbackDefaultState } from "./persistence/appStateSchema";
import App from "./App";

const mocks = vi.hoisted(() => ({
  repository: {
    load: vi.fn(),
    save: vi.fn()
  },
  invoke: vi.fn(),
  listen: vi.fn(),
  saveWindowState: vi.fn()
}));

vi.mock("./persistence", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./persistence")>();
  return {
    ...actual,
    appStateRepository: mocks.repository,
    isTauriRuntime: () => true
  };
});

vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: mocks.listen }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ startDragging: vi.fn().mockResolvedValue(undefined) })
}));
vi.mock("@tauri-apps/plugin-window-state", () => ({
  StateFlags: { POSITION: 1, SIZE: 2 },
  saveWindowState: mocks.saveWindowState
}));
vi.mock("./hooks/useLocalDay", () => ({ useLocalDay: () => "2026-07-17" }));

beforeEach(() => {
  Object.defineProperty(window, "__TAURI_INTERNALS__", {
    value: {},
    configurable: true
  });
  mocks.repository.load.mockResolvedValue({ state: fallbackDefaultState(), status: "ok" });
  mocks.repository.save.mockResolvedValue(undefined);
  mocks.listen.mockResolvedValue(vi.fn());
  mocks.saveWindowState.mockResolvedValue(undefined);
  mocks.invoke.mockImplementation((command: string, args?: { mode?: string; sessionId?: string }) => {
    if (
      command === "desktodo_initialize_window_lifecycle" ||
      command === "desktodo_apply_window_layer_mode"
    ) {
      return Promise.resolve({ status: "applied", mode: args?.mode, sessionId: args?.sessionId });
    }
    return Promise.resolve(undefined);
  });
});

afterEach(() => {
  cleanup();
  delete (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  vi.clearAllMocks();
});

describe("App native window lifecycle", () => {
  it("keeps the layer control disabled until atomic startup initialization acknowledges", async () => {
    const initialization = deferred<{ status: "applied"; mode: string; sessionId?: string }>();
    mocks.invoke.mockImplementation((command: string, args?: { mode?: string; sessionId?: string }) => {
      if (command === "desktodo_initialize_window_lifecycle") return initialization.promise;
      if (command === "desktodo_apply_window_layer_mode") {
        return Promise.resolve({ status: "applied", mode: args?.mode, sessionId: args?.sessionId });
      }
      return Promise.resolve(undefined);
    });

    render(<App />);

    const layerButton = await screen.findByRole("button", { name: /窗口层级：置顶/ });
    expect(layerButton).toBeDisabled();
    const initializeCall = mocks.invoke.mock.calls.find(
      ([command]) => command === "desktodo_initialize_window_lifecycle"
    );
    initialization.resolve({
      status: "applied",
      mode: "alwaysOnTop",
      sessionId: initializeCall?.[1]?.sessionId
    });
    await waitFor(() => expect(layerButton).not.toBeDisabled());
  });

  it("commits and persists a user mode only after native confirmation", async () => {
    const delayedMode = deferred<{ status: "applied"; mode: string; sessionId?: string }>();
    let layerCallCount = 0;
    mocks.invoke.mockImplementation((command: string, args?: { mode?: string; sessionId?: string }) => {
      if (command === "desktodo_initialize_window_lifecycle") {
        return Promise.resolve({ status: "applied", mode: args?.mode, sessionId: args?.sessionId });
      }
      if (command === "desktodo_apply_window_layer_mode") {
        layerCallCount += 1;
        if (layerCallCount === 1) return delayedMode.promise;
        return Promise.resolve({ status: "applied", mode: args?.mode, sessionId: args?.sessionId });
      }
      return Promise.resolve(undefined);
    });

    const user = userEvent.setup();
    render(<App />);

    const layerButton = await screen.findByRole("button", { name: /窗口层级：置顶/ });
    await waitFor(() => expect(layerButton).not.toBeDisabled());
    await user.click(layerButton);

    await waitFor(() => expect(layerCallCount).toBe(1));
    expect(mocks.repository.save).not.toHaveBeenCalled();

    const delayedCall = mocks.invoke.mock.calls.find(
      ([command]) => command === "desktodo_apply_window_layer_mode"
    );
    delayedMode.resolve({
      status: "applied",
      mode: "normal",
      sessionId: delayedCall?.[1]?.sessionId
    });

    await waitFor(() => expect(mocks.repository.save).toHaveBeenCalledTimes(1));
    expect(mocks.repository.save.mock.calls[0][0].settings.windowLayerMode).toBe("normal");
    expect(screen.getByRole("button", { name: /窗口层级：普通/ })).toBeInTheDocument();
  });

  it("catches up a deferred setting after the first invalid-fallback content save", async () => {
    const firstSave = deferred<void>();
    mocks.repository.load.mockResolvedValue({ state: fallbackDefaultState(), status: "invalid" });
    mocks.repository.save.mockImplementationOnce(() => firstSave.promise).mockResolvedValue(undefined);

    const user = userEvent.setup();
    render(<App />);

    const input = await screen.findByRole("textbox", { name: "添加任务" });
    await user.type(input, "恢复后的任务{Enter}");
    await waitFor(() => expect(mocks.repository.save).toHaveBeenCalledTimes(1));

    const layerButton = screen.getByRole("button", { name: /窗口层级：置顶/ });
    await waitFor(() => expect(layerButton).not.toBeDisabled());
    await user.click(layerButton);
    await waitFor(() => expect(screen.getByRole("button", { name: /窗口层级：普通/ })).toBeInTheDocument());
    expect(mocks.repository.save).toHaveBeenCalledTimes(1);

    firstSave.resolve();

    await waitFor(() => expect(mocks.repository.save).toHaveBeenCalledTimes(2));
    const recoveredSnapshot = mocks.repository.save.mock.calls[1][0];
    expect(recoveredSnapshot.tasks).toHaveLength(1);
    expect(recoveredSnapshot.settings.windowLayerMode).toBe("normal");
  });

  it("turns a rejected repository load into a usable error fallback", async () => {
    mocks.repository.load.mockRejectedValue(new Error("storage unavailable"));
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    render(<App />);

    expect(await screen.findByRole("textbox", { name: "添加任务" })).toBeInTheDocument();
    expect(screen.queryByText("正在加载…")).not.toBeInTheDocument();
    warning.mockRestore();
  });

  it("retries a failed dirty revision when a later flush establishes a durability boundary", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.repository.save.mockRejectedValueOnce(new Error("temporary write failure")).mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<App />);

    const input = await screen.findByRole("textbox", { name: "添加任务" });
    await user.type(input, "需要重试的任务{Enter}");
    await waitFor(() => expect(mocks.repository.save).toHaveBeenCalledTimes(1));

    await window.__DESKTODO_FLUSH_STATE__?.();

    await waitFor(() => expect(mocks.repository.save).toHaveBeenCalledTimes(2));
    expect(mocks.repository.save.mock.calls[1][0].tasks[0].title).toBe("需要重试的任务");
    warning.mockRestore();
  });
});

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
