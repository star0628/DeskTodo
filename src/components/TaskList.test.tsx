// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TodoAction } from "../domain/todoReducer";
import { TodoItem } from "../domain/todoTypes";
import { TaskList } from "./TaskList";

afterEach(cleanup);

describe("TaskList", () => {
  it("renders completed tasks below active tasks and toggles the section", async () => {
    const user = userEvent.setup();
    render(
      <TaskList
        activeTasks={[task("active", false)]}
        completedTasks={[task("completed", true)]}
        today="2026-07-13"
        dispatch={vi.fn()}
        onDeleteTask={vi.fn()}
        onDeleteSubtask={vi.fn()}
      />
    );

    const titles = screen.getAllByTitle(/（双击编辑）$/).map((element) => element.textContent);
    expect(titles).toEqual(["active", "completed"]);

    const toggle = screen.getByRole("button", { name: "已完成 1" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("completed")).not.toBeInTheDocument();
  });

  it("does not render a completed section when it is empty", () => {
    render(
      <TaskList
        activeTasks={[task("active", false)]}
        completedTasks={[]}
        today="2026-07-13"
        dispatch={vi.fn()}
        onDeleteTask={vi.fn()}
        onDeleteSubtask={vi.fn()}
      />
    );

    expect(screen.queryByRole("button", { name: /已完成/ })).not.toBeInTheDocument();
  });

  it("honors the default completed-section collapse setting", () => {
    render(
      <TaskList
        activeTasks={[]}
        completedTasks={[task("completed", true)]}
        today="2026-07-13"
        dispatch={vi.fn()}
        onDeleteTask={vi.fn()}
        onDeleteSubtask={vi.fn()}
        collapseCompletedByDefault
      />
    );

    expect(screen.getByRole("button", { name: "已完成 1" })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
    expect(screen.queryByText("completed")).not.toBeInTheDocument();
  });

  it("restores checkbox focus after a completed task moves to the bottom section", async () => {
    const user = userEvent.setup();

    function Harness() {
      const [item, setItem] = useState(task("focus task", false));
      return (
        <TaskList
          activeTasks={item.done ? [] : [item]}
          completedTasks={item.done ? [item] : []}
          today="2026-07-13"
          dispatch={(action) => {
            if (action.type === "toggleTask") {
              setItem((current) => ({ ...current, done: !current.done }));
            }
          }}
          onDeleteTask={vi.fn()}
          onDeleteSubtask={vi.fn()}
        />
      );
    }

    render(<Harness />);
    await user.click(screen.getByRole("checkbox", { name: "标记为完成" }));

    const movedCheckbox = await screen.findByRole("checkbox", { name: "标记为未完成" });
    await waitFor(() => expect(movedCheckbox).toHaveFocus());
  });

  it("dispatches an important toggle from the parent task row", async () => {
    const user = userEvent.setup();
    const dispatch = vi.fn();
    render(
      <TaskList
        activeTasks={[task("important candidate", false)]}
        completedTasks={[]}
        today="2026-07-13"
        dispatch={dispatch}
        onDeleteTask={vi.fn()}
        onDeleteSubtask={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "标记为重要任务" }));
    expect(dispatch).toHaveBeenCalledWith({
      type: "setTaskImportant",
      id: "important candidate",
      important: true
    });
  });

  it("gives no-subtask rows a four-control action rail without an empty progress slot", () => {
    const { container } = renderTaskList(vi.fn());
    const actions = container.querySelector(".task-actions-parent");

    expect(actions).not.toBeNull();
    expect(container.querySelector(".subtask-progress")).toBeNull();
    expect(actions?.querySelector(".important-button")).not.toBeNull();
    expect(actions?.querySelector(".recurrence-trigger")).not.toBeNull();
    expect(actions?.querySelector(".add-subtask-button")).not.toBeNull();
    expect(actions?.querySelector(".delete-task-button")).not.toBeNull();
  });

  it("shows progress inside the task copy when subtasks exist", () => {
    const parent = task("parent with progress", false);
    parent.children = [task("done child", true), task("open child", false)];
    const { container } = renderTaskList(vi.fn(), [parent]);
    const progress = container.querySelector(".subtask-progress");

    expect(progress).toHaveTextContent("1 / 2");
    expect(progress).toHaveAccessibleName("子任务完成 1，共 2 项");
    expect(progress).toBe(container.querySelector(".task-copy .subtask-progress"));
    expect(progress).toBe(container.querySelector(".task-meta-row .subtask-progress"));
    expect(container.querySelector(".task-actions-parent .subtask-progress")).toBeNull();
  });

  it("does not dispatch when an unchanged title is committed", async () => {
    const user = userEvent.setup();
    const dispatch = vi.fn();
    renderTaskList(dispatch);

    await user.dblClick(screen.getByTitle("parent task（双击编辑）"));
    await user.keyboard("{Enter}");

    expect(dispatch).not.toHaveBeenCalled();
    expect(screen.getByTitle("parent task（双击编辑）")).toBeInTheDocument();
  });

  it("saves a changed title exactly once on Enter", async () => {
    const user = userEvent.setup();
    const dispatch = vi.fn();
    renderTaskList(dispatch);

    await user.dblClick(screen.getByTitle("parent task（双击编辑）"));
    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "updated parent");
    await user.keyboard("{Enter}");

    expect(dispatch).toHaveBeenCalledOnce();
    expect(dispatch).toHaveBeenCalledWith({
      type: "editTask",
      id: "parent task",
      title: "updated parent"
    });
  });

  it("cancels title editing with Escape and skips an unchanged blur", async () => {
    const user = userEvent.setup();
    const dispatch = vi.fn();
    renderTaskList(dispatch);

    await user.dblClick(screen.getByTitle("parent task（双击编辑）"));
    await user.type(screen.getByRole("textbox"), " discarded");
    await user.keyboard("{Escape}");
    expect(dispatch).not.toHaveBeenCalled();

    await user.dblClick(screen.getByTitle("parent task（双击编辑）"));
    await user.click(document.body);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("closes an empty subtask draft after an outside click without dispatching", async () => {
    const user = userEvent.setup();
    const dispatch = vi.fn();
    renderTaskList(dispatch);

    await user.click(screen.getByRole("button", { name: "添加子任务" }));
    expect(screen.getByRole("textbox", { name: "子任务标题" })).toBeInTheDocument();

    await user.click(document.body);

    expect(screen.queryByRole("textbox", { name: "子任务标题" })).not.toBeInTheDocument();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("does not create a whitespace-only subtask after an outside click", async () => {
    const user = userEvent.setup();
    const dispatch = vi.fn();
    renderTaskList(dispatch);

    await user.click(screen.getByRole("button", { name: "添加子任务" }));
    await user.type(screen.getByRole("textbox", { name: "子任务标题" }), "   ");
    await user.click(document.body);

    expect(dispatch).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox", { name: "子任务标题" })).not.toBeInTheDocument();
  });

  it("saves a non-empty subtask exactly once after an outside click", async () => {
    const user = userEvent.setup();
    const dispatch = vi.fn();
    renderTaskList(dispatch);

    await user.click(screen.getByRole("button", { name: "添加子任务" }));
    await user.type(
      screen.getByRole("textbox", { name: "子任务标题" }),
      "  子任务  draft  😊  "
    );
    await user.click(document.body);

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({
      type: "addSubtask",
      parentId: "parent task",
      title: "子任务  draft  😊"
    });
  });

  it("saves a subtask on Tab and does not double-submit on blur", async () => {
    const user = userEvent.setup();
    const dispatch = vi.fn();
    renderTaskList(dispatch);

    await user.click(screen.getByRole("button", { name: "添加子任务" }));
    await user.type(screen.getByRole("textbox", { name: "子任务标题" }), "tab draft");
    await user.tab();

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({
      type: "addSubtask",
      parentId: "parent task",
      title: "tab draft"
    });
  });

  it("keeps an empty draft open on Enter", async () => {
    const user = userEvent.setup();
    const dispatch = vi.fn();
    renderTaskList(dispatch);

    await user.click(screen.getByRole("button", { name: "添加子任务" }));
    await user.keyboard("{Enter}");

    expect(screen.getByRole("textbox", { name: "子任务标题" })).toBeInTheDocument();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("saves on Enter once and returns focus to the add-subtask button", async () => {
    const user = userEvent.setup();
    const dispatch = vi.fn();
    renderTaskList(dispatch);
    const addButton = screen.getByRole("button", { name: "添加子任务" });

    await user.click(addButton);
    await user.type(screen.getByRole("textbox", { name: "子任务标题" }), "enter draft");
    await user.keyboard("{Enter}");

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({
      type: "addSubtask",
      parentId: "parent task",
      title: "enter draft"
    });
    await waitFor(() => expect(addButton).toHaveFocus());
  });

  it("cancels with Escape and returns focus without saving", async () => {
    const user = userEvent.setup();
    const dispatch = vi.fn();
    renderTaskList(dispatch);
    const addButton = screen.getByRole("button", { name: "添加子任务" });

    await user.click(addButton);
    await user.type(screen.getByRole("textbox", { name: "子任务标题" }), "discard me");
    await user.keyboard("{Escape}");

    expect(dispatch).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox", { name: "子任务标题" })).not.toBeInTheDocument();
    await waitFor(() => expect(addButton).toHaveFocus());
  });

  it("does not submit Enter while a Chinese IME composition is active", async () => {
    const user = userEvent.setup();
    const dispatch = vi.fn();
    renderTaskList(dispatch);

    await user.click(screen.getByRole("button", { name: "添加子任务" }));
    const input = screen.getByRole("textbox", { name: "子任务标题" });
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "中文子任务" } });
    fireEvent.keyDown(input, {
      key: "Enter",
      code: "Enter",
      keyCode: 229,
      isComposing: true
    });

    expect(dispatch).not.toHaveBeenCalled();
    expect(input).toBeInTheDocument();

    fireEvent.compositionEnd(input);
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("keeps the current draft when its own add-subtask button is clicked again", async () => {
    const user = userEvent.setup();
    const dispatch = vi.fn();
    renderTaskList(dispatch);
    const addButton = screen.getByRole("button", { name: "添加子任务" });

    await user.click(addButton);
    const input = screen.getByRole("textbox", { name: "子任务标题" });
    await user.type(input, "keep draft");
    await user.click(addButton);

    expect(screen.getByRole("textbox", { name: "子任务标题" })).toHaveValue("keep draft");
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("finalizes the first draft before opening a subtask input for another task", async () => {
    const user = userEvent.setup();
    const dispatch = vi.fn();
    renderTaskList(dispatch, [task("first parent", false), task("second parent", false)]);
    const addButtons = screen.getAllByRole("button", { name: "添加子任务" });

    await user.click(addButtons[0]);
    await user.type(screen.getByRole("textbox", { name: "子任务标题" }), "first child");
    await user.click(addButtons[1]);

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({
      type: "addSubtask",
      parentId: "first parent",
      title: "first child"
    });
    expect(screen.getAllByRole("textbox", { name: "子任务标题" })).toHaveLength(1);
    expect(screen.getByRole("textbox", { name: "子任务标题" })).toHaveValue("");
  });

  it("finalizes on a captured outside pointer event even when the target prevents default", async () => {
    const user = userEvent.setup();
    const dispatch = vi.fn();
    render(
      <>
        <TaskList
          activeTasks={[task("parent task", false)]}
          completedTasks={[]}
          today="2026-07-13"
          dispatch={dispatch}
          onDeleteTask={vi.fn()}
          onDeleteSubtask={vi.fn()}
        />
        <button type="button" onPointerDown={(event) => event.preventDefault()}>
          外部控件
        </button>
      </>
    );

    await user.click(screen.getByRole("button", { name: "添加子任务" }));
    await user.type(screen.getByRole("textbox", { name: "子任务标题" }), "captured draft");
    fireEvent.pointerDown(screen.getByRole("button", { name: "外部控件" }));

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("textbox", { name: "子任务标题" })).not.toBeInTheDocument();
  });
});

function renderTaskList(
  dispatch: (action: TodoAction) => void,
  activeTasks: TodoItem[] = [task("parent task", false)]
) {
  return render(
    <TaskList
      activeTasks={activeTasks}
      completedTasks={[]}
      today="2026-07-13"
      dispatch={dispatch}
      onDeleteTask={vi.fn()}
      onDeleteSubtask={vi.fn()}
    />
  );
}

function task(title: string, done: boolean): TodoItem {
  return {
    id: title,
    title,
    done,
    createdAt: "2026-07-13T00:00:00.000Z",
    updatedAt: "2026-07-13T00:00:00.000Z",
    completedAt: done ? "2026-07-13T00:00:00.000Z" : null,
    completedOn: done ? "2026-07-13" : null,
    important: false,
    scheduledFor: null,
    deadlineAt: null,
    deadlineDisplayMode: "countdown",
    recurrenceSeriesId: null,
    children: []
  };
}
