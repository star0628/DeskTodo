import { AppStateRepository } from "./appStateRepository";
import { localTaskStore } from "./localTaskStore";
import { tauriTaskStore } from "./tauriTaskStore";

export { fallbackDefaultState, safeParseAppState } from "./appStateSchema";
export type { AppStateRepository } from "./appStateRepository";

export const appStateRepository: AppStateRepository = isTauriRuntime() ? tauriTaskStore : localTaskStore;

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
