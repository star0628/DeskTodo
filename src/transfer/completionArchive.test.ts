import { describe, expect, it } from "vitest";
import { fallbackDefaultState } from "../persistence/appStateSchema";
import { AppState, TodoItem } from "../domain/todoTypes";
import {
  analyzeCompletionArchiveImport,
  buildCompletionArchive,
  getCompletionArchiveFilename,
  parseCompletionArchiveText,
  serializeCompletionArchive
} from "./completionArchive";

function completedTask(overrides: Partial<TodoItem> = {}): TodoItem {
  return {
    id: "task-1",
    title: "完成报告 😀",
    done: true,
    createdAt: "2026-07-13T01:00:00.000Z",
    updatedAt: "2026-07-13T03:00:00.000Z",
    completedAt: "2026-07-13T03:00:00.000Z",
    completedOn: "2026-07-13",
    important: true,
    scheduledFor: null,
    deadlineAt: null,
    deadlineDisplayMode: "countdown",
    recurrenceSeriesId: null,
    children: [],
    ...overrides
  };
}

function stateWithTasks(tasks: TodoItem[]): AppState {
  return { ...fallbackDefaultState(), tasks };
}

describe("completion archive", () => {
  it("exports an inclusive local-date range and groups parent and child records", () => {
    const child = completedTask({
      id: "child-1",
      title: "校对数字",
      important: false,
      children: []
    });
    const parent = completedTask({ children: [child] });
    const outside = completedTask({
      id: "outside",
      completedAt: "2026-07-14T03:00:00.000Z",
      completedOn: "2026-07-14"
    });

    const archive = buildCompletionArchive(stateWithTasks([parent, outside]), {
      from: "2026-07-13",
      to: "2026-07-13",
      exportId: "export-1",
      exportedAt: "2026-07-14T08:00:00.000Z",
      timeZone: "Asia/Shanghai"
    });

    expect(archive.summary).toEqual({ days: 1, parentTasks: 1, subtasks: 1, totalRecords: 2 });
    expect(archive.days[0].records.map((record) => record.kind)).toEqual(["subtask", "task"]);
    expect(archive.days[0].records[0].parentTitle).toBe("完成报告 😀");
  });

  it("roundtrips UTF-8 Chinese, emoji and embedded line breaks", () => {
    const task = completedTask({ title: "中文 English 😀\n第二行" });
    const archive = buildCompletionArchive(stateWithTasks([task]), {
      from: "2026-07-13",
      to: "2026-07-13"
    });
    const parsed = parseCompletionArchiveText(serializeCompletionArchive(archive));
    expect(parsed.status).toBe("ok");
    if (parsed.status === "ok") {
      expect(parsed.archive.days[0].records[0].title).toBe(task.title);
    }
  });

  it("accepts an optional UTF-8 BOM", () => {
    const archive = buildCompletionArchive(stateWithTasks([completedTask()]), {
      from: "2026-07-13",
      to: "2026-07-13"
    });
    expect(parseCompletionArchiveText(`\ufeff${serializeCompletionArchive(archive)}`).status).toBe(
      "ok"
    );
  });

  it("rejects broken JSON and a future format version", () => {
    expect(parseCompletionArchiveText("not json").status).toBe("invalid");
    const archive = buildCompletionArchive(stateWithTasks([]), {
      from: "2026-07-13",
      to: "2026-07-13"
    });
    expect(
      parseCompletionArchiveText(JSON.stringify({ ...archive, formatVersion: 2 })).status
    ).toBe("invalid");
  });

  it("rejects a record outside its day and a mismatched summary", () => {
    const archive = buildCompletionArchive(stateWithTasks([completedTask()]), {
      from: "2026-07-13",
      to: "2026-07-13"
    });
    const wrongDay = structuredClone(archive);
    wrongDay.days[0].records[0].completedOn = "2026-07-12";
    expect(parseCompletionArchiveText(JSON.stringify(wrongDay)).status).toBe("invalid");

    const wrongSummary = structuredClone(archive);
    wrongSummary.summary.totalRecords = 99;
    expect(parseCompletionArchiveText(JSON.stringify(wrongSummary)).status).toBe("invalid");

    const duplicateDay = structuredClone(archive);
    duplicateDay.days.push(structuredClone(duplicateDay.days[0]));
    duplicateDay.summary.days = 2;
    duplicateDay.summary.parentTasks = 2;
    duplicateDay.summary.totalRecords = 2;
    expect(parseCompletionArchiveText(JSON.stringify(duplicateDay)).status).toBe("invalid");
  });

  it("imports new records as history snapshots without creating tasks or recurrence", () => {
    const state = fallbackDefaultState();
    const archive = buildCompletionArchive(stateWithTasks([completedTask()]), {
      from: "2026-07-13",
      to: "2026-07-13"
    });
    const analysis = analyzeCompletionArchiveImport(state, archive, {
      importBatchId: "batch-1",
      createId: () => "archive-1"
    });

    expect(analysis.records).toHaveLength(1);
    expect(analysis.records[0]).toMatchObject({
      id: "archive-1",
      importBatchId: "batch-1",
      recurrenceLabel: null
    });
    expect(state.tasks).toEqual([]);
    expect(state.recurrenceSeries).toEqual([]);
  });

  it("is idempotent when the same completion already exists live", () => {
    const source = stateWithTasks([completedTask()]);
    const archive = buildCompletionArchive(source, {
      from: "2026-07-13",
      to: "2026-07-13"
    });
    const analysis = analyzeCompletionArchiveImport(source, archive);
    expect(analysis.records).toEqual([]);
    expect(analysis.duplicateCount).toBe(1);
    expect(analysis.conflictCount).toBe(0);
  });

  it("classifies changed content with the same record id as a conflict", () => {
    const source = stateWithTasks([completedTask()]);
    const archive = buildCompletionArchive(source, {
      from: "2026-07-13",
      to: "2026-07-13"
    });
    archive.days[0].records[0].title = "外部修改标题";
    const analysis = analyzeCompletionArchiveImport(source, archive);
    expect(analysis.records).toEqual([]);
    expect(analysis.conflictCount).toBe(1);
  });

  it("uses a portable and descriptive txt filename", () => {
    expect(getCompletionArchiveFilename("2026-07-01", "2026-07-14")).toBe(
      "DeskTodo-完成记录-20260701-20260714.desktodo.txt"
    );
  });
});
