import type { CalendarState } from "../domain/calendarTypes";
import type { CalendarStateRepository } from "./calendarStateRepository";
import {
  fallbackCalendarState,
  isCalendarState,
  parseCalendarState
} from "./calendarStateSchema";

const STORAGE_KEY = "desktodo:calendar-state";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export function createLocalCalendarStore(
  storage = getBrowserStorage()
): CalendarStateRepository {
  return {
    async load() {
      if (!storage) return { state: fallbackCalendarState(), status: "missing" };
      try {
        const raw = storage.getItem(STORAGE_KEY);
        return parseCalendarState(raw === null ? undefined : JSON.parse(raw));
      } catch {
        return { state: fallbackCalendarState(), status: "error" };
      }
    },
    async save(state: CalendarState) {
      if (!isCalendarState(state)) {
        throw new Error("Refusing to persist an invalid DeskTodo CalendarState.");
      }
      storage?.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  };
}

function getBrowserStorage(): StorageLike | undefined {
  if (typeof window === "undefined") return undefined;
  return window.localStorage;
}

export const localCalendarStore = createLocalCalendarStore();

