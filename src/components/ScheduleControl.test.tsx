// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { localDeadlineToIso } from "../domain/deadline";
import { ScheduleControl } from "./ScheduleControl";

const originalShowModal = HTMLDialogElement.prototype.showModal;
const originalClose = HTMLDialogElement.prototype.close;

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
  };
});

afterEach(cleanup);

afterAll(() => {
  HTMLDialogElement.prototype.showModal = originalShowModal;
  HTMLDialogElement.prototype.close = originalClose;
});

describe("ScheduleControl", () => {
  it("uses one stable action slot for deadline and recurrence state", () => {
    const { rerender } = renderControl();
    const emptyTrigger = screen.getByRole("button", { name: /当前未设置/ });
    expect(emptyTrigger).toHaveAttribute("aria-pressed", "false");
    expect(emptyTrigger).toHaveClass("schedule-trigger", "recurrence-trigger");

    rerender(
      <ScheduleControl
        scheduledFor="2026-07-14"
        deadlineAt={localDeadlineToIso("2026-07-14", "22:00")}
        deadlineDisplayMode="countdown"
        rule={{ kind: "daily" }}
        today="2026-07-14"
        onChange={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: /截止.*重复 每天/ })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("keeps dialog labels and recurrence radio groups isolated across task rows", () => {
    const { container } = render(
      <>
        <ScheduleControl
          scheduledFor={null}
          deadlineAt={null}
          deadlineDisplayMode="countdown"
          rule={null}
          today="2026-07-14"
          onChange={vi.fn()}
        />
        <ScheduleControl
          scheduledFor="2026-07-14"
          deadlineAt={null}
          deadlineDisplayMode="countdown"
          rule={{ kind: "daily" }}
          today="2026-07-14"
          onChange={vi.fn()}
        />
      </>
    );

    const dialogs = Array.from(container.querySelectorAll("dialog"));
    for (const tab of container.querySelectorAll<HTMLButtonElement>(
      '.schedule-tabs button[role="tab"]:last-child'
    )) {
      fireEvent.click(tab);
    }
    const radioNames = Array.from(
      container.querySelectorAll<HTMLInputElement>('input[type="radio"]')
    ).map((radio) => radio.name);

    expect(dialogs).toHaveLength(2);
    expect(dialogs[0].getAttribute("aria-labelledby")).not.toBe(
      dialogs[1].getAttribute("aria-labelledby")
    );
    expect(new Set(radioNames.slice(0, 4))).toHaveLength(1);
    expect(new Set(radioNames.slice(4))).toHaveLength(1);
    expect(radioNames[0]).not.toBe(radioNames[4]);
  });

  it("sets a preset deadline and saves a daily rule atomically", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderControl(onChange);

    await user.click(screen.getByRole("button", { name: /当前未设置/ }));
    expect(screen.getByRole("dialog", { name: "时间安排" })).toHaveClass(
      "dialog-surface",
      "dialog-compact"
    );
    await user.click(screen.getByRole("switch", { name: /设置截止时间/ }));
    await user.click(screen.getByRole("button", { name: "今天 22:00" }));
    await user.click(screen.getByRole("tab", { name: "重复" }));
    await user.click(screen.getByRole("radio", { name: "每天" }));
    await user.click(screen.getByRole("button", { name: "完成" }));

    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith({
      scheduledFor: null,
      deadlineAt: localDeadlineToIso("2026-07-14", "22:00"),
      deadlineDisplayMode: "countdown",
      rule: { kind: "daily" }
    });
    await waitFor(() => expect(screen.getByRole("button", { name: /当前未设置/ })).toHaveFocus());
  });

  it("does not emit a change when the schedule is unchanged", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ScheduleControl
        scheduledFor="2026-07-14"
        deadlineAt={null}
        deadlineDisplayMode="countdown"
        rule={{ kind: "daily" }}
        today="2026-07-14"
        onChange={onChange}
      />
    );

    await user.click(screen.getByRole("button", { name: /重复 每天/ }));
    await user.click(screen.getByRole("button", { name: "完成" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("sets a future planned date without changing deadline or recurrence", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderControl(onChange);

    await user.click(screen.getByRole("button", { name: /当前未设置/ }));
    await user.click(screen.getByRole("tab", { name: "计划日期" }));
    await user.click(screen.getByRole("button", { name: "明天" }));
    expect(screen.getByText("明天 7月15日")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "完成" }));

    expect(onChange).toHaveBeenCalledWith({
      scheduledFor: "2026-07-15",
      deadlineAt: null,
      deadlineDisplayMode: "countdown",
      rule: null
    });
  });

  it("clears a standalone planned date", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ScheduleControl
        scheduledFor="2026-07-20"
        deadlineAt={null}
        deadlineDisplayMode="countdown"
        rule={null}
        today="2026-07-14"
        onChange={onChange}
      />
    );

    await user.click(screen.getByRole("button", { name: /计划/ }));
    await user.click(screen.getByRole("button", { name: "无日期" }));
    await user.click(screen.getByRole("button", { name: "完成" }));

    expect(onChange).toHaveBeenCalledWith({
      scheduledFor: null,
      deadlineAt: null,
      deadlineDisplayMode: "countdown",
      rule: null
    });
  });

  it("keeps an existing recurring occurrence plan read-only", async () => {
    const user = userEvent.setup();
    render(
      <ScheduleControl
        scheduledFor="2026-07-20"
        deadlineAt={null}
        deadlineDisplayMode="countdown"
        rule={{ kind: "daily" }}
        today="2026-07-14"
        onChange={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: /重复 每天/ }));

    expect(screen.getByText(/计划日期由重复规则生成/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "无日期" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "今天" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "明天" })).toBeDisabled();
  });

  it("saves the selected deadline display mode with the schedule", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const deadlineAt = localDeadlineToIso("2026-07-14", "22:00");
    render(
      <ScheduleControl
        scheduledFor={null}
        deadlineAt={deadlineAt}
        deadlineDisplayMode="countdown"
        rule={null}
        today="2026-07-14"
        onChange={onChange}
      />
    );

    await user.click(screen.getByRole("button", { name: /截止/ }));
    expect(screen.getByRole("radio", { name: "倒计时" })).toBeChecked();
    await user.click(screen.getByRole("radio", { name: "截止时间" }));
    expect(screen.getByText("显示今天、明天或具体截止日期")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "完成" }));

    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith({
      scheduledFor: null,
      deadlineAt,
      deadlineDisplayMode: "dateTime",
      rule: null
    });
  });

  it("discards a draft display mode when the dialog is cancelled", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ScheduleControl
        scheduledFor={null}
        deadlineAt={localDeadlineToIso("2026-07-14", "22:00")}
        deadlineDisplayMode="countdown"
        rule={null}
        today="2026-07-14"
        onChange={onChange}
      />
    );

    await user.click(screen.getByRole("button", { name: /截止/ }));
    await user.click(screen.getByRole("radio", { name: "截止时间" }));
    await user.click(screen.getByRole("button", { name: "取消" }));
    expect(onChange).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /截止/ }));
    expect(screen.getByRole("radio", { name: "倒计时" })).toBeChecked();
  });

  it("shows the display choice only while a deadline is enabled", async () => {
    const user = userEvent.setup();
    renderControl();

    await user.click(screen.getByRole("button", { name: /当前未设置/ }));
    expect(screen.queryByRole("radio", { name: "倒计时" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("switch", { name: /设置截止时间/ }));
    expect(screen.getByRole("radio", { name: "倒计时" })).toBeChecked();
  });

  it("clears a deadline without changing the recurrence rule", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ScheduleControl
        scheduledFor="2026-07-14"
        deadlineAt={localDeadlineToIso("2026-07-14", "22:00")}
        deadlineDisplayMode="countdown"
        rule={{ kind: "weekdays" }}
        today="2026-07-14"
        onChange={onChange}
      />
    );

    await user.click(screen.getByRole("button", { name: /截止/ }));
    await user.click(screen.getByRole("tab", { name: "截止时间" }));
    await user.click(screen.getByRole("switch", { name: /设置截止时间/ }));
    await user.click(screen.getByRole("button", { name: "完成" }));

    expect(onChange).toHaveBeenCalledWith({
      scheduledFor: "2026-07-14",
      deadlineAt: null,
      deadlineDisplayMode: "countdown",
      rule: { kind: "weekdays" }
    });
  });

  it("moves the calendar to the next month for a cross-month preset", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ScheduleControl
        scheduledFor={null}
        deadlineAt={null}
        deadlineDisplayMode="countdown"
        rule={null}
        today="2026-07-31"
        onChange={onChange}
      />
    );

    await user.click(screen.getByRole("button", { name: /当前未设置/ }));
    await user.click(screen.getByRole("switch", { name: /设置截止时间/ }));
    await user.click(screen.getByRole("button", { name: "明天 09:00" }));

    expect(screen.getByText("2026年8月")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "完成" }));
    expect(onChange).toHaveBeenCalledWith({
      scheduledFor: null,
      deadlineAt: localDeadlineToIso("2026-08-01", "09:00"),
      deadlineDisplayMode: "countdown",
      rule: null
    });
  });

  it("prevents saving an empty weekly selection", async () => {
    const user = userEvent.setup();
    render(
      <ScheduleControl
        scheduledFor="2026-07-14"
        deadlineAt={null}
        deadlineDisplayMode="countdown"
        rule={{ kind: "weekly", weekdays: [1] }}
        today="2026-07-14"
        onChange={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: /重复 一/ }));
    await user.click(screen.getByRole("tab", { name: "重复" }));
    await user.click(screen.getByRole("button", { name: "一" }));
    expect(screen.getByText("每周重复至少选择一天。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "完成" })).toBeDisabled();
  });
});

function renderControl(onChange = vi.fn()) {
  return render(
    <ScheduleControl
      scheduledFor={null}
      deadlineAt={null}
      deadlineDisplayMode="countdown"
      rule={null}
      today="2026-07-14"
      onChange={onChange}
    />
  );
}
