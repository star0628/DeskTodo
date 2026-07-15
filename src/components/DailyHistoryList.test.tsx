// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { DailyCompletionEntry } from "../domain/dailyViewSelectors";
import { HistoryDeletionPlan } from "../domain/historyDeletion";
import { DailyHistoryList } from "./DailyHistoryList";

const originalShowModal = HTMLDialogElement.prototype.showModal;
const originalClose = HTMLDialogElement.prototype.close;

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});

afterEach(cleanup);

afterAll(() => {
  HTMLDialogElement.prototype.showModal = originalShowModal;
  HTMLDialogElement.prototype.close = originalClose;
});

function parentEntry(
  id: string,
  overrides: Partial<DailyCompletionEntry> = {}
): DailyCompletionEntry {
  return {
    key: `task:${id}:2026-07-12`,
    target: { kind: "task", taskId: id, completedOn: "2026-07-12" },
    title: id,
    parentTitle: null,
    completedAt: "2026-07-12T08:00:00.000Z",
    canDelete: true,
    blockedReason: null,
    ...overrides
  };
}

function childEntry(parentId: string, childId: string): DailyCompletionEntry {
  return {
    key: `subtask:${parentId}:${childId}:2026-07-12`,
    target: {
      kind: "subtask",
      parentId,
      childId,
      completedOn: "2026-07-12"
    },
    title: childId,
    parentTitle: parentId,
    completedAt: "2026-07-12T08:30:00.000Z",
    canDelete: true,
    blockedReason: null
  };
}

function planFor(entries: DailyCompletionEntry[]): HistoryDeletionPlan {
  const targets = entries.map((entry) => entry.target);
  return {
    targets,
    snapshot: { parents: [], children: [] },
    selectedCount: targets.length,
    deletedEntryCount: targets.length,
    otherDateCount: 0,
    focusId:
      targets[0].kind === "task"
        ? targets[0].taskId
        : targets[0].kind === "archive"
          ? targets[0].recordId
          : targets[0].childId
  };
}

describe("DailyHistoryList", () => {
  it("keeps history read-only until explicit selection mode is entered", async () => {
    const user = userEvent.setup();
    render(
      <DailyHistoryList
        entries={[parentEntry("report")]}
        onCreateDeletePlan={vi.fn()}
        onConfirmDelete={vi.fn()}
      />
    );

    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "选择" }));
    expect(screen.getByRole("checkbox", { name: "选择“report”" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "删除" })).toBeDisabled();
  });

  it("selects a parent as the canonical target and marks its visible child as covered", async () => {
    const user = userEvent.setup();
    const parent = parentEntry("parent");
    const child = childEntry("parent", "child");
    const createPlan = vi.fn(() => planFor([parent]));
    render(
      <DailyHistoryList
        entries={[parent, child]}
        onCreateDeletePlan={createPlan}
        onConfirmDelete={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "选择" }));
    await user.click(screen.getByRole("checkbox", { name: "选择“parent”" }));

    expect(screen.getByRole("checkbox", { name: "选择“child”" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "选择“child”" })).toBeDisabled();
    expect(screen.getByText("已选 2 条")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "删除" }));
    expect(createPlan).toHaveBeenCalledWith([parent.target]);
  });

  it("explains blocked rows and excludes them from select all", async () => {
    const user = userEvent.setup();
    const blocked = parentEntry("blocked", {
      canDelete: false,
      blockedReason: "仍有未完成子任务"
    });
    const available = parentEntry("available");
    render(
      <DailyHistoryList
        entries={[blocked, available]}
        onCreateDeletePlan={vi.fn()}
        onConfirmDelete={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "选择" }));
    expect(screen.getByText("仍有未完成子任务")).toBeVisible();
    expect(screen.getByRole("checkbox", { name: "选择“blocked”" })).toBeDisabled();

    await user.click(screen.getByRole("checkbox", { name: "全选" }));
    expect(screen.getByRole("checkbox", { name: "选择“available”" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "选择“blocked”" })).not.toBeChecked();
  });

  it("keeps selection after cancelling confirmation and confirms the prepared plan once", async () => {
    const user = userEvent.setup();
    const entry = parentEntry("report");
    const plan = planFor([entry]);
    const onConfirmDelete = vi.fn();
    render(
      <DailyHistoryList
        entries={[entry]}
        onCreateDeletePlan={() => plan}
        onConfirmDelete={onConfirmDelete}
      />
    );

    await user.click(screen.getByRole("button", { name: "选择" }));
    await user.click(screen.getByRole("checkbox", { name: "选择“report”" }));
    await user.click(screen.getByRole("button", { name: "删除" }));
    const firstDialog = screen.getByRole("dialog");
    await waitFor(() =>
      expect(within(firstDialog).getByRole("button", { name: "取消" })).toHaveFocus()
    );
    await user.click(within(firstDialog).getByRole("button", { name: "取消" }));
    expect(screen.getByRole("checkbox", { name: "选择“report”" })).toBeChecked();

    await user.click(screen.getByRole("button", { name: "删除" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "删除" }));
    expect(onConfirmDelete).toHaveBeenCalledOnce();
    expect(onConfirmDelete).toHaveBeenCalledWith(plan);
    expect(screen.queryByRole("checkbox", { name: "选择“report”" })).not.toBeInTheDocument();
  });

  it("exits selection mode with Escape when no confirmation is open", async () => {
    const user = userEvent.setup();
    render(
      <DailyHistoryList
        entries={[parentEntry("report")]}
        onCreateDeletePlan={vi.fn()}
        onConfirmDelete={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "选择" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "选择" })).toBeVisible();
  });
});
