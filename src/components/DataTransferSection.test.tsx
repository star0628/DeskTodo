// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fallbackDefaultState } from "../persistence/appStateSchema";
import { AppState, TodoItem } from "../domain/todoTypes";
import { RecordFileService } from "../platform/recordFileService";
import {
  buildCompletionArchive,
  parseCompletionArchiveText,
  serializeCompletionArchive
} from "../transfer/completionArchive";
import { DataTransferSection } from "./DataTransferSection";

afterEach(() => {
  document.body.innerHTML = "";
});

function task(): TodoItem {
  return {
    id: "task-1",
    title: "完成导入导出测试",
    done: true,
    createdAt: "2026-07-13T01:00:00.000Z",
    updatedAt: "2026-07-14T02:00:00.000Z",
    completedAt: "2026-07-14T02:00:00.000Z",
    completedOn: "2026-07-14",
    important: false,
    scheduledFor: null,
    deadlineAt: null,
    deadlineDisplayMode: "countdown",
    recurrenceSeriesId: null,
    children: []
  };
}

function stateWithTask(): AppState {
  return { ...fallbackDefaultState(), tasks: [task()] };
}

function fileService(overrides: Partial<RecordFileService> = {}): RecordFileService {
  return {
    saveText: vi.fn().mockResolvedValue("saved"),
    openText: vi.fn().mockResolvedValue(null),
    ...overrides
  };
}

describe("DataTransferSection", () => {
  it("exports a selected range without dispatching state changes", async () => {
    const user = userEvent.setup();
    const service = fileService();
    const dispatch = vi.fn();
    render(
      <DataTransferSection state={stateWithTask()} dispatch={dispatch} fileService={service} />
    );

    await user.click(screen.getByRole("button", { name: "导出完成记录" }));
    fireEvent.change(screen.getByLabelText("开始"), { target: { value: "2026-07-14" } });
    fireEvent.change(screen.getByLabelText("结束"), { target: { value: "2026-07-14" } });
    await user.click(screen.getByRole("button", { name: "保存 TXT" }));

    await waitFor(() => expect(service.saveText).toHaveBeenCalledOnce());
    const [, text] = vi.mocked(service.saveText).mock.calls[0];
    expect(parseCompletionArchiveText(text).status).toBe("ok");
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("previews and imports valid records with one reducer action", async () => {
    const source = stateWithTask();
    const archive = buildCompletionArchive(source, {
      from: "2026-07-14",
      to: "2026-07-14"
    });
    const service = fileService({
      openText: vi.fn().mockResolvedValue({
        name: "records.desktodo.txt",
        text: serializeCompletionArchive(archive)
      })
    });
    const dispatch = vi.fn();
    const user = userEvent.setup();
    render(
      <DataTransferSection
        state={fallbackDefaultState()}
        dispatch={dispatch}
        fileService={service}
      />
    );

    await user.click(screen.getByRole("button", { name: "导入完成记录" }));
    expect(await screen.findByText("records.desktodo.txt")).toBeInTheDocument();
    expect(screen.getByText("2026-07-14 至 2026-07-14")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "导入 1 条" }));

    expect(dispatch).toHaveBeenCalledOnce();
    expect(dispatch.mock.calls[0][0]).toMatchObject({ type: "importCompletionRecords" });
    expect(dispatch.mock.calls[0][0].records).toHaveLength(1);
  });

  it("does not dispatch when the selected file is invalid", async () => {
    const service = fileService({
      openText: vi.fn().mockResolvedValue({ name: "broken.txt", text: "broken" })
    });
    const dispatch = vi.fn();
    const user = userEvent.setup();
    render(
      <DataTransferSection
        state={fallbackDefaultState()}
        dispatch={dispatch}
        fileService={service}
      />
    );

    await user.click(screen.getByRole("button", { name: "导入完成记录" }));
    expect(await screen.findByRole("status")).toHaveTextContent("文件不是有效的 DeskTodo 完成记录");
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("disables import when every record already exists", async () => {
    const state = stateWithTask();
    const archive = buildCompletionArchive(state, {
      from: "2026-07-14",
      to: "2026-07-14"
    });
    const service = fileService({
      openText: vi.fn().mockResolvedValue({
        name: "duplicate.txt",
        text: serializeCompletionArchive(archive)
      })
    });
    const user = userEvent.setup();
    render(<DataTransferSection state={state} dispatch={vi.fn()} fileService={service} />);

    await user.click(screen.getByRole("button", { name: "导入完成记录" }));
    expect(await screen.findByRole("button", { name: "导入 0 条" })).toBeDisabled();
  });

  it("offers an undo action for the imported batch", async () => {
    const archive = buildCompletionArchive(stateWithTask(), {
      from: "2026-07-14",
      to: "2026-07-14"
    });
    const service = fileService({
      openText: vi.fn().mockResolvedValue({ name: "records.txt", text: JSON.stringify(archive) })
    });
    const dispatch = vi.fn();
    const user = userEvent.setup();
    render(
      <DataTransferSection
        state={fallbackDefaultState()}
        dispatch={dispatch}
        fileService={service}
      />
    );

    await user.click(screen.getByRole("button", { name: "导入完成记录" }));
    await user.click(await screen.findByRole("button", { name: "导入 1 条" }));
    const imported = dispatch.mock.calls[0][0].records[0];
    await user.click(screen.getByRole("button", { name: "撤销本次导入" }));

    expect(dispatch.mock.calls[1][0]).toEqual({
      type: "removeImportedCompletionBatch",
      importBatchId: imported.importBatchId
    });
  });
});
