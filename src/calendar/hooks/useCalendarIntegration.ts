import { useCallback, useEffect, useRef, useState } from "react";
import { addLocalDays, toLocalDateKey } from "../../utils/date";
import { createId } from "../../utils/ids";
import {
  CalendarAction,
  calendarReducer
} from "../domain/calendarReducer";
import {
  CALENDAR_SOURCE_COLORS,
  CalendarSourcePaletteColor,
  CalendarSource,
  CalendarState,
  MAX_CALENDAR_SOURCES,
  normalizeCalendarSourceName
} from "../domain/calendarTypes";
import {
  CalendarParseError,
  parseCalendarFeed
} from "../domain/calendarFeedParser";
import {
  calendarStateRepository,
  fallbackCalendarState
} from "../persistence";
import type {
  CalendarLoadStatus,
  CalendarStateRepository
} from "../persistence/calendarStateRepository";
import {
  CalendarClientError,
  CalendarFeedClient,
  CalendarFetchResult,
  calendarFeedClient
} from "../platform/calendarFeedClient";

const POLL_INTERVAL_MS = 5 * 60 * 1000;
const FOCUS_STALE_MS = 2 * 60 * 1000;
const BACKOFF_MINUTES = [5, 10, 20, 40, 60] as const;

export interface AddCalendarSourceInput {
  url: string;
  name?: string;
}

export interface CalendarIntegration {
  state: CalendarState;
  hasHydrated: boolean;
  available: boolean;
  addSource(input: AddCalendarSourceInput): Promise<void>;
  removeSource(sourceId: string): Promise<void>;
  renameSource(sourceId: string, name: string): Promise<void>;
  setSourceColor(
    sourceId: string,
    color: CalendarSourcePaletteColor
  ): Promise<void>;
  refreshSource(sourceId: string): Promise<void>;
  refreshAll(): Promise<void>;
  flush(): Promise<void>;
}

interface UseCalendarIntegrationOptions {
  repository?: CalendarStateRepository;
  client?: CalendarFeedClient;
}

