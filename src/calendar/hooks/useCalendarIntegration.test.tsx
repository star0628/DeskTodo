// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CalendarState } from "../domain/calendarTypes";
import type { CalendarStateRepository } from "../persistence";
import type { CalendarFeedClient } from "../platform/calendarFeedClient";
import { CalendarClientError } from "../platform/calendarFeedClient";
import { fallbackCalendarState } from "../persistence";
import { useCalendarIntegration } from "./useCalendarIntegration";

const FEED = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "PRODID:-//DeskTodo Tests//EN",
  "X-WR-CALNAME:工作日历",
  "BEGIN:VEVENT",
  "UID:test-event",
  "DTSTART;VALUE=DATE:20260729",
  "SUMMARY:日历事件",
  "END:VEVENT",
  "END:VCALENDAR",
  ""
].join("\r\n");

afterEach(() => {
  vi.useRealTimers();
});

function repository(
  result: Awaited<ReturnType<CalendarStateRepository["load"]>> = {
    state: fallbackCalendarState(),
    status: "missing"
  }
) {
  const load = vi.fn<CalendarStateRepository["load"]>(async () => result);
  const save = vi.fn<CalendarStateRepository["save"]>(async () => undefined);
  return {
    load,
    save
  };
}

function client(
  overrides: Partial<CalendarFeedClient> = {}
): CalendarFeedClient {
  return {
    isAvailable: () => true,
    probe: vi.fn<CalendarFeedClient["probe"]>(async () => ({
      status: "modified",
      content: FEED,
      etag: "\"v1\"",
      lastModified: null,
      region: "global",
      kind: "published"
    })),
    storeSecret: vi.fn<CalendarFeedClient["storeSecret"]>(async () => undefined),
    fetchSource: vi.fn<CalendarFeedClient["fetchSource"]>(async () => ({
      status: "notModified",
      etag: "\"v1\"",
      lastModified: null,
      region: "global",
      kind: "published"
    })),
    deleteSecret: vi.fn<CalendarFeedClient["deleteSecret"]>(async () => undefined),
    ...overrides
  };
}

function existingCalendarState(): CalendarState {
  return {
    schemaVersion: 2,
    sources: [
      {
        id: "source-1",
        name: "Work",
        color: "#4da3ff",
        region: "global",
        kind: "published",
        etag: "\"v1\"",
        lastModified: null,
        syncState: "idle",
        activeGeneration: 0,
        lastAttemptAt: null,
        lastSuccessAt: "2026-07-29T01:00:00.000Z",
        failureCount: 0,
        nextRetryAt: null,
        errorCode: null
      }
    ],
    snapshotsBySource: {
      "source-1": [
        {
          id: "event-1",
          sourceId: "source-1",
          uid: "event-1",
          recurrenceId: null,
          title: "Planning",
          location: "",
          description: "",
          time: {
            kind: "allDay",
            startOn: "2026-07-29",
            endExclusiveOn: "2026-07-30"
          }
        }
      ]
    }
  };
}

