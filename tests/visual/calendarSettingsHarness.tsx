import React, { useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import type { CalendarIntegration } from "../../src/calendar/hooks/useCalendarIntegration";
import { calendarReducer } from "../../src/calendar/domain/calendarReducer";
import type {
  CalendarSourcePaletteColor,
  CalendarState
} from "../../src/calendar/domain/calendarTypes";
import { AppShell } from "../../src/components/AppShell";
import { SettingsDialog } from "../../src/components/SettingsDialog";
import { fallbackDefaultState } from "../../src/persistence";
import type { AutostartService } from "../../src/platform/autostart";
import "../../src/styles/fonts.css";
import "../../src/styles/tokens.css";
import "../../src/styles/globals.css";

const INITIAL_CALENDAR_STATE: CalendarState = {
  schemaVersion: 2,
  sources: [
    {
      id: "source-1",
      name: "家庭安排",
      color: "#2dd4bf",
      region: "chinaMainland",
      kind: "published",
      etag: null,
      lastModified: null,
      syncState: "idle",
      activeGeneration: 0,
      lastAttemptAt: "2026-07-29T07:00:00.000Z",
      lastSuccessAt: "2026-07-29T07:00:00.000Z",
      failureCount: 0,
      nextRetryAt: null,
      errorCode: null
    }
  ],
  snapshotsBySource: { "source-1": [] }
};

const unavailableAutostart: AutostartService = {
  isAvailable: () => false,
  isEnabled: async () => false,
  setEnabled: async () => undefined
};

function CalendarSettingsHarness() {
  const fontSize = Number(new URLSearchParams(window.location.search).get("font"));
  const appState = fallbackDefaultState();
  if (Number.isInteger(fontSize) && fontSize >= 12 && fontSize <= 20) {
    appState.settings.fontSize = fontSize;
  }
  const [calendarState, setCalendarState] = useState(INITIAL_CALENDAR_STATE);
  const calendar = useMemo<CalendarIntegration>(
    () => ({
      state: calendarState,
      hasHydrated: true,
      available: true,
      addSource: async () => undefined,
      removeSource: async () => undefined,
      renameSource: async (sourceId, name) => {
        setCalendarState((current) =>
          calendarReducer(current, {
            type: "renameCalendarSource",
            sourceId,
            name
          })
        );
      },
      setSourceColor: async (
        sourceId: string,
        color: CalendarSourcePaletteColor
      ) => {
        setCalendarState((current) =>
          calendarReducer(current, {
            type: "setCalendarSourceColor",
            sourceId,
            color
          })
        );
      },
      refreshSource: async () => undefined,
      refreshAll: async () => undefined,
      flush: async () => undefined
    }),
    [calendarState]
  );

  return (
    <AppShell settings={appState.settings}>
      <div className="header-actions" role="group" aria-label="测试设置入口">
        <SettingsDialog
          settings={appState.settings}
          dispatch={() => undefined}
          autostart={unavailableAutostart}
          calendarIntegration={calendar}
        />
      </div>
    </AppShell>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <CalendarSettingsHarness />
  </React.StrictMode>
);
