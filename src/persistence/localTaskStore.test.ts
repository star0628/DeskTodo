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

function persistedTask(done = false) {
  return {
    id: "task-1",
    title: "Persisted",
    done,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T08:30:00.000Z",
    completedAt: done ? "2026-01-02T08:30:00.000Z" : null,
    completedOn: done ? "2026-01-02" : null,
    children: []
  };
}

function currentTask(done = false) {
  return {
    ...persistedTask(done),
    important: false,
    scheduledFor: null,
    deadlineAt: null,
    deadlineDisplayMode: "countdown" as const,
    recurrenceSeriesId: null
  };
}

function v3State() {
  return {
    schemaVersion: 3,
    tasks: [persistedTask(false)],
    settings: {
      alwaysOnTop: true,
      compactMode: false,
      theme: "dark",
      windowLayerMode: "alwaysOnTop",
      colorTheme: "frost-blue",
      fontSize: 18,
      collapseCompletedByDefault: true
    }
  };
}

function v4State() {
  const task = currentTask(false) as Record<string, unknown>;
  delete task.deadlineAt;
  delete task.deadlineDisplayMode;
  return {
    schemaVersion: 4,
    tasks: [task],
    recurrenceSeries: [],
    settings: fallbackDefaultState().settings
  };
}

function v5State() {
  const task = currentTask(false) as Record<string, unknown>;
  delete task.deadlineDisplayMode;
  const settings = { ...fallbackDefaultState().settings } as Record<string, unknown>;
  delete settings.customThemeColors;
  return {
    schemaVersion: 5,
    tasks: [task],
    recurrenceSeries: [],
    settings
  };
}

function v6State() {
  const task = currentTask(false) as Record<string, unknown>;
  delete task.deadlineDisplayMode;
  return {
    schemaVersion: 6,
    tasks: [task],
    recurrenceSeries: [],
    settings: fallbackDefaultState().settings
  };
}

function legacyState(done = false) {
  return {
    schemaVersion: 1,
    tasks: [
      {
        id: "task-1",
        title: "Legacy",
        done,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-02T08:30:00.000Z",
        children: []
      }
    ],
    settings: {
      alwaysOnTop: true,
      compactMode: false,
      theme: "dark",
      windowLayerMode: "alwaysOnTop"
    }
  };
}

function v2State() {
  return {
    schemaVersion: 2,
    tasks: [persistedTask(false)],
    settings: {
      alwaysOnTop: true,
      compactMode: false,
      theme: "dark",
      windowLayerMode: "alwaysOnTop"
    }
  };
}

