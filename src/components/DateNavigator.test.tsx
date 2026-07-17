// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { DateNavigator } from "./DateNavigator";

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

describe("DateNavigator", () => {
  it("opens a Chinese calendar from the date button", async () => {
    const user = userEvent.setup();
    renderNavigator();

    await user.click(screen.getByRole("button", { name: /选择日期/ }));

    expect(screen.getByRole("dialog", { name: "选择工作日期" })).toHaveAttribute("open");
    expect(screen.getByRole("dialog", { name: "选择工作日期" })).toHaveClass(
      "dialog-surface",
      "dialog-popover"
    );
    expect(screen.getByText("2026年7月")).toBeInTheDocument();
    expect(screen.getByText("一")).toBeInTheDocument();
  });

  it("selects a past date, closes, and restores trigger focus", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderNavigator(onChange);
    const trigger = screen.getByRole("button", { name: /选择日期/ });

    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: /7月12日/ }));

    expect(onChange).toHaveBeenCalledWith("2026-07-12");
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(screen.queryByRole("dialog", { name: "选择工作日期" })).not.toBeInTheDocument();
  });

  it("closes when the already-selected date is clicked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderNavigator(onChange);

    await user.click(screen.getByRole("button", { name: /选择日期/ }));
    const dialog = screen.getByRole("dialog", { name: "选择工作日期" });
    await user.click(within(dialog).getByRole("button", { name: /7月13日.*已选择/ }));

    expect(onChange).toHaveBeenCalledWith("2026-07-13");
    expect(screen.queryByRole("dialog", { name: "选择工作日期" })).not.toBeInTheDocument();
  });

  it("closes on an Escape key press without changing the date", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderNavigator(onChange);
    const trigger = screen.getByRole("button", { name: /选择日期/ });

    await user.click(trigger);
    fireEvent.keyDown(screen.getByRole("dialog", { name: "选择工作日期" }), { key: "Escape" });

    expect(onChange).not.toHaveBeenCalled();
    expect(trigger).toHaveFocus();
  });

  it("selects a future date from the calendar", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderNavigator(onChange);
    await user.click(screen.getByRole("button", { name: /选择日期/ }));
    await user.click(screen.getByRole("button", { name: /7月14日/ }));

    expect(onChange).toHaveBeenCalledWith("2026-07-14");
  });

  it("adds completion counts to day labels", async () => {
    const user = userEvent.setup();
    render(
      <DateNavigator
        selectedDate="2026-07-13"
        today="2026-07-13"
        completionCounts={new Map([["2026-07-12", 3]])}
        onChange={() => undefined}
      />
    );

    await user.click(screen.getByRole("button", { name: /选择日期/ }));

    expect(screen.getByRole("button", { name: /7月12日.*完成3项/ })).toBeInTheDocument();
  });

  it("adds scheduled counts to future day labels", async () => {
    const user = userEvent.setup();
    render(
      <DateNavigator
        selectedDate="2026-07-13"
        today="2026-07-13"
        scheduledCounts={new Map([["2026-07-14", 2]])}
        onChange={() => undefined}
      />
    );

    await user.click(screen.getByRole("button", { name: /选择日期/ }));

    expect(screen.getByRole("button", { name: /7月14日.*计划2项/ })).toBeInTheDocument();
  });

  it("allows previous and next navigation across today", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderNavigator(onChange);

    expect(screen.getByRole("button", { name: "前一天" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "后一天" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "后一天" }));
    expect(onChange).toHaveBeenCalledWith("2026-07-14");
  });

  it("opens global task search from its compact action", async () => {
    const user = userEvent.setup();
    const onOpenSearch = vi.fn();
    render(
      <DateNavigator
        selectedDate="2026-07-13"
        today="2026-07-13"
        onChange={vi.fn()}
        onOpenSearch={onOpenSearch}
      />
    );

    await user.click(screen.getByRole("button", { name: "搜索任务" }));
    expect(onOpenSearch).toHaveBeenCalledOnce();
  });

  it("removes the Today placeholder and lets the date column fill the row", () => {
    const { container } = render(
      <DateNavigator
        selectedDate="2026-07-13"
        today="2026-07-13"
        onChange={vi.fn()}
        onOpenSearch={vi.fn()}
      />
    );

    const navigation = container.querySelector(".date-navigator");
    expect(navigation).not.toBeNull();
    expect(navigation).toHaveClass("is-today", "has-search");
    expect(Array.from(navigation?.children ?? []).map((element) => element.className)).toEqual([
      "date-arrow date-arrow-previous",
      "date-picker-trigger",
      "date-arrow date-arrow-next",
      "date-search-button"
    ]);
    expect(navigation?.lastElementChild).toHaveClass("date-search-button");
    expect(container.querySelector(".today-button")).not.toBeInTheDocument();
  });

  it("keeps search last when the Today shortcut becomes visible", () => {
    const { container } = render(
      <DateNavigator
        selectedDate="2026-07-12"
        today="2026-07-13"
        onChange={vi.fn()}
        onOpenSearch={vi.fn()}
      />
    );

    const navigation = container.querySelector(".date-navigator");
    expect(navigation).not.toHaveClass("is-today");
    expect(container.querySelector(".today-button")).toBeEnabled();
    expect(navigation?.lastElementChild).toHaveClass("date-search-button");
  });
});

function renderNavigator(onChange = vi.fn()) {
  return render(
    <DateNavigator
      selectedDate="2026-07-13"
      today="2026-07-13"
      onChange={onChange}
    />
  );
}
