import { getRecurrenceLabel } from "../domain/recurrence";
import {
  AppState,
  ArchivedCompletionRecord,
  LocalDateKey,
  TodoItem
} from "../domain/todoTypes";
import { isLocalDateKey } from "../utils/date";
import { createId } from "../utils/ids";
import {
  COMPLETION_ARCHIVE_FORMAT,
  COMPLETION_ARCHIVE_VERSION,
  CompletionArchiveDocument,
  CompletionArchiveRecord,
  CompletionExportOptions,
  CompletionImportAnalysis,
  CompletionRecordSourceState,
  MAX_COMPLETION_ARCHIVE_BYTES,
  MAX_COMPLETION_ARCHIVE_RECORDS,
  ParseCompletionArchiveResult
} from "./completionArchiveTypes";

export function buildCompletionArchive(
  state: CompletionRecordSourceState,
  options: CompletionExportOptions
): CompletionArchiveDocument {
  if (!isLocalDateKey(options.from) || !isLocalDateKey(options.to) || options.from > options.to) {
    throw new Error("Invalid completion archive date range.");
  }

  const records = collectCompletionRecords(state)
    .filter((record) => record.completedOn >= options.from && record.completedOn <= options.to)
    .sort(compareArchiveRecords);
  const days = Array.from(groupRecordsByDay(records), ([date, dayRecords]) => ({
    date,
    records: dayRecords
  }));
  const parentTasks = records.filter((record) => record.kind === "task").length;

  return {
    format: COMPLETION_ARCHIVE_FORMAT,
    formatVersion: COMPLETION_ARCHIVE_VERSION,
    exportId: options.exportId ?? createId(),
    exportedAt: options.exportedAt ?? new Date().toISOString(),
    timeZone:
      options.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "local",
    range: { from: options.from, to: options.to },
    summary: {
      days: days.length,
      parentTasks,
      subtasks: records.length - parentTasks,
      totalRecords: records.length
    },
    days
  };
}

export function serializeCompletionArchive(archive: CompletionArchiveDocument): string {
  return `${JSON.stringify(archive, null, 2)}\n`;
}

export function parseCompletionArchiveText(text: string): ParseCompletionArchiveResult {
  if (new TextEncoder().encode(text).byteLength > MAX_COMPLETION_ARCHIVE_BYTES) {
    return { status: "invalid", message: "文件超过 5 MB 限制。" };
  }

  const normalized = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  let value: unknown;
  try {
    value = JSON.parse(normalized) as unknown;
  } catch {
    return { status: "invalid", message: "文件不是有效的 DeskTodo 完成记录。" };
  }

  const archive = parseArchiveDocument(value);
  return archive
    ? { status: "ok", archive }
    : { status: "invalid", message: "文件结构、版本或记录字段无效。" };
}

export function analyzeCompletionArchiveImport(
  state: AppState,
  archive: CompletionArchiveDocument,
  options: { importBatchId?: string; createId?: () => string } = {}
): CompletionImportAnalysis {
  const existing = getExistingCompletionSignatures(state);
  const importBatchId = options.importBatchId ?? createId();
  const nextId = options.createId ?? createId;
  const records: ArchivedCompletionRecord[] = [];
  let duplicateCount = 0;
  let conflictCount = 0;

  for (const record of archive.days.flatMap((day) => day.records)) {
    const signature = getRecordSignature(record);
    const existingSignature = existing.get(record.recordId);
    if (existingSignature !== undefined) {
      if (existingSignature === signature) duplicateCount += 1;
      else conflictCount += 1;
      continue;
    }

    records.push({
      id: nextId(),
      sourceRef: record.recordId,
      sourceTaskId: record.sourceTaskId,
      importBatchId,
      kind: record.kind,
      title: record.title,
      parentTitle: record.parentTitle,
      createdAt: record.createdAt,
      completedAt: record.completedAt,
      completedOn: record.completedOn,
      important: record.important,
      scheduledFor: record.scheduledFor,
      deadlineAt: record.deadlineAt,
      recurrenceLabel: record.recurrenceLabel
    });
    existing.set(record.recordId, signature);
  }

  return { archive, records, duplicateCount, conflictCount };
}

export function getCompletionArchiveFilename(from: LocalDateKey, to: LocalDateKey): string {
  return `DeskTodo-完成记录-${from.replace(/-/g, "")}-${to.replace(/-/g, "")}.desktodo.txt`;
}

