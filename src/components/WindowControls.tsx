import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Minus, X } from "lucide-react";
import { isTauriRuntime } from "../persistence";

export const HIDE_MAIN_WINDOW_COMMAND = "desktodo_hide_main_window";
export const BEGIN_HIDE_MAIN_WINDOW_COMMAND = "desktodo_begin_hide_main_window";

type InvokeCommand = (command: string, args?: Record<string, unknown>) => Promise<unknown>;
type FlushState = (() => Promise<void> | void) | undefined;

interface WindowControlsProps {
  available?: boolean;
  flush?: FlushState;
  invokeCommand?: InvokeCommand;
}

export function WindowControls({
  available = isTauriRuntime(),
  flush,
  invokeCommand = invokeTauriCommand
}: WindowControlsProps) {
  const [isHiding, setIsHiding] = useState(false);
  const disabled = !available || isHiding;
  const status = !available
    ? "窗口控制仅桌面版可用"
    : isHiding
      ? "正在隐藏窗口"
      : null;

  async function hideWindow() {
    if (disabled) return;
    setIsHiding(true);
    try {
      await hideAfterFlush(flush ?? window.__DESKTODO_FLUSH_STATE__, invokeCommand);
    } finally {
      setIsHiding(false);
    }
  }

  return (
    <div className="window-controls" role="group" aria-label="窗口控制" aria-busy={isHiding || undefined}>
      <button
        type="button"
        onClick={() => void hideWindow()}
        disabled={disabled}
        aria-disabled={disabled}
        aria-label={`隐藏窗口${status ? `，${status}` : ""}`}
        title={status ?? "隐藏窗口"}
      >
        <Minus aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => void hideWindow()}
        disabled={disabled}
        aria-disabled={disabled}
        aria-label={`关闭到托盘${status ? `，${status}` : ""}`}
        title={status ?? "关闭到托盘"}
      >
        <X aria-hidden="true" />
      </button>
    </div>
  );
}

/**
 * State persistence is best-effort for hiding: even when the renderer flush
 * rejects, the native hide command still runs from the finally path.
 */
export async function hideAfterFlush(
  flush: FlushState,
  invokeCommand: InvokeCommand = invokeTauriCommand
): Promise<void> {
  let hideId: number;
  try {
    const result = await invokeCommand(BEGIN_HIDE_MAIN_WINDOW_COMMAND);
    if (!isHideIntent(result)) {
      throw new Error("DeskTodo native hide request did not return a valid hide token.");
    }
    hideId = result.hideId;
  } catch (error) {
    console.warn("DeskTodo native hide request failed.", error);
    return;
  }

  try {
    await flush?.();
  } catch (error) {
    console.warn("DeskTodo state flush before hide failed.", error);
  } finally {
    try {
      await invokeCommand(HIDE_MAIN_WINDOW_COMMAND, { hideId });
    } catch (error) {
      console.warn("DeskTodo window hide failed.", error);
    }
  }
}

function isHideIntent(value: unknown): value is { status: "pending"; hideId: number } {
  return (
    typeof value === "object" &&
    value !== null &&
    "status" in value &&
    "hideId" in value &&
    value.status === "pending" &&
    typeof value.hideId === "number" &&
    Number.isSafeInteger(value.hideId) &&
    value.hideId > 0
  );
}

function invokeTauriCommand(command: string, args?: Record<string, unknown>): Promise<unknown> {
  return invoke(command, args);
}
