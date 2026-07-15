// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { HistoryDeletionPlan } from "../domain/historyDeletion";
import { HistoryDeleteDialog } from "./HistoryDeleteDialog";

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

const plan: HistoryDeletionPlan = {
  targets: [{ kind: "task", taskId: "parent", completedOn: "2026-07-12" }],
  snapshot: { parents: [], children: [] },
  selectedCount: 1,
  deletedEntryCount: 3,
  otherDateCount: 1,
  focusId: "parent"
};

describe("HistoryDeleteDialog", () => {
  it("shows exact impact, focuses cancel, and exposes one destructive action", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <HistoryDeleteDialog
        open
        plan={plan}
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText("将删除 3 条完成记录。")).toBeVisible();
    expect(screen.getByText("其中 1 条属于其他日期。")).toBeVisible();
    await waitFor(() => expect(screen.getByRole("button", { name: "取消" })).toHaveFocus());

    await user.click(screen.getByRole("button", { name: "删除" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("restores focus to the delete trigger after cancellation", async () => {
    const user = userEvent.setup();
    const trigger = document.createElement("button");
    trigger.textContent = "历史删除入口";
    document.body.append(trigger);
    const onClose = vi.fn();
    const { rerender } = render(
      <HistoryDeleteDialog
        open
        plan={plan}
        onConfirm={vi.fn()}
        onClose={onClose}
        returnFocusRef={{ current: trigger }}
      />
    );

    await user.click(screen.getByRole("button", { name: "关闭历史删除确认" }));
    expect(onClose).toHaveBeenCalledOnce();
    rerender(
      <HistoryDeleteDialog
        open={false}
        plan={plan}
        onConfirm={vi.fn()}
        onClose={onClose}
        returnFocusRef={{ current: trigger }}
      />
    );
    await waitFor(() => expect(trigger).toHaveFocus());
    trigger.remove();
  });
});
