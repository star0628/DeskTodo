import {
  AppState,
  ArchivedCompletionRecord,
  CompletionRecordKind,
  LocalDateKey
} from "../domain/todoTypes";

export const COMPLETION_ARCHIVE_FORMAT = "desktodo-completion-archive";
export const COMPLETION_ARCHIVE_VERSION = 1;
export const MAX_COMPLETION_ARCHIVE_BYTES = 5 * 1024 * 1024;
export const MAX_COMPLETION_ARCHIVE_RECORDS = 50_000;

export interface CompletionArchiveRecord {
  recordId: string;
  kind: CompletionRecordKind;
  sourceTaskId: string;
  parentTitle: string | null;
  title: string;
  createdAt: string;
  completedAt: string;
  completedOn: LocalDateKey;
  important: boolean;
  scheduledFor: LocalDateKey | null;
  deadlineAt: string | null;
  recurrenceLabel: string | null;
}

export interface CompletionArchiveDay {
  date: LocalDateKey;
  records: CompletionArchiveRecord[];
}

export interface CompletionArchiveDocument {
  format: typeof COMPLETION_ARCHIVE_FORMAT;
  formatVersion: typeof COMPLETION_ARCHIVE_VERSION;
  exportId: string;
  exportedAt: string;
  timeZone: string;
  range: { from: LocalDateKey; to: LocalDateKey };
  summary: {
    days: number;
    parentTasks: number;
    subtasks: number;
    totalRecords: number;
  };
  days: CompletionArchiveDay[];
}

export type ParseCompletionArchiveResult =
  | { status: "ok"; archive: CompletionArchiveDocument }
  | { status: "invalid"; message: string };

export interface CompletionImportAnalysis {
  archive: CompletionArchiveDocument;
  records: ArchivedCompletionRecord[];
  duplicateCount: number;
  conflictCount: number;
}

export interface CompletionExportOptions {
  from: LocalDateKey;
  to: LocalDateKey;
  exportedAt?: string;
  exportId?: string;
  timeZone?: string;
}

export type CompletionRecordSourceState = Pick<
  AppState,
  "tasks" | "archivedCompletions" | "recurrenceSeries"
>;
