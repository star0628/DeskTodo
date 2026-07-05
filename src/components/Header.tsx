import type { MouseEvent } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WindowLayerMode } from "../domain/todoTypes";
import { isTauriRuntime } from "../persistence";
import { formatTodayLabel } from "../utils/date";
import { WindowControls } from "./WindowControls";
import { WindowLayerControl } from "./WindowLayerControl";

interface HeaderProps {
  doneCount: number;
  totalCount: number;
  windowLayerMode: WindowLayerMode;
  onWindowLayerModeChange: (mode: WindowLayerMode) => void;
}

export function Header({
  doneCount,
  totalCount,
  windowLayerMode,
  onWindowLayerModeChange
}: HeaderProps) {
  return (
    <header
      className="header"
      onMouseDown={startHeaderDrag}
    >
      <div className="header-title-area" onMouseDown={startHeaderDrag}>
        <h1 onMouseDown={startHeaderDrag}>Day Todo</h1>
        <p onMouseDown={startHeaderDrag}>{formatTodayLabel()}</p>
      </div>
      <div className="header-actions">
        <span className="progress-pill" aria-label="完成进度">
          {doneCount} / {totalCount} done
        </span>
        <WindowLayerControl mode={windowLayerMode} onChange={onWindowLayerModeChange} />
        <WindowControls />
      </div>
    </header>
  );
}

function startHeaderDrag(event: MouseEvent<HTMLElement>) {
  if (!isTauriRuntime() || event.button !== 0) {
    return;
  }

  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }

  if (target.closest("button, input, textarea, select, a")) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  void getCurrentWindow().startDragging().catch((error) => {
    console.warn("DeskTodo window drag failed.", error);
  });
}
