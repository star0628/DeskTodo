import { describe, expect, it, vi } from "vitest";
import { AppState } from "../domain/todoTypes";
import { fallbackDefaultState } from "./appStateSchema";
import { createTauriTaskStore, TauriStoreLike } from "./tauriTaskStore";

function createMockStore(initialValue: unknown): TauriStoreLike & { savedValue?: unknown } {
  return {
    async get<T>() {
      return initialValue as T;
    },
    async set(_key: string, value: unknown) {
      this.savedValue = value;
    },
    async save() {
      return undefined;
    }
  };
}

describe("tauriTaskStore", () => {
  it("returns invalid status for invalid stored data", async () => {
    const store = createTauriTaskStore(async () => createMockStore("{broken"));

    await expect(store.load()).resolves.toEqual({ state: fallbackDefaultState(), status: "invalid" });
  });

  it("returns invalid status for a corrupted Store file before plugin load", async () => {
    const loadStore = vi.fn(async () => createMockStore(undefined));
    const store = createTauriTaskStore(loadStore, async () => "invalid");

    await expect(store.load()).resolves.toEqual({ state: fallbackDefaultState(), status: "invalid" });
    expect(loadStore).not.toHaveBeenCalled();
  });

  it("returns error status when store loading throws", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const store = createTauriTaskStore(async () => {
      throw new Error("store unavailable");
    });

    await expect(store.load()).resolves.toEqual({ state: fallbackDefaultState(), status: "error" });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("saves state through set and save", async () => {
    const mockStore = createMockStore(undefined);
    const store = createTauriTaskStore(async () => mockStore);
    const state: AppState = {
      ...fallbackDefaultState(),
      tasks: [
        {
          id: "task-1",
          title: "Persisted",
          done: false,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          completedAt: null,
          completedOn: null,
      important: false,
          scheduledFor: null,
          deadlineAt: null,
          deadlineDisplayMode: "countdown",
          recurrenceSeriesId: null,
          children: []
        }
      ]
    };

    await store.save(state);

    expect(mockStore.savedValue).toBe(state);
  });

  it("throws when save fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const store = createTauriTaskStore(async () => ({
      async get<T>() {
        return undefined as T;
      },
      async set() {
        throw new Error("save failed");
      },
      async save() {
        return undefined;
      }
    }));

    await expect(store.save(fallbackDefaultState())).rejects.toThrow("save failed");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("keeps a v1 backup before saving a migrated state", async () => {
    const values = new Map<string, unknown>([
      [
        "app-state",
        {
          schemaVersion: 1,
          tasks: [],
          settings: {
            alwaysOnTop: true,
            compactMode: false,
            theme: "dark",
            windowLayerMode: "alwaysOnTop"
          }
        }
      ]
    ]);
    const mockStore: TauriStoreLike = {
      async get<T>(key: string) {
        return values.get(key) as T | undefined;
      },
      async set(key: string, value: unknown) {
        values.set(key, value);
      },
      async save() {
        return undefined;
      }
    };
    const store = createTauriTaskStore(async () => mockStore);
    const loaded = await store.load();

    expect(loaded.status).toBe("migrated");
    await store.save(loaded.state);

    expect(values.get("app-state-v1-backup")).toMatchObject({ schemaVersion: 1 });
    expect(values.get("app-state")).toMatchObject({ schemaVersion: 7 });
  });

  it("keeps a v2 backup before saving visual settings in schema v7", async () => {
    const v2 = {
      schemaVersion: 2,
      tasks: [],
      settings: {
        alwaysOnTop: true,
        compactMode: false,
        theme: "dark",
        windowLayerMode: "alwaysOnTop"
      }
    };
    const values = new Map<string, unknown>([["app-state", v2]]);
    const mockStore: TauriStoreLike = {
      async get<T>(key: string) {
        return values.get(key) as T | undefined;
      },
      async set(key: string, value: unknown) {
        values.set(key, value);
      },
      async save() {
        return undefined;
      }
    };
    const store = createTauriTaskStore(async () => mockStore);
    const loaded = await store.load();

    expect(loaded.status).toBe("migrated");
    await store.save(loaded.state);

    expect(values.get("app-state-v2-backup")).toBe(v2);
    expect(values.get("app-state")).toMatchObject({ schemaVersion: 7 });
  });

  it("keeps a v5 backup before saving migrated custom-theme settings", async () => {
    const current = fallbackDefaultState();
    const settings = { ...current.settings } as Record<string, unknown>;
    delete settings.customThemeColors;
    const v5 = {
      schemaVersion: 5,
      tasks: [],
      recurrenceSeries: [],
      settings
    };
    const values = new Map<string, unknown>([["app-state", v5]]);
    const mockStore: TauriStoreLike = {
      async get<T>(key: string) {
        return values.get(key) as T | undefined;
      },
      async set(key: string, value: unknown) {
        values.set(key, value);
      },
      async save() {
        return undefined;
      }
    };
    const store = createTauriTaskStore(async () => mockStore);
    const loaded = await store.load();

    expect(loaded.status).toBe("migrated");
    await store.save(loaded.state);

    expect(values.get("app-state-v5-backup")).toBe(v5);
    expect(values.get("app-state")).toMatchObject({ schemaVersion: 7 });
  });

  it("keeps a v6 backup before saving the migrated deadline display mode", async () => {
    const current = fallbackDefaultState();
    const v6 = {
      ...current,
      schemaVersion: 6
    };
    const values = new Map<string, unknown>([["app-state", v6]]);
    const mockStore: TauriStoreLike = {
      async get<T>(key: string) {
        return values.get(key) as T | undefined;
      },
      async set(key: string, value: unknown) {
        values.set(key, value);
      },
      async save() {
        return undefined;
      }
    };
    const store = createTauriTaskStore(async () => mockStore);
    const loaded = await store.load();

    expect(loaded.status).toBe("migrated");
    await store.save(loaded.state);

    expect(values.get("app-state-v6-backup")).toBe(v6);
    expect(values.get("app-state")).toMatchObject({ schemaVersion: 7 });
  });
});
