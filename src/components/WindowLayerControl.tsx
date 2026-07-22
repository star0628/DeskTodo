import { useId } from "react";
import { WindowLayerMode } from "../domain/todoTypes";
import {
  isWindowLayerAvailable,
  WINDOW_LAYER_LABELS
} from "../persistence/windowLayer";

interface WindowLayerControlProps {
  mode: WindowLayerMode;
  onChange: (mode: WindowLayerMode) => void;
  ready?: boolean;
  available?: boolean;
  pending?: boolean;
  error?: string | null;
}

const WINDOW_LAYER_OPTIONS: WindowLayerMode[] = ["alwaysOnTop", "normal", "alwaysOnBottom"];

export function WindowLayerControl({
  mode,
  onChange,
  ready = true,
  available = isWindowLayerAvailable(),
  pending = false,
  error = null
}: WindowLayerControlProps) {
  const statusId = useId();
  const nextMode = WINDOW_LAYER_OPTIONS[(WINDOW_LAYER_OPTIONS.indexOf(mode) + 1) % WINDOW_LAYER_OPTIONS.length];
  const disabled = !ready || !available || pending;
  const status = !ready
    ? "正在加载窗口设置"
    : !available
      ? "窗口层级仅桌面版可用"
      : pending
      ? "正在切换窗口层级"
      : error
        ? `窗口层级切换失败：${error}`
        : null;
  const title = !ready
    ? "正在加载窗口设置"
    : !available
      ? "窗口层级仅桌面版可用"
      : pending
      ? "正在切换窗口层级"
      : error ?? "切换窗口层级：桌面是尽量置底，不是真正嵌入壁纸层";

  return (
    <>
      <button
        type="button"
        className="window-layer-control"
        onClick={() => onChange(nextMode)}
        onMouseDown={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        disabled={disabled}
        aria-disabled={disabled}
        aria-busy={pending || !ready || undefined}
        aria-describedby={status ? statusId : undefined}
        title={title}
        aria-label={`窗口层级：${WINDOW_LAYER_LABELS[mode]}${status ? `，${status}` : ""}`}
      >
        {WINDOW_LAYER_LABELS[mode]}
      </button>
      {status && (
        <span id={statusId} className="sr-only" role="status">
          {status}
        </span>
      )}
    </>
  );
}
