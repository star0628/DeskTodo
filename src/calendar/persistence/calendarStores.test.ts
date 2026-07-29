import { describe, expect, it, vi } from "vitest";
import type { CalendarState } from "../domain/calendarTypes";
import { fallbackCalendarState } from "./calendarStateSchema";
import { createLocalCalendarStore } from "./localCalendarStore";
import {
  createTauriCalendarStore,
  type TauriCalendarStoreLike
} from "./tauriCalendarStore";

function validState(): CalendarState {
  return fallbackCalendarState();
}

function nativeStore(initial: unknown): TauriCalendarStoreLike & {
  savedValue?: unknown;
} {
  return {
    async get<T>() {
      return initial as T;
    },
    async set(_key, value) {
      this.savedValue = value;
    },
    async save() {
      return undefined;
    }
  };
}

describe("calendar stores", () => {
  it("loads local missing/invalid/error states without saving", async () => {
    const setItem = vi.fn();
    const missing = createLocalCalendarStore({
      getItem: () => null,
      setItem
    });
    const invalid = createLocalCalendarStore({
      getItem: () => JSON.stringify({ schemaVersion: 99 }),
      setItem
    });
    const error = createLocalCalendarStore({
      getItem: () => {
        throw new Error("unavailable");
      },
      setItem
    });

    await expect(missing.load()).resolves.toMatchObject({ status: "missing" });
    await expect(invalid.load()).resolves.toMatchObject({ status: "invalid" });
    await expect(error.load()).resolves.toMatchObject({ status: "error" });
    expect(setItem).not.toHaveBeenCalled();
  });

  it("refuses invalid state before touching browser storage", async () => {
    const setItem = vi.fn();
    const store = createLocalCalendarStore({
      getItem: () => null,
      setItem
    });

    await expect(
      store.save({ ...validState(), schemaVersion: 99 } as unknown as CalendarState)
    ).rejects.toThrow("invalid DeskTodo CalendarState");
    expect(setItem).not.toHaveBeenCalled();
  });

  it("does not open a corrupted native Store file", async () => {
    const loadStore = vi.fn(async () => nativeStore(undefined));
    const store = createTauriCalendarStore(loadStore, async () => "invalid");

    await expect(store.load()).resolves.toEqual({
      state: fallbackCalendarState(),
      status: "invalid"
    });
    expect(loadStore).not.toHaveBeenCalled();
  });

  it("saves through the isolated native calendar Store", async () => {
    const backing = nativeStore(undefined);
    const store = createTauriCalendarStore(async () => backing);
    const state = validState();

    await store.save(state);

    expect(backing.savedValue).toBe(state);
  });
});
