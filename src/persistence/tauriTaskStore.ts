import { invoke } from "@tauri-apps/api/core";
import { Store } from "@tauri-apps/plugin-store";
import { AppState } from "../domain/todoTypes";
import { AppStateRepository } from "./appStateRepository";
import { fallbackDefaultState, parseAppState } from "./appStateSchema";

const STORE_FILE = "desktodo-state.json";
const STATE_KEY = "app-state";
const V1_BACKUP_KEY = "app-state-v1-backup";
const V2_BACKUP_KEY = "app-state-v2-backup";
const V3_BACKUP_KEY = "app-state-v3-backup";
const V4_BACKUP_KEY = "app-state-v4-backup";
const V5_BACKUP_KEY = "app-state-v5-backup";
const V6_BACKUP_KEY = "app-state-v6-backup";
const V7_BACKUP_KEY = "app-state-v7-backup";
const V8_BACKUP_KEY = "app-state-v8-backup";

let storePromise: Promise<Store> | undefined;

export interface TauriStoreLike {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  save(): Promise<void>;
}

type StoreFileStatus = "present" | "missing" | "invalid" | "error";

export function createTauriTaskStore(
  loadStore: () => Promise<TauriStoreLike> = getStore,
  getFileStatus: () => Promise<StoreFileStatus> = async () => "present"
): AppStateRepository {
  let pendingMigrationBackup: { key: string; value: unknown } | undefined;

  return {
    async load() {
      try {
        const fileStatus = await getFileStatus();
        if (fileStatus === "invalid") {
          return { state: fallbackDefaultState(), status: "invalid" };
        }

        if (fileStatus === "error") {
          return { state: fallbackDefaultState(), status: "error" };
        }

        const store = await loadStore();
        const storedState = await store.get<unknown>(STATE_KEY);
        const result = parseAppState(storedState);
        pendingMigrationBackup =
          result.status === "migrated"
            ? { key: getBackupKey(storedState), value: storedState }
            : undefined;
        return result;
      } catch (error) {
        console.warn("DeskTodo Store load failed; using default state.", error);
        return { state: fallbackDefaultState(), status: "error" };
      }
    },

    async save(state: AppState) {
      try {
        const store = await loadStore();
        if (pendingMigrationBackup !== undefined) {
          const existingBackup = await store.get<unknown>(pendingMigrationBackup.key);
          if (existingBackup === undefined) {
            await store.set(pendingMigrationBackup.key, pendingMigrationBackup.value);
          }
        }
        await store.set(STATE_KEY, state);
        await store.save();
        pendingMigrationBackup = undefined;
      } catch (error) {
        console.warn("DeskTodo Store save failed.", error);
        throw error;
      }
    }
  };
}

function getBackupKey(rawState: unknown): string {
  if (
    typeof rawState === "object" &&
    rawState !== null &&
    "schemaVersion" in rawState &&
    rawState.schemaVersion === 8
  ) {
    return V8_BACKUP_KEY;
  }
  if (
    typeof rawState === "object" &&
    rawState !== null &&
    "schemaVersion" in rawState &&
    rawState.schemaVersion === 7
  ) {
    return V7_BACKUP_KEY;
  }
  if (
    typeof rawState === "object" &&
    rawState !== null &&
    "schemaVersion" in rawState &&
    rawState.schemaVersion === 6
  ) {
    return V6_BACKUP_KEY;
  }
  if (
    typeof rawState === "object" &&
    rawState !== null &&
    "schemaVersion" in rawState &&
    rawState.schemaVersion === 5
  ) {
    return V5_BACKUP_KEY;
  }
  if (
    typeof rawState === "object" &&
    rawState !== null &&
    "schemaVersion" in rawState &&
    rawState.schemaVersion === 4
  ) {
    return V4_BACKUP_KEY;
  }
  if (
    typeof rawState === "object" &&
    rawState !== null &&
    "schemaVersion" in rawState &&
    rawState.schemaVersion === 3
  ) {
    return V3_BACKUP_KEY;
  }
  if (
    typeof rawState === "object" &&
    rawState !== null &&
    "schemaVersion" in rawState &&
    rawState.schemaVersion === 2
  ) {
    return V2_BACKUP_KEY;
  }
  return V1_BACKUP_KEY;
}

export const tauriTaskStore = createTauriTaskStore(getStore, getStoreFileStatus);

function getStore(): Promise<TauriStoreLike> {
  if (!storePromise) {
    storePromise = Store.load(STORE_FILE, { defaults: {}, autoSave: false });
  }

  return storePromise;
}

async function getStoreFileStatus(): Promise<StoreFileStatus> {
  return invoke<StoreFileStatus>("desktodo_store_file_status");
}