describe("appStateSchema", () => {
  it("fallbackDefaultState uses schema v9 and stable visual defaults", () => {
    expect(fallbackDefaultState().schemaVersion).toBe(9);
    expect(fallbackDefaultState().archivedCompletions).toEqual([]);
    expect(fallbackDefaultState().settings.windowLayerMode).toBe("alwaysOnTop");
    expect(fallbackDefaultState().settings.alwaysOnTop).toBe(true);
    expect(fallbackDefaultState().settings.colorTheme).toBe("graphite-lime");
    expect(fallbackDefaultState().settings.fontSize).toBe(16);
    expect(fallbackDefaultState().settings.backgroundOpacityPercent).toBe(90);
    expect(fallbackDefaultState().settings.customThemeColors).toEqual({
      canvas: "#111318",
      surface: "#2B303A",
      accent: "#84CC16"
    });
    expect(fallbackDefaultState().recurrenceSeries).toEqual([]);
  });

  it("missing data returns status missing", () => {
    expect(parseAppState(null)).toEqual({ state: fallbackDefaultState(), status: "missing" });
    expect(safeParseAppState(null)).toEqual(fallbackDefaultState());
  });

  it("broken JSON returns status invalid", () => {
    expect(parseAppState("{broken")).toEqual({ state: fallbackDefaultState(), status: "invalid" });
    expect(safeParseAppState("{broken")).toEqual(fallbackDefaultState());
  });

  it("unknown schema version returns status invalid", () => {
    const unknown = { ...fallbackDefaultState(), schemaVersion: 10 };
    expect(parseAppState(unknown)).toEqual({ state: fallbackDefaultState(), status: "invalid" });
  });

  it("migrates schema v7 by adding an empty completion archive", () => {
    const { archivedCompletions: _archive, ...current } = fallbackDefaultState();
    const result = parseAppState({ ...current, schemaVersion: 7 });

    expect(result.status).toBe("migrated");
    expect(result.state.schemaVersion).toBe(9);
    expect(result.state.archivedCompletions).toEqual([]);
  });

  it("rejects invalid archived completion records in schema v9", () => {
    const state = fallbackDefaultState();
    const result = parseAppState({
      ...state,
      archivedCompletions: [{ id: "broken" }]
    });

    expect(result.status).toBe("invalid");
  });

  it("nested child returns status invalid", () => {
    const child = persistedTask(false);
    const invalidState = {
      ...fallbackDefaultState(),
      tasks: [
        {
          ...persistedTask(false),
          children: [{ ...child, id: "child", children: [{ ...child, id: "nested" }] }]
        }
      ]
    };

    expect(parseAppState(invalidState)).toEqual({ state: fallbackDefaultState(), status: "invalid" });
  });

  it("valid v7 state returns status ok", () => {
    const validState: AppState = {
      ...fallbackDefaultState(),
      tasks: [
        {
          ...currentTask(false),
          deadlineAt: new Date(2026, 6, 14, 22, 0).toISOString()
        }
      ]
    };

    expect(parseAppState(validState)).toEqual({ state: validState, status: "ok" });
  });

  it("migrates schema v8 without changing valid task data", () => {
    const current = fallbackDefaultState();
    const legacy = {
      ...current,
      schemaVersion: 8,
      tasks: [currentTask(false)]
    };

    const result = parseAppState(legacy);

    expect(result.status).toBe("migrated");
    expect(result.state.schemaVersion).toBe(9);
    expect(result.state.tasks).toEqual(legacy.tasks);
  });

  it("accepts a standalone future planned date in schema v9", () => {
    const plannedState: AppState = {
      ...fallbackDefaultState(),
      tasks: [{ ...currentTask(false), scheduledFor: "2026-07-20" }]
    };

    expect(parseAppState(plannedState)).toEqual({ state: plannedState, status: "ok" });
  });

  it("rejects an independently scheduled child in schema v9", () => {
    const invalidState = {
      ...fallbackDefaultState(),
      tasks: [
        {
          ...currentTask(false),
          children: [
            {
              ...currentTask(false),
              id: "child-1",
              scheduledFor: "2026-07-20"
            }
          ]
        }
      ]
    };

    expect(parseAppState(invalidState)).toEqual({
      state: fallbackDefaultState(),
      status: "invalid"
    });
  });

  it("migrates v6 deadlines to countdown display without changing the instant", () => {
    const legacy = v6State();
    const deadlineAt = new Date(2026, 6, 14, 22, 0).toISOString();
    (legacy.tasks[0] as Record<string, unknown>).deadlineAt = deadlineAt;

    const result = parseAppState(legacy);

    expect(result.status).toBe("migrated");
    expect(result.state.schemaVersion).toBe(9);
    expect(result.state.tasks[0]).toMatchObject({
      deadlineAt,
      deadlineDisplayMode: "countdown"
    });
  });

  it("rejects an invalid deadline display mode in schema v9", () => {
    const invalid = {
      ...fallbackDefaultState(),
      tasks: [{ ...currentTask(false), deadlineDisplayMode: "clock" }]
    };

    expect(parseAppState(invalid)).toEqual({
      state: fallbackDefaultState(),
      status: "invalid"
    });
  });

  it("migrates v6 recurrence templates to countdown display", () => {
    const recurringTask = {
      ...currentTask(false),
      scheduledFor: "2026-07-14",
      recurrenceSeriesId: "series-1"
    } as Record<string, unknown>;
    delete recurringTask.deadlineDisplayMode;
    const legacy = {
      ...v6State(),
      tasks: [recurringTask],
      recurrenceSeries: [
        {
          id: "series-1",
          rule: { kind: "daily" },
          template: {
            title: "Persisted",
            important: false,
            childTitles: [],
            deadlinePattern: null
          },
          nextOccurrenceOn: "2026-07-15",
          activeTaskId: "task-1",
          enabled: true,
          createdAt: "2026-07-14T08:00:00.000Z",
          updatedAt: "2026-07-14T08:00:00.000Z"
        }
      ]
    };

    const result = parseAppState(legacy);

    expect(result.status).toBe("migrated");
    expect(result.state.recurrenceSeries[0].template.deadlineDisplayMode).toBe("countdown");
  });

  it("migrates v5 settings with the default custom theme colors", () => {
    const result = parseAppState(v5State());

    expect(result.status).toBe("migrated");
    expect(result.state.schemaVersion).toBe(9);
    expect(result.state.settings.customThemeColors).toEqual({
      canvas: "#111318",
      surface: "#2B303A",
      accent: "#84CC16"
    });
  });

  it("rejects malformed custom theme colors", () => {
    const malformed = {
      ...fallbackDefaultState(),
      settings: {
        ...fallbackDefaultState().settings,
        colorTheme: "custom",
        customThemeColors: {
          canvas: "#111318",
          surface: "#2B303A",
          accent: "#84CC1688"
        }
      }
    };

    expect(parseAppState(malformed).status).toBe("invalid");
  });

  it("rejects malformed task deadlines and recurrence deadline patterns", () => {
    const malformedTaskDeadline = {
      ...fallbackDefaultState(),
      tasks: [{ ...currentTask(false), deadlineAt: "2026-07-14T22:00" }]
    };
    const recurringTask = {
      ...currentTask(false),
      scheduledFor: "2026-07-14",
      recurrenceSeriesId: "series-1"
    };
    const malformedPattern = {
      ...fallbackDefaultState(),
      tasks: [recurringTask],
      recurrenceSeries: [
        {
          id: "series-1",
          rule: { kind: "daily" },
          template: {
            title: "Persisted",
            important: false,
            childTitles: [],
            deadlinePattern: { dayOffset: 367, localTime: "22:00" },
            deadlineDisplayMode: "countdown"
          },
          nextOccurrenceOn: "2026-07-15",
          activeTaskId: "task-1",
          enabled: true,
          createdAt: "2026-07-14T08:00:00.000Z",
          updatedAt: "2026-07-14T08:00:00.000Z"
        }
      ]
    };

    expect(parseAppState(malformedTaskDeadline).status).toBe("invalid");
    expect(parseAppState(malformedPattern).status).toBe("invalid");
  });

  it("rejects deadline metadata on child tasks", () => {
    const child = {
      ...currentTask(false),
      id: "child",
      deadlineAt: new Date(2026, 6, 14, 22, 0).toISOString()
    };
    const invalidState = {
      ...fallbackDefaultState(),
      tasks: [{ ...currentTask(false), children: [child] }]
    };

    expect(parseAppState(invalidState).status).toBe("invalid");
  });

  it("migrates v3 tasks and preserves visual settings", () => {
    const result = parseAppState(v3State());

    expect(result.status).toBe("migrated");
    expect(result.state.schemaVersion).toBe(9);
    expect(result.state.tasks[0]).toMatchObject({
      important: false,
      scheduledFor: null,
      deadlineDisplayMode: "countdown",
      recurrenceSeriesId: null
    });
    expect(result.state.settings).toMatchObject({
      colorTheme: "frost-blue",
      fontSize: 18,
      backgroundOpacityPercent: 92,
      collapseCompletedByDefault: true
    });
  });

  it("migrates v2 settings to the new visual defaults", () => {
    const result = parseAppState(v2State());

    expect(result.status).toBe("migrated");
    expect(result.state.schemaVersion).toBe(9);
    expect(result.state.settings).toMatchObject({
      colorTheme: "graphite-lime",
      fontSize: 16,
      collapseCompletedByDefault: false
    });
  });

  it("migrates a v1 completed task using updatedAt as the best-effort completion time", () => {
    const result = parseAppState(legacyState(true));

    expect(result.status).toBe("migrated");
    expect(result.state.schemaVersion).toBe(9);
    expect(result.state.tasks[0]).toMatchObject({
      id: "task-1",
      done: true,
      completedAt: "2026-01-02T08:30:00.000Z"
    });
    expect(result.state.tasks[0].completedOn).toMatch(/^2026-01-0[12]$/);
  });

  it("migrates a v1 open task without a completion date", () => {
    const result = parseAppState(legacyState(false));

    expect(result.status).toBe("migrated");
    expect(result.state.tasks[0].completedAt).toBeNull();
    expect(result.state.tasks[0].completedOn).toBeNull();
  });

  it("old v1 settings without windowLayerMode migrate to alwaysOnTop", () => {
    const legacy = legacyState(false);
    delete (legacy.settings as Partial<typeof legacy.settings>).windowLayerMode;

    const result = parseAppState(legacy);
    expect(result.status).toBe("migrated");
    expect(result.state.settings.windowLayerMode).toBe("alwaysOnTop");
  });

  it("invalid windowLayerMode returns status invalid", () => {
    const invalidState = {
      ...fallbackDefaultState(),
      settings: { ...fallbackDefaultState().settings, windowLayerMode: "floating" }
    };

    expect(parseAppState(invalidState)).toEqual({ state: fallbackDefaultState(), status: "invalid" });
  });

  it("invalid color theme and font size return status invalid", () => {
    const invalidTheme = {
      ...fallbackDefaultState(),
      settings: { ...fallbackDefaultState().settings, colorTheme: "rainbow" }
    };
    const invalidFont = {
      ...fallbackDefaultState(),
      settings: { ...fallbackDefaultState().settings, fontSize: 24 }
    };

    expect(parseAppState(invalidTheme).status).toBe("invalid");
    expect(parseAppState(invalidFont).status).toBe("invalid");
  });

  it("rejects background opacity outside the 10-100 range", () => {
    const tooLow = {
      ...fallbackDefaultState(),
      settings: { ...fallbackDefaultState().settings, backgroundOpacityPercent: 9 }
    };
    const tooHigh = {
      ...fallbackDefaultState(),
      settings: { ...fallbackDefaultState().settings, backgroundOpacityPercent: 101 }
    };

    expect(parseAppState(tooLow).status).toBe("invalid");
    expect(parseAppState(tooHigh).status).toBe("invalid");
  });

  it("accepts a valid recurrence series and normalizes weekly day order", () => {
    const recurringTask = {
      ...currentTask(false),
      scheduledFor: "2026-07-13",
      recurrenceSeriesId: "series-1"
    };
    const state = {
      ...fallbackDefaultState(),
      tasks: [recurringTask],
      recurrenceSeries: [
        {
          id: "series-1",
          rule: { kind: "weekly", weekdays: [0, 3, 1, 3] },
          template: {
            title: "Persisted",
            important: false,
            childTitles: [],
            deadlinePattern: null,
            deadlineDisplayMode: "countdown"
          },
          nextOccurrenceOn: "2026-07-15",
          activeTaskId: "task-1",
          enabled: true,
          createdAt: "2026-07-13T08:00:00.000Z",
          updatedAt: "2026-07-13T08:00:00.000Z"
        }
      ]
    };

    const result = parseAppState(state);
    expect(result.status).toBe("ok");
    expect(result.state.recurrenceSeries[0].rule).toEqual({
      kind: "weekly",
      weekdays: [1, 3, 0]
    });
  });

  it("rejects empty weekly rules and invalid active task relationships", () => {
    const recurringTask = {
      ...currentTask(false),
      scheduledFor: "2026-07-13",
      recurrenceSeriesId: "series-1"
    };
    const baseSeries = {
      id: "series-1",
      rule: { kind: "weekly", weekdays: [] as number[] },
      template: {
        title: "Persisted",
        important: false,
        childTitles: [],
        deadlinePattern: null,
        deadlineDisplayMode: "countdown"
      },
      nextOccurrenceOn: "2026-07-15",
      activeTaskId: "task-1",
      enabled: true,
      createdAt: "2026-07-13T08:00:00.000Z",
      updatedAt: "2026-07-13T08:00:00.000Z"
    };

    expect(
      parseAppState({
        ...fallbackDefaultState(),
        tasks: [recurringTask],
        recurrenceSeries: [baseSeries]
      }).status
    ).toBe("invalid");
    expect(
      parseAppState({
        ...fallbackDefaultState(),
        tasks: [recurringTask],
        recurrenceSeries: [
          {
            ...baseSeries,
            rule: { kind: "daily" },
            nextOccurrenceOn: "2026-07-14",
            activeTaskId: "missing"
          }
        ]
      }).status
    ).toBe("invalid");
  });

  it("rejects recurrence metadata on child tasks", () => {
    const child = {
      ...currentTask(false),
      id: "child",
      scheduledFor: "2026-07-13",
      recurrenceSeriesId: "series-1"
    };
    const invalidState = {
      ...fallbackDefaultState(),
      tasks: [{ ...currentTask(false), children: [child] }],
      recurrenceSeries: [
        {
          id: "series-1",
          rule: { kind: "daily" },
          template: {
            title: "Persisted",
            important: false,
            childTitles: [],
            deadlinePattern: null,
            deadlineDisplayMode: "countdown"
          },
          nextOccurrenceOn: "2026-07-14",
          activeTaskId: null,
          enabled: true,
          createdAt: "2026-07-13T08:00:00.000Z",
          updatedAt: "2026-07-13T08:00:00.000Z"
        }
      ]
    };

    expect(parseAppState(invalidState).status).toBe("invalid");
  });

  it("derives the legacy light/dark field from the selected color theme", () => {
    const state = {
      ...fallbackDefaultState(),
      settings: {
        ...fallbackDefaultState().settings,
        colorTheme: "citic-red" as const,
        theme: "dark" as const
      }
    };

    const result = parseAppState(state);
    expect(result.status).toBe("ok");
    expect(result.state.settings.theme).toBe("light");
  });

  it("rejects inconsistent completion fields", () => {
    const invalidState = {
      ...fallbackDefaultState(),
      tasks: [{ ...persistedTask(true), completedAt: null, completedOn: null }]
    };

    expect(parseAppState(invalidState)).toEqual({ state: fallbackDefaultState(), status: "invalid" });
  });
});

