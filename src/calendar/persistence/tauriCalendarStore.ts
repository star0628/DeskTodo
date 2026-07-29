import { invoke } from "@tauri-apps/api/core";
import { Store } from "@tauri-apps/plugin-store";
import type { CalendarState } from "../domain/calendarTypes";
import type { CalendarStateRepository } from "./calendarStateRepository";
import {
  fallbackCalendarState,
  isCalendarState,
  parseCalendarState
} from "./calendarStateSchema";

const STORE_FILE = "desktodo-calendar-state.json";
const STATE_KEY = "calendar-state";

type StoreFileStatus = "present" | "missing" | "invalid" | "error";

export interface TauriCalendarStoreLike {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  save(): Promise<void>;
}

let storePromise: Promise<Store> | undefined;

export function createTauriCalendarStore(
  loadStore: () => Promise<TauriCalendarStoreLike> = getStore,
  getFileStatus: () => Promise<StoreFileStatus> = async () => "present"
): CalendarStateRepository {
  return {
    async load() {
      try {
        const fileStatus = await getFileStatus();
        if (fileStatus === "invalid") {
          return { state: fallbackCalendarState(), status: "invalid" };
        }
        if (fileStatus === "error") {
          return { state: fallbackCalendarState(), status: "error" };
        }
        const store = await loadStore();
        return parseCalendarState(await store.get<unknown>(STATE_KEY));
      } catch {
        return { state: fallbackCalendarState(), status: "error" };
      }
    },
    async save(state: CalendarState) {
      if (!isCalendarState(state)) {
        throw new Error("Refusing to persist an invalid DeskTodo CalendarState.");
      }
      const store = await loadStore();
      await store.set(STATE_KEY, state);
      await store.save();
    }
  };
}

function getStore(): Promise<TauriCalendarStoreLike> {
  if (!storePromise) {
    storePromise = Store.load(STORE_FILE, { defaults: {}, autoSave: false });
  }
  return storePromise;
}

async function getStoreFileStatus(): Promise<StoreFileStatus> {
  return invoke<StoreFileStatus>("desktodo_calendar_store_file_status");
}

export const tauriCalendarStore = createTauriCalendarStore(
  getStore,
  getStoreFileStatus
);

