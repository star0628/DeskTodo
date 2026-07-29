import {
  CalendarEvent,
  CalendarSource,
  CalendarState,
  isCalendarSourcePaletteColor,
  MAX_CALENDAR_EVENTS_PER_SOURCE,
  MAX_CALENDAR_SOURCES,
  normalizeCalendarSourceName
} from "./calendarTypes";

export type CalendarAction =
  | { type: "hydrateCalendarState"; state: CalendarState }
  | { type: "addCalendarSource"; source: CalendarSource; events: CalendarEvent[] }
  | { type: "removeCalendarSource"; sourceId: string }
  | { type: "renameCalendarSource"; sourceId: string; name: string }
  | { type: "setCalendarSourceColor"; sourceId: string; color: string }
  | {
      type: "calendarSyncStarted";
      sourceId: string;
      generation: number;
      attemptedAt: string;
    }
  | {
      type: "calendarSyncSucceeded";
      sourceId: string;
      generation: number;
      syncedAt: string;
      events: CalendarEvent[] | null;
      etag: string | null;
      lastModified: string | null;
    }
  | {
      type: "calendarSyncFailed";
      sourceId: string;
      generation: number;
      attemptedAt: string;
      invalid: boolean;
      errorCode: string;
      nextRetryAt: string | null;
    };

export function calendarReducer(state: CalendarState, action: CalendarAction): CalendarState {
  switch (action.type) {
    case "hydrateCalendarState":
      return action.state;
    case "addCalendarSource": {
      if (
        state.sources.length >= MAX_CALENDAR_SOURCES ||
        state.sources.some((source) => source.id === action.source.id) ||
        action.events.length > MAX_CALENDAR_EVENTS_PER_SOURCE
      ) {
        return state;
      }
      return {
        ...state,
        sources: [...state.sources, action.source],
        snapshotsBySource: {
          ...state.snapshotsBySource,
          [action.source.id]: action.events
        }
      };
    }
    case "removeCalendarSource": {
      if (!state.sources.some((source) => source.id === action.sourceId)) return state;
      const snapshotsBySource = { ...state.snapshotsBySource };
      delete snapshotsBySource[action.sourceId];
      return {
        ...state,
        sources: state.sources.filter((source) => source.id !== action.sourceId),
        snapshotsBySource
      };
    }
    case "renameCalendarSource": {
      const name = normalizeCalendarSourceName(action.name);
      if (!name) return state;
      return updateSource(state, action.sourceId, (source) =>
        source.name === name ? source : { ...source, name }
      );
    }
    case "setCalendarSourceColor":
      if (!isCalendarSourcePaletteColor(action.color)) return state;
      return updateSource(state, action.sourceId, (source) =>
        source.color === action.color ? source : { ...source, color: action.color }
      );
    case "calendarSyncStarted":
      return updateSource(state, action.sourceId, (source) => {
        if (action.generation <= source.activeGeneration) return source;
        return {
          ...source,
          syncState: "syncing",
          activeGeneration: action.generation,
          lastAttemptAt: action.attemptedAt,
          errorCode: null
        };
      });
    case "calendarSyncSucceeded": {
      const source = state.sources.find((item) => item.id === action.sourceId);
      if (!source || source.activeGeneration !== action.generation) return state;
      if (
        action.events !== null &&
        action.events.length > MAX_CALENDAR_EVENTS_PER_SOURCE
      ) {
        return state;
      }
      const nextSource: CalendarSource = {
        ...source,
        etag: action.etag ?? source.etag,
        lastModified: action.lastModified ?? source.lastModified,
        syncState: "idle",
        lastAttemptAt: action.syncedAt,
        lastSuccessAt: action.syncedAt,
        failureCount: 0,
        nextRetryAt: null,
        errorCode: null
      };
      return {
        ...state,
        sources: state.sources.map((item) =>
          item.id === action.sourceId ? nextSource : item
        ),
        snapshotsBySource:
          action.events === null
            ? state.snapshotsBySource
            : {
                ...state.snapshotsBySource,
                [action.sourceId]: action.events
              }
      };
    }
    case "calendarSyncFailed": {
      const source = state.sources.find((item) => item.id === action.sourceId);
      if (!source || source.activeGeneration !== action.generation) return state;
      const nextSource: CalendarSource = {
        ...source,
        syncState: action.invalid ? "invalid" : "stale",
        lastAttemptAt: action.attemptedAt,
        failureCount: source.failureCount + 1,
        nextRetryAt: action.invalid ? null : action.nextRetryAt,
        errorCode: action.errorCode
      };
      return {
        ...state,
        sources: state.sources.map((item) =>
          item.id === action.sourceId ? nextSource : item
        )
      };
    }
    default:
      return state;
  }
}

function updateSource(
  state: CalendarState,
  sourceId: string,
  update: (source: CalendarSource) => CalendarSource
): CalendarState {
  const index = state.sources.findIndex((source) => source.id === sourceId);
  if (index < 0) return state;
  const current = state.sources[index];
  const next = update(current);
  if (next === current) return state;
  const sources = [...state.sources];
  sources[index] = next;
  return { ...state, sources };
}
