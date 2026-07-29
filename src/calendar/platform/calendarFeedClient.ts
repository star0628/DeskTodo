import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "../../persistence";
import type {
  AppleCalendarFeedKind,
  AppleCalendarRegion
} from "../domain/calendarTypes";

export type CalendarFetchResult =
  | {
      status: "modified";
      content: string;
      etag: string | null;
      lastModified: string | null;
      region: AppleCalendarRegion;
      kind: AppleCalendarFeedKind;
    }
  | {
      status: "notModified";
      etag: string | null;
      lastModified: string | null;
      region: AppleCalendarRegion;
      kind: AppleCalendarFeedKind;
    }
  | {
      status: "retryableError";
      errorCode: string;
      retryAfterSeconds: number | null;
      region: AppleCalendarRegion;
      kind: AppleCalendarFeedKind;
    }
  | {
      status: "invalid";
      errorCode: string;
      retryAfterSeconds: number | null;
      region: AppleCalendarRegion;
      kind: AppleCalendarFeedKind;
    };

export interface CalendarFeedClient {
  isAvailable(): boolean;
  probe(url: string): Promise<CalendarFetchResult>;
  storeSecret(sourceId: string, url: string): Promise<void>;
  fetchSource(
    sourceId: string,
    validators: { etag: string | null; lastModified: string | null }
  ): Promise<CalendarFetchResult>;
  deleteSecret(sourceId: string): Promise<void>;
}

export class CalendarClientError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "CalendarClientError";
  }
}

export const calendarFeedClient: CalendarFeedClient = {
  isAvailable: isTauriRuntime,
  async probe(url) {
    ensureAvailable();
    let raw: unknown;
    try {
      raw = await invoke<unknown>("desktodo_calendar_probe_public_feed", { url });
    } catch (error) {
      throw parseCommandError(error);
    }
    return parseFetchResult(raw);
  },
  async storeSecret(sourceId, url) {
    ensureAvailable();
    try {
      await invoke("desktodo_calendar_store_source_secret", { sourceId, url });
    } catch (error) {
      throw parseCommandError(error);
    }
  },
  async fetchSource(sourceId, validators) {
    ensureAvailable();
    let raw: unknown;
    try {
      raw = await invoke<unknown>("desktodo_calendar_fetch_source", {
        sourceId,
        etag: validators.etag,
        lastModified: validators.lastModified
      });
    } catch (error) {
      throw parseCommandError(error);
    }
    return parseFetchResult(raw);
  },
  async deleteSecret(sourceId) {
    ensureAvailable();
    try {
      await invoke("desktodo_calendar_delete_source_secret", { sourceId });
    } catch (error) {
      throw parseCommandError(error);
    }
  }
};

function ensureAvailable() {
  if (!isTauriRuntime()) {
    throw new CalendarClientError(
      "calendar_native_unavailable",
      "Apple 日历同步仅在 Windows 桌面版中可用。"
    );
  }
}

function parseFetchResult(value: unknown): CalendarFetchResult {
  if (
    !isRecord(value) ||
    !isRegion(value.region) ||
    !isFeedKind(value.kind) ||
    typeof value.status !== "string"
  ) {
    throw new CalendarClientError(
      "calendar_native_response_invalid",
      "Apple 日历返回了无效结果。"
    );
  }
  const etag = optionalString(value.etag);
  const lastModified = optionalString(value.lastModified);
  if (value.status === "modified" && typeof value.content === "string") {
    return {
      status: "modified",
      content: value.content,
      etag,
      lastModified,
      region: value.region,
      kind: value.kind
    };
  }
  if (value.status === "notModified") {
    return {
      status: "notModified",
      etag,
      lastModified,
      region: value.region,
      kind: value.kind
    };
  }
  if (
    (value.status === "retryableError" || value.status === "invalid") &&
    typeof value.errorCode === "string"
  ) {
    return {
      status: value.status,
      errorCode: value.errorCode,
      retryAfterSeconds:
        typeof value.retryAfterSeconds === "number" &&
        Number.isFinite(value.retryAfterSeconds)
          ? Math.max(0, Math.round(value.retryAfterSeconds))
          : null,
      region: value.region,
      kind: value.kind
    };
  }
  throw new CalendarClientError(
    "calendar_native_response_invalid",
    "Apple 日历返回了无效结果。"
  );
}

function parseCommandError(value: unknown): CalendarClientError {
  if (isRecord(value)) {
    const code = typeof value.code === "string" ? value.code : "calendar_native_error";
    const message =
      typeof value.message === "string" && value.message.trim()
        ? value.message
        : "Apple 日历操作失败。";
    return new CalendarClientError(code, message);
  }
  return new CalendarClientError("calendar_native_error", "Apple 日历操作失败。");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRegion(value: unknown): value is AppleCalendarRegion {
  return value === "global" || value === "chinaMainland";
}

function isFeedKind(value: unknown): value is AppleCalendarFeedKind {
  return value === "published" || value === "holiday";
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