export function useCalendarIntegration(
  options: UseCalendarIntegrationOptions = {}
): CalendarIntegration {
  const repository = options.repository ?? calendarStateRepository;
  const client = options.client ?? calendarFeedClient;
  const [state, setState] = useState<CalendarState>(() => fallbackCalendarState());
  const [hasHydrated, setHasHydrated] = useState(false);
  const stateRef = useRef(state);
  const hasHydratedRef = useRef(false);
  const mountedRef = useRef(true);
  const loadStatusRef = useRef<CalendarLoadStatus>("missing");
  const lastSavedStateRef = useRef<CalendarState | null>(null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const saveFailedRef = useRef(false);
  const inFlightRef = useRef(new Map<string, Promise<void>>());
  const generationRef = useRef(new Map<string, number>());
  const lastRefreshAllAtRef = useRef(0);

  const queueSave = useCallback(
    (nextState: CalendarState) => {
      if (nextState === lastSavedStateRef.current) return saveQueueRef.current;
      const task = saveQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          await repository.save(nextState);
          lastSavedStateRef.current = nextState;
          loadStatusRef.current = "ok";
          saveFailedRef.current = false;
        });
      saveQueueRef.current = task;
      void task.catch(() => {
        saveFailedRef.current = true;
      });
      return task;
    },
    [repository]
  );

  const applyAction = useCallback(
    (
      action: CalendarAction,
      persist: boolean,
      userMutation = false
    ): { state: CalendarState; save: Promise<void> } | null => {
      if (!hasHydratedRef.current) return null;
      const current = stateRef.current;
      const next = calendarReducer(current, action);
      if (next === current) return null;
      stateRef.current = next;
      if (mountedRef.current) setState(next);

      const fallbackProtected =
        loadStatusRef.current === "invalid" || loadStatusRef.current === "error";
      const shouldPersist = persist && (!fallbackProtected || userMutation);
      return {
        state: next,
        save: shouldPersist ? queueSave(next) : saveQueueRef.current
      };
    },
    [queueSave]
  );

  const flush = useCallback(async () => {
    try {
      await saveQueueRef.current;
    } catch {
      if (saveFailedRef.current) {
        await queueSave(stateRef.current);
      }
    }
    await saveQueueRef.current;
  }, [queueSave]);

  useEffect(() => {
    mountedRef.current = true;
    let active = true;
    void repository
      .load()
      .then((result) => {
        if (!active) return;
        const hydrated = calendarReducer(fallbackCalendarState(), {
          type: "hydrateCalendarState",
          state: result.state
        });
        loadStatusRef.current = result.status;
        lastSavedStateRef.current = result.status === "ok" ? hydrated : null;
        stateRef.current = hydrated;
        generationRef.current = new Map(
          hydrated.sources.map((source) => [
            source.id,
            Math.max(0, source.activeGeneration)
          ])
        );
        hasHydratedRef.current = true;
        setState(hydrated);
        setHasHydrated(true);
      })
      .catch(() => {
        if (!active) return;
        const fallback = fallbackCalendarState();
        loadStatusRef.current = "error";
        stateRef.current = fallback;
        hasHydratedRef.current = true;
        setState(fallback);
        setHasHydrated(true);
      });

    return () => {
      active = false;
      mountedRef.current = false;
    };
  }, [repository]);

  const recordSyncFailure = useCallback(
    (
      source: CalendarSource,
      generation: number,
      errorCode: string,
      invalid: boolean,
      retryAfterSeconds?: number | null
    ) => {
      const attemptedAt = new Date().toISOString();
      const nextRetryAt = invalid
        ? null
        : new Date(
            Date.now() +
              Math.max(
                retryAfterSeconds ?? 0,
                getBackoffMinutes(source.failureCount) * 60
              ) *
                1000
          ).toISOString();
      applyAction(
        {
          type: "calendarSyncFailed",
          sourceId: source.id,
          generation,
          attemptedAt,
          invalid,
          errorCode,
          nextRetryAt
        },
        true
      );
    },
    [applyAction]
  );

  const performSync = useCallback(
    async (sourceId: string, manual: boolean) => {
      const existing = inFlightRef.current.get(sourceId);
      if (existing) return existing;

      const source = stateRef.current.sources.find((item) => item.id === sourceId);
      if (!source || !client.isAvailable()) return;
      if (!manual) {
        if (source.syncState === "invalid") return;
        if (
          source.nextRetryAt &&
          new Date(source.nextRetryAt).getTime() > Date.now()
        ) {
          return;
        }
      }

      const generation = (generationRef.current.get(sourceId) ?? 0) + 1;
      generationRef.current.set(sourceId, generation);
      applyAction(
        {
          type: "calendarSyncStarted",
          sourceId,
          generation,
          attemptedAt: new Date().toISOString()
        },
        false
      );

      const task = (async () => {
        try {
          const current = stateRef.current.sources.find((item) => item.id === sourceId);
          if (!current) return;
          const result = await client.fetchSource(sourceId, {
            etag: current.etag,
            lastModified: current.lastModified
          });
          if (!mountedRef.current) return;
          const latest = stateRef.current.sources.find((item) => item.id === sourceId);
          if (!latest || latest.activeGeneration !== generation) return;

          if (result.status === "invalid" || result.status === "retryableError") {
            recordSyncFailure(
              latest,
              generation,
              result.errorCode,
              result.status === "invalid",
              result.retryAfterSeconds
            );
            return;
          }

          const syncedAt = new Date().toISOString();
          const events =
            result.status === "modified"
              ? parseCalendarFeed(result.content, parseRange(sourceId)).events
              : null;
          applyAction(
            {
              type: "calendarSyncSucceeded",
              sourceId,
              generation,
              syncedAt,
              events,
              etag: result.etag,
              lastModified: result.lastModified
            },
            true
          );
        } catch (error) {
          if (!mountedRef.current) return;
          const latest = stateRef.current.sources.find((item) => item.id === sourceId);
          if (!latest || latest.activeGeneration !== generation) return;
          recordSyncFailure(
            latest,
            generation,
            getCalendarErrorCode(error),
            isTerminalCalendarError(error)
          );
        }
      })().finally(() => {
        if (inFlightRef.current.get(sourceId) === task) {
          inFlightRef.current.delete(sourceId);
        }
      });

      inFlightRef.current.set(sourceId, task);
      return task;
    },
    [applyAction, client, recordSyncFailure]
  );

  const refreshSource = useCallback(
    (sourceId: string) => performSync(sourceId, true),
    [performSync]
  );

  const refreshAll = useCallback(async () => {
    if (!hasHydratedRef.current || !client.isAvailable()) return;
    lastRefreshAllAtRef.current = Date.now();
    const sourceIds = stateRef.current.sources.map((source) => source.id);
    for (let index = 0; index < sourceIds.length; index += 2) {
      await Promise.all(
        sourceIds
          .slice(index, index + 2)
          .map((sourceId) => performSync(sourceId, false))
      );
    }
  }, [client, performSync]);

  useEffect(() => {
    if (!hasHydrated || !client.isAvailable()) return;
    void refreshAll();
    const timer = window.setInterval(() => {
      void refreshAll();
    }, POLL_INTERVAL_MS);

    function refreshIfStale() {
      if (Date.now() - lastRefreshAllAtRef.current >= FOCUS_STALE_MS) {
        void refreshAll();
      }
    }
    function handleVisibility() {
      if (document.visibilityState === "visible") refreshIfStale();
    }
    window.addEventListener("focus", refreshIfStale);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshIfStale);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [client, hasHydrated, refreshAll]);

  const addSource = useCallback(
    async ({ url, name }: AddCalendarSourceInput) => {
      if (!hasHydratedRef.current) {
        throw new CalendarClientError(
          "calendar_not_ready",
          "日历服务仍在加载，请稍后重试。"
        );
      }
      if (!client.isAvailable()) {
        throw new CalendarClientError(
          "calendar_native_unavailable",
          "Apple 日历同步仅在 Windows 桌面版中可用。"
        );
      }
      if (stateRef.current.sources.length >= MAX_CALENDAR_SOURCES) {
        throw new CalendarClientError(
          "calendar_source_limit",
          `最多可以添加 ${MAX_CALENDAR_SOURCES} 个日历。`
        );
      }

      const rawUrl = url.trim();
      if (!rawUrl) {
        throw new CalendarClientError(
          "calendar_link_invalid",
          "请输入 Apple 公共日历链接。"
        );
      }
      const result = await client.probe(rawUrl);
      if (result.status !== "modified") {
        throw new CalendarClientError(
          "errorCode" in result ? result.errorCode : "calendar_probe_failed",
          result.status === "invalid"
            ? "Apple 公共日历链接已失效。"
            : "暂时无法读取 Apple 日历，请稍后重试。"
        );
      }

      const sourceId = createId();
      const parsed = parseCalendarFeed(result.content, parseRange(sourceId));
      const now = new Date().toISOString();
      const source: CalendarSource = {
        id: sourceId,
        name:
          normalizeCalendarSourceName(name ?? "") ||
          normalizeCalendarSourceName(parsed.suggestedName ?? "") ||
          `Apple 日历 ${stateRef.current.sources.length + 1}`,
        color:
          CALENDAR_SOURCE_COLORS[
            stateRef.current.sources.length % CALENDAR_SOURCE_COLORS.length
          ],
        region: result.region,
        kind: result.kind,
        etag: result.etag,
        lastModified: result.lastModified,
        syncState: "idle",
        activeGeneration: 0,
        lastAttemptAt: now,
        lastSuccessAt: now,
        failureCount: 0,
        nextRetryAt: null,
        errorCode: null
      };

      await client.storeSecret(sourceId, rawUrl);
      const previous = stateRef.current;
      try {
        const applied = applyAction(
          {
            type: "addCalendarSource",
            source,
            events: parsed.events
          },
          true,
          true
        );
        if (!applied) {
          throw new CalendarClientError(
            "calendar_source_add_failed",
            "无法添加 Apple 日历。"
          );
        }
        await applied.save;
      } catch (error) {
        stateRef.current = previous;
        if (mountedRef.current) setState(previous);
        await client.deleteSecret(sourceId).catch(() => undefined);
        throw error;
      }
    },
    [applyAction, client]
  );

  const removeSource = useCallback(
    async (sourceId: string) => {
      const current = stateRef.current;
      if (!current.sources.some((source) => source.id === sourceId)) return;
      await client.deleteSecret(sourceId);
      const applied = applyAction(
        { type: "removeCalendarSource", sourceId },
        true,
        true
      );
      if (!applied) return;
      try {
        await applied.save;
      } catch (error) {
        stateRef.current = current;
        if (mountedRef.current) setState(current);
        throw error;
      }
    },
    [applyAction, client]
  );

  const renameSource = useCallback(
    async (sourceId: string, requestedName: string) => {
      const source = stateRef.current.sources.find((item) => item.id === sourceId);
      if (!source) return;
      const name = normalizeCalendarSourceName(requestedName);
      if (!name) {
        throw new CalendarClientError(
          "calendar_source_name_invalid",
          "日历名称不能为空。"
        );
      }
      const applied = applyAction(
        { type: "renameCalendarSource", sourceId, name },
        true,
        true
      );
      if (!applied) return;
      try {
        await applied.save;
      } catch (error) {
        const latest = stateRef.current.sources.find((item) => item.id === sourceId);
        if (latest?.name === name) {
          const rollback = applyAction(
            {
              type: "renameCalendarSource",
              sourceId,
              name: source.name
            },
            true,
            true
          );
          await rollback?.save.catch(() => undefined);
        }
        throw error;
      }
    },
    [applyAction]
  );

  const setSourceColor = useCallback(
    async (sourceId: string, color: CalendarSourcePaletteColor) => {
      const source = stateRef.current.sources.find((item) => item.id === sourceId);
      if (!source) return;
      const applied = applyAction(
        { type: "setCalendarSourceColor", sourceId, color },
        true,
        true
      );
      if (!applied) return;
      try {
        await applied.save;
      } catch (error) {
        const latest = stateRef.current.sources.find((item) => item.id === sourceId);
        if (latest?.color === color) {
          const rollback = applyAction(
            {
              type: "setCalendarSourceColor",
              sourceId,
              color: source.color
            },
            true,
            true
          );
          await rollback?.save.catch(() => undefined);
        }
        throw error;
      }
    },
    [applyAction]
  );

  return {
    state,
    hasHydrated,
    available: client.isAvailable(),
    addSource,
    removeSource,
    renameSource,
    setSourceColor,
    refreshSource,
    refreshAll,
    flush
  };
}

