// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { RecurringDeleteDialog } from "./RecurringDeleteDialog";

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

describe("RecurringDeleteDialog", () => {
  it("uses unique accessible labels when multiple task dialogs are mounted", () => {
    const { container } = render(
      <>
        <RecurringDeleteDialog open={false} title="A" onConfirm={vi.fn()} onClose={vi.fn()} />
        <RecurringDeleteDialog open={false} title="B" onConfirm={vi.fn()} onClose={vi.fn()} />
      </>
    );

    const dialogs = Array.from(container.querySelectorAll("dialog"));
    const labels = dialogs.map((dialog) => dialog.getAttribute("aria-labelledby"));
    expect(new Set(labels)).toHaveLength(2);
    for (const label of labels) {
      expect(label).toBeTruthy();
      expect(container.querySelector(`[id="${label}"]`)).toHaveTextContent("删除重复任务");
    }
  });

  it.each([
    ["仅删除本次", "skip"],
    ["停止重复并删除", "stop"]
  ] as const)("maps %s to the expected recurrence behavior", async (buttonName, behavior) => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <RecurringDeleteDialog
        open
        title="daily task"
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: buttonName }));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onConfirm).toHaveBeenCalledWith(behavior);
  });

  it("focuses the safe action and restores its trigger when cancelled", async () => {
    const user = userEvent.setup();
    const trigger = document.createElement("button");
    trigger.textContent = "删除入口";
    document.body.append(trigger);
    const onClose = vi.fn();

    const { rerender } = render(
      <RecurringDeleteDialog
        open
        title="daily task"
        onConfirm={vi.fn()}
        onClose={onClose}
        returnFocusRef={{ current: trigger }}
      />
    );

    const dialog = screen.getByRole("dialog", { name: "删除重复任务" });
    expect(dialog).toHaveClass("dialog-surface", "dialog-compact");
    await waitFor(() => expect(screen.getByRole("button", { name: "取消" })).toHaveFocus());
    await user.click(screen.getByRole("button", { name: "关闭删除确认" }));
    expect(onClose).toHaveBeenCalledOnce();
    rerender(
      <RecurringDeleteDialog
        open={false}
        title="daily task"
        onConfirm={vi.fn()}
        onClose={onClose}
        returnFocusRef={{ current: trigger }}
      />
    );
    await waitFor(() => expect(trigger).toHaveFocus());
    trigger.remove();
  });
});
