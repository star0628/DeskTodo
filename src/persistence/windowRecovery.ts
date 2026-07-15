import { WindowLayerMode } from "../domain/todoTypes";

export function getRecoveredWindowLayerMode(mode: WindowLayerMode): WindowLayerMode {
  return mode === "alwaysOnBottom" ? "normal" : mode;
}
