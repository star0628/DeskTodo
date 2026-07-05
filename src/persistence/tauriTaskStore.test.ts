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
});
