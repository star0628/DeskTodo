import { invoke } from "@tauri-apps/api/core";
import { Store } from "@tauri-apps/plugin-store";
import { AppState } from "../domain/todoTypes";
import { AppStateRepository } from "./appStateRepository";
import { fallbackDefaultState, parseAppState } from "./appStateSchema";

const STORE_FILE = "desktodo-state.json";
const STATE_KEY = "app-state";

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
        return parseAppState(storedState);
      } catch (error) {
        console.warn("DeskTodo Store load failed; using default state.", error);
        return { state: fallbackDefaultState(), status: "error" };
      }
    },

    async save(state: AppState) {
      try {
        const store = await loadStore();
        await store.set(STATE_KEY, state);
        await store.save();
      } catch (error) {
        console.warn("DeskTodo Store save failed.", error);
        throw error;
      }
    }
  };
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
