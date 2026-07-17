import { AppState } from "../domain/todoTypes";
import { AppStateRepository } from "./appStateRepository";
import { fallbackDefaultState, parseAppState, safeParseAppState } from "./appStateSchema";

const STORAGE_KEY = "desktodo:app-state";
const V1_BACKUP_KEY = "desktodo:app-state-v1-backup";
const V2_BACKUP_KEY = "desktodo:app-state-v2-backup";
const V3_BACKUP_KEY = "desktodo:app-state-v3-backup";
const V4_BACKUP_KEY = "desktodo:app-state-v4-backup";
const V5_BACKUP_KEY = "desktodo:app-state-v5-backup";
const V6_BACKUP_KEY = "desktodo:app-state-v6-backup";
const V7_BACKUP_KEY = "desktodo:app-state-v7-backup";
const V8_BACKUP_KEY = "desktodo:app-state-v8-backup";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export function createLocalTaskStore(storage = getBrowserStorage()): AppStateRepository {
  let pendingMigrationBackup: { key: string; value: string } | null = null;

  return {
    async load() {
      if (!storage) return { state: fallbackDefaultState(), status: "missing" };
      const storedValue = storage.getItem(STORAGE_KEY);
      const result = parseAppState(storedValue);
      pendingMigrationBackup =
        result.status === "migrated" && storedValue
          ? { key: getBackupKey(storedValue), value: storedValue }
          : null;
      return result;
    },
    async save(state: AppState) {
      if (!storage) return;
      if (pendingMigrationBackup && storage.getItem(pendingMigrationBackup.key) === null) {
        storage.setItem(pendingMigrationBackup.key, pendingMigrationBackup.value);
      }
      storage.setItem(STORAGE_KEY, JSON.stringify(state));
      pendingMigrationBackup = null;
    }
  };
}

function getBackupKey(rawState: string): string {
  try {
    const value = JSON.parse(rawState) as { schemaVersion?: unknown };
    if (value.schemaVersion === 8) return V8_BACKUP_KEY;
    if (value.schemaVersion === 7) return V7_BACKUP_KEY;
    if (value.schemaVersion === 6) return V6_BACKUP_KEY;
    if (value.schemaVersion === 5) return V5_BACKUP_KEY;
    if (value.schemaVersion === 4) return V4_BACKUP_KEY;
    if (value.schemaVersion === 3) return V3_BACKUP_KEY;
    return value.schemaVersion === 2 ? V2_BACKUP_KEY : V1_BACKUP_KEY;
  } catch {
    return V1_BACKUP_KEY;
  }
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
