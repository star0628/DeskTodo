import { AppState } from "../domain/todoTypes";
import { AppStateRepository } from "./appStateRepository";
import { fallbackDefaultState, parseAppState, safeParseAppState } from "./appStateSchema";

const STORAGE_KEY = "desktodo:app-state";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export function createLocalTaskStore(storage = getBrowserStorage()): AppStateRepository {
  return {
    async load() {
      if (!storage) return { state: fallbackDefaultState(), status: "missing" };
      return parseAppState(storage.getItem(STORAGE_KEY));
    },
    async save(state: AppState) {
      if (!storage) return;
      storage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  };
}

export const localTaskStore = createLocalTaskStore();

export function loadAppState(): Promise<AppState> {
  return localTaskStore.load().then((result) => result.state);
}

export function saveAppState(state: AppState): Promise<void> {
  return localTaskStore.save(state);
}

export { fallbackDefaultState, safeParseAppState };

function getBrowserStorage(): StorageLike | undefined {
  if (typeof window === "undefined") return undefined;
  return window.localStorage;
}
