import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";

export interface AutostartService {
  isAvailable(): boolean;
  isEnabled(): Promise<boolean>;
  setEnabled(enabled: boolean): Promise<void>;
}

export function createAutostartService(
  api = { enable, disable, isEnabled },
  runtimeCheck = isTauriRuntime
): AutostartService {
  return {
    isAvailable: runtimeCheck,
    async isEnabled() {
      if (!runtimeCheck()) return false;
      return api.isEnabled();
    },
    async setEnabled(enabled) {
      if (!runtimeCheck()) return;
      if (enabled) {
        await api.enable();
      } else {
        await api.disable();
      }
    }
  };
}

export const autostartService = createAutostartService();

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
