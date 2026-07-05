import { getCurrentWindow } from "@tauri-apps/api/window";
import { saveWindowState, StateFlags } from "@tauri-apps/plugin-window-state";
import { isTauriRuntime } from "../persistence";

export function WindowControls() {
  return (
    <div className="window-controls" aria-label="窗口控制">
      <button type="button" onClick={hideWindow} aria-label="隐藏窗口">
        —
      </button>
      <button type="button" onClick={hideWindow} aria-label="关闭到托盘">
        ×
      </button>
    </div>
  );
}

function hideWindow() {
  if (!isTauriRuntime()) {
    console.warn("DeskTodo window controls are only active in Tauri.");
    return;
  }

  void hideAfterFlush();
}

async function hideAfterFlush() {
  try {
    await window.__DESKTODO_FLUSH_STATE__?.();
    await saveWindowState(StateFlags.POSITION | StateFlags.SIZE);
    await getCurrentWindow().hide();
  } catch (error) {
    console.warn("DeskTodo window hide failed.", error);
  }
}
