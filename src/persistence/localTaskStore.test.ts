import { describe, expect, it } from "vitest";
import { AppState } from "../domain/todoTypes";
import { fallbackDefaultState, parseAppState, safeParseAppState } from "./appStateSchema";
import { createLocalTaskStore } from "./localTaskStore";

function createMemoryStorage(initialValue?: string) {
  const data = new Map<string, string>();
  if (initialValue !== undefined) data.set("desktodo:app-state", initialValue);

  return {
    getItem(key: string) {
      return data.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      data.set(key, value);
    }
  };
}

describe("appStateSchema", () => {
  it("fallbackDefaultState defaults to alwaysOnTop window layer mode", () => {
    expect(fallbackDefaultState().settings.windowLayerMode).toBe("alwaysOnTop");
    expect(fallbackDefaultState().settings.alwaysOnTop).toBe(true);
  });

  it("missing data returns status missing", () => {
    expect(parseAppState(null)).toEqual({ state: fallbackDefaultState(), status: "missing" });
    expect(safeParseAppState(null)).toEqual(fallbackDefaultState());
  });

  it("broken JSON returns status invalid", () => {
    expect(parseAppState("{broken")).toEqual({ state: fallbackDefaultState(), status: "invalid" });
    expect(safeParseAppState("{broken")).toEqual(fallbackDefaultState());
  });

  it("schema mismatch returns status invalid", () => {
    expect(parseAppState(JSON.stringify({ ...fallbackDefaultState(), schemaVersion: 2 }))).toEqual({
      state: fallbackDefaultState(),
      status: "invalid"
    });
    expect(safeParseAppState(JSON.stringify({ ...fallbackDefaultState(), schemaVersion: 2 }))).toEqual(
      fallbackDefaultState()
    );
  });

  it("nested child returns status invalid", () => {
    const invalidState = {
      ...fallbackDefaultState(),
      tasks: [
        {
          id: "parent",
          title: "Parent",
          done: false,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          children: [
            {
              id: "child",
              title: "Child",
              done: false,
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
              children: [
                {
                  id: "nested",
                  title: "Nested",
                  done: false,
                  createdAt: "2026-01-01T00:00:00.000Z",
                  updatedAt: "2026-01-01T00:00:00.000Z",
                  children: []
                }
              ]
            }
          ]
        }
      ]
    };

    expect(parseAppState(invalidState)).toEqual({ state: fallbackDefaultState(), status: "invalid" });
    expect(safeParseAppState(invalidState)).toEqual(fallbackDefaultState());
  });

  it("valid state returns status ok", () => {
    const validState: AppState = {
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

    expect(parseAppState(validState)).toEqual({ state: validState, status: "ok" });
  });

  it("old settings without windowLayerMode migrate to alwaysOnTop", () => {
    const legacyState = {
      schemaVersion: 1,
      tasks: [],
      settings: {
        alwaysOnTop: false,
        compactMode: false,
        theme: "dark"
      }
    };

    expect(parseAppState(legacyState)).toEqual({
      state: fallbackDefaultState(),
      status: "ok"
    });
  });

  it("invalid windowLayerMode returns status invalid", () => {
    const invalidState = {
      ...fallbackDefaultState(),
      settings: {
        ...fallbackDefaultState().settings,
        windowLayerMode: "floating"
      }
    };

    expect(parseAppState(invalidState)).toEqual({ state: fallbackDefaultState(), status: "invalid" });
  });
});

describe("localTaskStore", () => {
  it("loads fallback state for invalid storage data", async () => {
    const store = createLocalTaskStore(createMemoryStorage("{broken"));

    await expect(store.load()).resolves.toEqual({ state: fallbackDefaultState(), status: "invalid" });
  });

  it("saves and loads an app state roundtrip", async () => {
    const storage = createMemoryStorage();
    const store = createLocalTaskStore(storage);
    const state: AppState = {
      ...fallbackDefaultState(),
      tasks: [
        {
          id: "task-1",
          title: "Persisted",
          done: true,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          children: []
        }
      ]
    };

    await store.save(state);

    await expect(store.load()).resolves.toEqual({ state, status: "ok" });
  });
});