function parseRange(sourceId: string) {
  const today = toLocalDateKey();
  return {
    sourceId,
    rangeStart: addLocalDays(today, -31),
    rangeEndExclusive: addLocalDays(today, 401)
  };
}

function getBackoffMinutes(failureCount: number): number {
  return BACKOFF_MINUTES[Math.min(failureCount, BACKOFF_MINUTES.length - 1)];
}

function getCalendarErrorCode(error: unknown): string {
  return error instanceof CalendarClientError
    ? error.code
    : isCalendarParseError(error)
      ? error.code
      : "calendar_sync_failed";
}

function isCalendarParseError(error: unknown): error is CalendarParseError {
  return error instanceof CalendarParseError;
}

function isTerminalCalendarError(error: unknown): boolean {
  if (!(error instanceof CalendarClientError)) return false;
  return [
    "calendar_credential_missing",
    "calendar_credential_invalid",
    "calendar_source_id_invalid"
  ].includes(error.code);
}

export function getCalendarOperationMessage(error: unknown): string {
  if (error instanceof CalendarClientError && error.message.trim()) {
    return error.message;
  }
  if (isCalendarParseError(error)) {
    return "该链接返回的日历内容无法安全解析。";
  }
  return "Apple 日历操作失败，请稍后重试。";
}

export function getCalendarSyncStatusLabel(source: CalendarSource): string {
  if (source.syncState === "syncing") return "正在同步";
  if (source.syncState === "invalid") return "链接失效，需要重新添加";
  if (source.syncState === "stale") return "离线，显示上次结果";
  if (source.lastSuccessAt) return "已同步";
  return "等待同步";
}

export function formatCalendarLastSync(source: CalendarSource): string {
  if (!source.lastSuccessAt) return "";
  const date = new Date(source.lastSuccessAt);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}