function collectCompletionRecords(state: CompletionRecordSourceState): CompletionArchiveRecord[] {
  const records = new Map<string, CompletionArchiveRecord>();
  const recurrenceById = new Map(state.recurrenceSeries.map((series) => [series.id, series]));

  for (const task of state.tasks) {
    if (isCompleted(task)) {
      addRecord(records, toLiveRecord(task, null, null, recurrenceById));
    }
    for (const child of task.children) {
      if (isCompleted(child)) {
        addRecord(records, toLiveRecord(child, task, task.title, recurrenceById));
      }
    }
  }

  for (const record of state.archivedCompletions) {
    addRecord(records, {
      recordId: record.sourceRef,
      kind: record.kind,
      sourceTaskId: record.sourceTaskId,
      parentTitle: record.parentTitle,
      title: record.title,
      createdAt: record.createdAt,
      completedAt: record.completedAt,
      completedOn: record.completedOn,
      important: record.important,
      scheduledFor: record.scheduledFor,
      deadlineAt: record.deadlineAt,
      recurrenceLabel: record.recurrenceLabel
    });
  }

  return [...records.values()];
}

function toLiveRecord(
  item: TodoItem & { completedAt: string; completedOn: LocalDateKey },
  parent: TodoItem | null,
  parentTitle: string | null,
  recurrenceById: Map<string, AppState["recurrenceSeries"][number]>
): CompletionArchiveRecord {
  const owner = parent ?? item;
  const series = owner.recurrenceSeriesId
    ? recurrenceById.get(owner.recurrenceSeriesId)
    : undefined;
  return {
    recordId: parent
      ? `subtask:${parent.id}:${item.id}:${item.completedAt}`
      : `task:${item.id}:${item.completedAt}`,
    kind: parent ? "subtask" : "task",
    sourceTaskId: item.id,
    parentTitle,
    title: item.title,
    createdAt: item.createdAt,
    completedAt: item.completedAt,
    completedOn: item.completedOn,
    important: parent ? false : item.important,
    scheduledFor: parent ? parent.scheduledFor : item.scheduledFor,
    deadlineAt: parent ? null : item.deadlineAt,
    recurrenceLabel: series ? getRecurrenceLabel(series.rule) : null
  };
}

function getExistingCompletionSignatures(state: AppState): Map<string, string> {
  const signatures = new Map<string, string>();
  for (const record of collectCompletionRecords(state)) {
    signatures.set(record.recordId, getRecordSignature(record));
  }
  return signatures;
}

function getRecordSignature(record: CompletionArchiveRecord): string {
  return JSON.stringify({
    kind: record.kind,
    sourceTaskId: record.sourceTaskId,
    parentTitle: record.parentTitle,
    title: record.title,
    createdAt: record.createdAt,
    completedAt: record.completedAt,
    completedOn: record.completedOn,
    important: record.important,
    scheduledFor: record.scheduledFor,
    deadlineAt: record.deadlineAt,
    recurrenceLabel: record.recurrenceLabel
  });
}

function parseArchiveDocument(value: unknown): CompletionArchiveDocument | null {
  if (!isRecord(value)) return null;
  if (value.format !== COMPLETION_ARCHIVE_FORMAT || value.formatVersion !== 1) return null;
  if (!isNonEmptyString(value.exportId) || !isIsoTimestamp(value.exportedAt)) return null;
  if (!isNonEmptyString(value.timeZone) || !isRecord(value.range) || !isRecord(value.summary)) {
    return null;
  }
  const range = value.range;
  const rangeFrom = range.from;
  const rangeTo = range.to;
  if (!isLocalDateKey(rangeFrom) || !isLocalDateKey(rangeTo)) return null;
  if (rangeFrom > rangeTo || !Array.isArray(value.days)) return null;
  if (value.days.length > MAX_COMPLETION_ARCHIVE_RECORDS) return null;

  const days = value.days.map(parseArchiveDay);
  if (days.some((day) => day === null)) return null;
  const parsedDays = days as CompletionArchiveDocument["days"];
  if (new Set(parsedDays.map((day) => day.date)).size !== parsedDays.length) return null;
  const records = parsedDays.flatMap((day) => day.records);
  if (records.length > MAX_COMPLETION_ARCHIVE_RECORDS) return null;
  if (new Set(records.map((record) => record.recordId)).size !== records.length) return null;
  if (
    parsedDays.some(
      (day) =>
        day.date < rangeFrom ||
        day.date > rangeTo ||
        day.records.some((record) => record.completedOn !== day.date)
    )
  ) {
    return null;
  }

  const parentTasks = records.filter((record) => record.kind === "task").length;
  if (
    value.summary.days !== parsedDays.length ||
    value.summary.parentTasks !== parentTasks ||
    value.summary.subtasks !== records.length - parentTasks ||
    value.summary.totalRecords !== records.length
  ) {
    return null;
  }

  return {
    format: COMPLETION_ARCHIVE_FORMAT,
    formatVersion: COMPLETION_ARCHIVE_VERSION,
    exportId: value.exportId,
    exportedAt: value.exportedAt,
    timeZone: value.timeZone,
    range: { from: rangeFrom, to: rangeTo },
    summary: {
      days: parsedDays.length,
      parentTasks,
      subtasks: records.length - parentTasks,
      totalRecords: records.length
    },
    days: parsedDays
  };
}