describe("useCalendarIntegration", () => {
  it("hydrates missing state without triggering a save", async () => {
    const store = repository();
    const feedClient = client();
    const { result } = renderHook(() =>
      useCalendarIntegration({ repository: store, client: feedClient })
    );

    await waitFor(() => expect(result.current.hasHydrated).toBe(true));

    expect(store.save).not.toHaveBeenCalled();
    expect(result.current.state).toEqual(fallbackCalendarState());
  });

  it("verifies a link before storing it and persists no URL", async () => {
    const store = repository();
    const feedClient = client();
    const { result } = renderHook(() =>
      useCalendarIntegration({ repository: store, client: feedClient })
    );
    await waitFor(() => expect(result.current.hasHydrated).toBe(true));

    await act(async () => {
      await result.current.addSource({
        url: "webcal://p12-caldav.icloud.com/published/2/dummy_test_token_0123456789"
      });
    });

    expect(vi.mocked(feedClient.probe).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(feedClient.storeSecret).mock.invocationCallOrder[0]
    );
    expect(result.current.state.sources[0]).toMatchObject({
      name: "工作日历",
      region: "global",
      kind: "published"
    });
    expect(store.save).toHaveBeenCalledOnce();
    expect(JSON.stringify(vi.mocked(store.save).mock.calls[0][0])).not.toContain(
      "published/2"
    );
  });

  it("rolls back state and deletes the credential when persistence fails", async () => {
    const store = repository();
    vi.mocked(store.save).mockRejectedValueOnce(new Error("disk full"));
    const feedClient = client();
    const { result } = renderHook(() =>
      useCalendarIntegration({ repository: store, client: feedClient })
    );
    await waitFor(() => expect(result.current.hasHydrated).toBe(true));

    await expect(
      act(async () => {
        await result.current.addSource({
          url: "https://p12-caldav.icloud.com/published/2/dummy_test_token_0123456789"
        });
      })
    ).rejects.toThrow("disk full");

    expect(result.current.state.sources).toEqual([]);
    expect(feedClient.deleteSecret).toHaveBeenCalledOnce();
  });

  it("keeps a last good snapshot when automatic refresh is retryable", async () => {
    const existing: CalendarState = {
      schemaVersion: 2,
      sources: [
        {
          id: "source-1",
          name: "工作",
          color: "#4da3ff",
          region: "chinaMainland",
          kind: "published",
          etag: "\"v1\"",
          lastModified: null,
          syncState: "idle",
          activeGeneration: 0,
          lastAttemptAt: null,
          lastSuccessAt: "2026-07-29T01:00:00.000Z",
          failureCount: 0,
          nextRetryAt: null,
          errorCode: null
        }
      ],
      snapshotsBySource: {
        "source-1": [
          {
            id: "event-1",
            sourceId: "source-1",
            uid: "event-1",
            recurrenceId: null,
            title: "上次成功的日程",
            location: "",
            description: "",
            time: {
              kind: "allDay",
              startOn: "2026-07-29",
              endExclusiveOn: "2026-07-30"
            }
          }
        ]
      }
    };
    const store = repository({ state: existing, status: "ok" });
    const feedClient = client({
      fetchSource: vi.fn<CalendarFeedClient["fetchSource"]>(async () => ({
        status: "retryableError",
        errorCode: "calendar_network_error",
        retryAfterSeconds: null,
        region: "chinaMainland",
        kind: "published"
      }))
    });
    const { result } = renderHook(() =>
      useCalendarIntegration({ repository: store, client: feedClient })
    );

    await waitFor(() =>
      expect(result.current.state.sources[0]?.syncState).toBe("stale")
    );

    expect(result.current.state.snapshotsBySource["source-1"][0].title).toBe(
      "上次成功的日程"
    );
    expect(feedClient.fetchSource).toHaveBeenCalledWith("source-1", {
      etag: "\"v1\"",
      lastModified: null
    });
  });

  it("marks a source invalid when its Windows credential is missing", async () => {
    const existing: CalendarState = {
      schemaVersion: 2,
      sources: [
        {
          id: "source-1",
          name: "工作",
          color: "#4da3ff",
          region: "global",
          kind: "published",
          etag: null,
          lastModified: null,
          syncState: "idle",
          activeGeneration: 0,
          lastAttemptAt: null,
          lastSuccessAt: null,
          failureCount: 0,
          nextRetryAt: null,
          errorCode: null
        }
      ],
      snapshotsBySource: { "source-1": [] }
    };
    const store = repository({ state: existing, status: "ok" });
    const feedClient = client({
      fetchSource: vi.fn<CalendarFeedClient["fetchSource"]>(async () => {
        throw new CalendarClientError(
          "calendar_credential_missing",
          "未找到该日历的安全凭据。"
        );
      })
    });
    const { result } = renderHook(() =>
      useCalendarIntegration({ repository: store, client: feedClient })
    );

    await waitFor(() =>
      expect(result.current.state.sources[0]?.syncState).toBe("invalid")
    );

    expect(result.current.state.sources[0].nextRetryAt).toBeNull();
  });

  it("persists source name and color edits without touching feed credentials", async () => {
    const existing = existingCalendarState();
    const store = repository({ state: existing, status: "ok" });
    const feedClient = client({ isAvailable: () => false });
    const { result } = renderHook(() =>
      useCalendarIntegration({ repository: store, client: feedClient })
    );
    await waitFor(() => expect(result.current.hasHydrated).toBe(true));

    await act(async () => {
      await result.current.renameSource("source-1", "  Personal \n Calendar ");
      await result.current.setSourceColor("source-1", "#fb7185");
    });

    expect(result.current.state.sources[0]).toMatchObject({
      name: "Personal Calendar",
      color: "#fb7185"
    });
    expect(result.current.state.snapshotsBySource).toBe(
      existing.snapshotsBySource
    );
    expect(store.save).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(vi.mocked(store.save).mock.calls)).not.toContain(
      "published/2"
    );
    expect(feedClient.probe).not.toHaveBeenCalled();
    expect(feedClient.fetchSource).not.toHaveBeenCalled();
    expect(feedClient.storeSecret).not.toHaveBeenCalled();
    expect(feedClient.deleteSecret).not.toHaveBeenCalled();
  });

  it("compensates a failed metadata save without replacing event snapshots", async () => {
    const existing = existingCalendarState();
    const store = repository({ state: existing, status: "ok" });
    vi.mocked(store.save)
      .mockRejectedValueOnce(new Error("disk full"))
      .mockResolvedValueOnce(undefined);
    const feedClient = client({ isAvailable: () => false });
    const { result } = renderHook(() =>
      useCalendarIntegration({ repository: store, client: feedClient })
    );
    await waitFor(() => expect(result.current.hasHydrated).toBe(true));

    await expect(
      act(async () => {
        await result.current.renameSource("source-1", "Personal");
      })
    ).rejects.toThrow("disk full");

    expect(result.current.state.sources[0].name).toBe("Work");
    expect(result.current.state.snapshotsBySource).toBe(
      existing.snapshotsBySource
    );
    expect(store.save).toHaveBeenCalledTimes(2);
    expect(vi.mocked(store.save).mock.calls[1][0].sources[0].name).toBe("Work");
  });
});
