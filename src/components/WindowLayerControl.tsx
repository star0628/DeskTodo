import { WindowLayerMode } from "../domain/todoTypes";
import { WINDOW_LAYER_LABELS } from "../persistence/windowLayer";

interface WindowLayerControlProps {
  mode: WindowLayerMode;
  onChange: (mode: WindowLayerMode) => void;
}

const WINDOW_LAYER_OPTIONS: WindowLayerMode[] = ["alwaysOnTop", "normal", "alwaysOnBottom"];

export function WindowLayerControl({ mode, onChange }: WindowLayerControlProps) {
  const nextMode = WINDOW_LAYER_OPTIONS[(WINDOW_LAYER_OPTIONS.indexOf(mode) + 1) % WINDOW_LAYER_OPTIONS.length];

  return (
    <button
      type="button"
      className="window-layer-control"
      onClick={() => onChange(nextMode)}
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      title="切换窗口层级：桌面是尽量置底，不是真正嵌入壁纸层"
      aria-label={`窗口层级：${WINDOW_LAYER_LABELS[mode]}`}
    >
      {WINDOW_LAYER_LABELS[mode]}
    </button>
  );
}