function parseArchiveDay(value: unknown): CompletionArchiveDocument["days"][number] | null {
  if (!isRecord(value) || !isLocalDateKey(value.date) || !Array.isArray(value.records)) return null;
  const records = value.records.map(parseArchiveRecord);
  return records.some((record) => record === null)
    ? null
    : { date: value.date, records: records as CompletionArchiveRecord[] };
}

function parseArchiveRecord(value: unknown): CompletionArchiveRecord | null {
  if (!isRecord(value)) return null;
  if (!isNonEmptyString(value.recordId) || !isNonEmptyString(value.sourceTaskId)) return null;
  if (value.kind !== "task" && value.kind !== "subtask") return null;
  if (!isNormalizedText(value.title) || !isIsoTimestamp(value.createdAt)) return null;
  if (!isIsoTimestamp(value.completedAt) || !isLocalDateKey(value.completedOn)) return null;
  if (typeof value.important !== "boolean") return null;
  if (value.scheduledFor !== null && !isLocalDateKey(value.scheduledFor)) return null;
  if (value.deadlineAt !== null && !isIsoTimestamp(value.deadlineAt)) return null;
  if (value.recurrenceLabel !== null && !isNormalizedText(value.recurrenceLabel)) return null;
  if (value.kind === "task" && value.parentTitle !== null) return null;
  if (value.kind === "subtask" && !isNormalizedText(value.parentTitle)) return null;
  return {
    recordId: value.recordId,
    kind: value.kind,
    sourceTaskId: value.sourceTaskId,
    parentTitle: value.parentTitle as string | null,
    title: value.title,
    createdAt: value.createdAt,
    completedAt: value.completedAt,
    completedOn: value.completedOn,
    important: value.important,
    scheduledFor: value.scheduledFor as LocalDateKey | null,
    deadlineAt: value.deadlineAt as string | null,
    recurrenceLabel: value.recurrenceLabel as string | null
  };
}

function addRecord(
  records: Map<string, CompletionArchiveRecord>,
  record: CompletionArchiveRecord
): void {
  if (!records.has(record.recordId)) records.set(record.recordId, record);
}

function groupRecordsByDay(
  records: CompletionArchiveRecord[]
): Map<LocalDateKey, CompletionArchiveRecord[]> {
  const groups = new Map<LocalDateKey, CompletionArchiveRecord[]>();
  for (const record of records) {
    const entries = groups.get(record.completedOn) ?? [];
    entries.push(record);
    groups.set(record.completedOn, entries);
  }
  return groups;
}

function compareArchiveRecords(left: CompletionArchiveRecord, right: CompletionArchiveRecord): number {
  return (
    left.completedOn.localeCompare(right.completedOn) ||
    left.completedAt.localeCompare(right.completedAt) ||
    left.kind.localeCompare(right.kind) ||
    left.recordId.localeCompare(right.recordId)
  );
}

function isCompleted(
  item: TodoItem
): item is TodoItem & { completedAt: string; completedOn: LocalDateKey } {
  return item.done && item.completedAt !== null && item.completedOn !== null;
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(new Date(value).getTime());
}

function isNormalizedText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value === value.trim();
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
