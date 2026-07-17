// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { TodoItem } from "../domain/todoTypes";
import { fallbackDefaultState } from "../persistence/appStateSchema";
import { TaskSearchDialog } from "./TaskSearchDialog";

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

describe("TaskSearchDialog", () => {
  it("searches completed history and navigates to its completion date", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    const onClose = vi.fn();
    render(
      <TaskSearchDialog
        open
        state={{ ...fallbackDefaultState(), tasks: [task(true)] }}
        today="2026-07-13"
        onNavigate={onNavigate}
        onClose={onClose}
      />
    );

    const input = await screen.findByRole("searchbox", { name: "搜索任务和子任务" });
    await waitFor(() => expect(input).toHaveFocus());
    await user.type(input, "历史");
    await user.click(screen.getByRole("button", { name: /历史任务/ }));

    expect(onNavigate).toHaveBeenCalledWith("2026-07-12", "task-1");
    expect(onClose).toHaveBeenCalled();
  });

  it("filters matching results to unfinished work", async () => {
    const user = userEvent.setup();
    render(
      <TaskSearchDialog
        open
        state={{
          ...fallbackDefaultState(),
          tasks: [task(false, { id: "open", title: "工作记录" }), task(true, { id: "done", title: "工作复盘" })]
        }}
        today="2026-07-13"
        onNavigate={vi.fn()}
        onClose={vi.fn()}
      />
    );

    await user.type(screen.getByRole("searchbox"), "工作");
    await user.click(screen.getByRole("button", { name: "未完成" }));

    expect(screen.getByText("工作记录")).toBeInTheDocument();
    expect(screen.queryByText("工作复盘")).not.toBeInTheDocument();
  });

  it("navigates unfinished scheduled work to its planned future date", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(
      <TaskSearchDialog
        open
        state={{
          ...fallbackDefaultState(),
          tasks: [
            task(false, {
              id: "future-task",
              title: "未来计划",
              scheduledFor: "2026-07-20"
            })
          ]
        }}
        today="2026-07-13"
        onNavigate={onNavigate}
        onClose={vi.fn()}
      />
    );

    await user.type(await screen.findByRole("searchbox"), "未来");
    await user.click(screen.getByRole("button", { name: /未来计划/ }));

    expect(onNavigate).toHaveBeenCalledWith("2026-07-20", "future-task");
  });

  it("uses the shared sheet surface and restores its trigger after closing", async () => {
    const user = userEvent.setup();
    const trigger = document.createElement("button");
    trigger.textContent = "搜索入口";
    document.body.append(trigger);
    const onClose = vi.fn();

    const { rerender } = render(
      <TaskSearchDialog
        open
        state={fallbackDefaultState()}
        today="2026-07-13"
        onNavigate={vi.fn()}
        onClose={onClose}
        returnFocusRef={{ current: trigger }}
      />
    );

    expect(screen.getByRole("dialog", { name: "搜索任务" })).toHaveClass(
      "dialog-surface",
      "dialog-sheet"
    );
    await user.click(screen.getByRole("button", { name: "关闭搜索" }));
    expect(onClose).toHaveBeenCalledOnce();
    rerender(
      <TaskSearchDialog
        open={false}
        state={fallbackDefaultState()}
        today="2026-07-13"
        onNavigate={vi.fn()}
        onClose={onClose}
        returnFocusRef={{ current: trigger }}
      />
    );
    await waitFor(() => expect(trigger).toHaveFocus());
    trigger.remove();
  });
});

function task(done: boolean, overrides: Partial<TodoItem> = {}): TodoItem {
  return {
    id: "task-1",
    title: "历史任务",
    done,
    createdAt: "2026-07-12T08:00:00.000Z",
    updatedAt: "2026-07-12T10:00:00.000Z",
    completedAt: done ? "2026-07-12T10:00:00.000Z" : null,
    completedOn: done ? "2026-07-12" : null,
    important: false,
    scheduledFor: null,
    deadlineAt: null,
    deadlineDisplayMode: "countdown",
    recurrenceSeriesId: null,
    children: [],
    ...overrides
  };
}
