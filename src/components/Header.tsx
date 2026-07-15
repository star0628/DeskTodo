import type { MouseEvent } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { TodoAction } from "../domain/todoReducer";
import { AppSettings, AppState, CustomThemeColors, WindowLayerMode } from "../domain/todoTypes";
import { isTauriRuntime } from "../persistence";
import { WindowControls } from "./WindowControls";
import { WindowLayerControl } from "./WindowLayerControl";
import { SettingsDialog } from "./SettingsDialog";

interface HeaderProps {
  progressLabel: string;
  progressRatio: number;
  windowLayerMode: WindowLayerMode;
  onWindowLayerModeChange: (mode: WindowLayerMode) => void;
  settings: AppSettings;
  appState?: AppState;
  dispatch: (action: TodoAction) => void;
  onBackgroundOpacityPreview?: (percent: number | null) => void;
  onCustomThemePreview?: (colors: CustomThemeColors | null) => void;
}

export function Header({
  progressLabel,
  progressRatio,
  windowLayerMode,
  onWindowLayerModeChange,
  settings,
  appState,
  dispatch,
  onBackgroundOpacityPreview,
  onCustomThemePreview
}: HeaderProps) {
  return (
    <header className="header" onMouseDown={startHeaderDrag}>
      <div className="header-title-area">
        <h1>Day Todo</h1>
        <span className="progress-summary">
          <span className="progress-pill" aria-label={`完成进度 ${progressLabel}`}>
            {progressLabel}
          </span>
          <span className="progress-track" aria-hidden="true">
            <span style={{ width: `${Math.max(0, Math.min(1, progressRatio)) * 100}%` }} />
          </span>
        </span>
      </div>
      <div
        className="header-actions"
        role="group"
        aria-label="应用与窗口控制"
        data-window-drag-exclude
      >
        <WindowLayerControl mode={windowLayerMode} onChange={onWindowLayerModeChange} />
        <SettingsDialog
          appState={appState}
          settings={settings}
          dispatch={dispatch}
          onBackgroundOpacityPreview={onBackgroundOpacityPreview}
          onCustomThemePreview={onCustomThemePreview}
        />
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

  if (
    target.closest(
      "button, input, textarea, select, a, label, dialog, [data-window-drag-exclude]"
    )
  ) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  void getCurrentWindow().startDragging().catch((error) => {
    console.warn("DeskTodo window drag failed.", error);
  });
}