describe("localTaskStore", () => {
  it("loads fallback state for invalid storage data", async () => {
    const store = createLocalTaskStore(createMemoryStorage("{broken"));

    await expect(store.load()).resolves.toEqual({ state: fallbackDefaultState(), status: "invalid" });
  });

  it("saves and loads a v9 app state roundtrip", async () => {
    const storage = createMemoryStorage();
    const store = createLocalTaskStore(storage);
    const state: AppState = { ...fallbackDefaultState(), tasks: [currentTask(true)] };

    await store.save(state);

    await expect(store.load()).resolves.toEqual({ state, status: "ok" });
  });

  it("keeps a v8 backup before the first future-planning migration save", async () => {
    const rawV8 = JSON.stringify({ ...fallbackDefaultState(), schemaVersion: 8 });
    const storage = createMemoryStorage(rawV8);
    const store = createLocalTaskStore(storage);
    const loaded = await store.load();

    expect(loaded.status).toBe("migrated");
    await store.save(loaded.state);

    expect(storage.getItem("desktodo:app-state-v8-backup")).toBe(rawV8);
  });

  it("keeps a v7 backup before the first completion-archive migration save", async () => {
    const { archivedCompletions: _archive, ...current } = fallbackDefaultState();
    const rawV7 = JSON.stringify({ ...current, schemaVersion: 7 });
    const storage = createMemoryStorage(rawV7);
    const store = createLocalTaskStore(storage);
    const loaded = await store.load();

    expect(loaded.status).toBe("migrated");
    await store.save(loaded.state);

    expect(storage.getItem("desktodo:app-state-v7-backup")).toBe(rawV7);
  });

  it("migrates v4 deadlines to null and keeps a v4 backup before saving", async () => {
    const rawV4 = JSON.stringify(v4State());
    const storage = createMemoryStorage(rawV4);
    const store = createLocalTaskStore(storage);
    const loaded = await store.load();

    expect(loaded.status).toBe("migrated");
    expect(loaded.state.schemaVersion).toBe(9);
    expect(loaded.state.tasks[0].deadlineAt).toBeNull();

    await store.save(loaded.state);
    expect(storage.getItem("desktodo:app-state-v4-backup")).toBe(rawV4);
  });

  it("keeps a v6 backup before the first migrated state save", async () => {
    const rawV6 = JSON.stringify(v6State());
    const storage = createMemoryStorage(rawV6);
    const store = createLocalTaskStore(storage);
    const loaded = await store.load();

    expect(loaded.status).toBe("migrated");
    await store.save(loaded.state);

    expect(storage.getItem("desktodo:app-state-v6-backup")).toBe(rawV6);
  });

  it("keeps a v5 backup before the first migrated state save", async () => {
    const rawV5 = JSON.stringify(v5State());
    const storage = createMemoryStorage(rawV5);
    const store = createLocalTaskStore(storage);
    const loaded = await store.load();

    expect(loaded.status).toBe("migrated");
    await store.save(loaded.state);

    expect(storage.getItem("desktodo:app-state-v5-backup")).toBe(rawV5);
  });

  it("keeps a v1 backup before the first migrated state save", async () => {
    const rawLegacy = JSON.stringify(legacyState(true));
    const storage = createMemoryStorage(rawLegacy);
    const store = createLocalTaskStore(storage);
    const loaded = await store.load();

    expect(loaded.status).toBe("migrated");
    expect(storage.getItem("desktodo:app-state-v1-backup")).toBeNull();

    await store.save(loaded.state);

    expect(storage.getItem("desktodo:app-state-v1-backup")).toBe(rawLegacy);
    expect(JSON.parse(storage.getItem("desktodo:app-state") ?? "{}").schemaVersion).toBe(9);
  });

  it("keeps a v2 backup before the first migrated state save", async () => {
    const rawV2 = JSON.stringify(v2State());
    const storage = createMemoryStorage(rawV2);
    const store = createLocalTaskStore(storage);
    const loaded = await store.load();

    expect(loaded.status).toBe("migrated");
    await store.save(loaded.state);

    expect(storage.getItem("desktodo:app-state-v2-backup")).toBe(rawV2);
  });

  it("keeps a v3 backup before the first migrated state save", async () => {
    const rawV3 = JSON.stringify(v3State());
    const storage = createMemoryStorage(rawV3);
    const store = createLocalTaskStore(storage);
    const loaded = await store.load();

    expect(loaded.status).toBe("migrated");
    await store.save(loaded.state);

    expect(storage.getItem("desktodo:app-state-v3-backup")).toBe(rawV3);
  });
});
