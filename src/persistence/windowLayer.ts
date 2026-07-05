import { getCurrentWindow } from "@tauri-apps/api/window";
import { WindowLayerMode } from "../domain/todoTypes";

export const WINDOW_LAYER_LABELS: Record<WindowLayerMode, string> = {
  alwaysOnTop: "置顶",
  normal: "普通",
  alwaysOnBottom: "桌面"
};

export async function applyWindowLayerMode(mode: WindowLayerMode): Promise<void> {
  if (!isTauriRuntime()) return;

  const currentWindow = getCurrentWindow();

  if (mode === "alwaysOnTop") {
    await currentWindow.setAlwaysOnBottom(false);
    await currentWindow.setAlwaysOnTop(true);
    await currentWindow.setSkipTaskbar(true);
    return;
  }

  if (mode === "alwaysOnBottom") {
    await currentWindow.setAlwaysOnTop(false);
    await currentWindow.setAlwaysOnBottom(true);
    await currentWindow.setSkipTaskbar(true);
    return;
  }

  await currentWindow.setAlwaysOnTop(false);
  await currentWindow.setAlwaysOnBottom(false);
  await currentWindow.setSkipTaskbar(true);
}

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
