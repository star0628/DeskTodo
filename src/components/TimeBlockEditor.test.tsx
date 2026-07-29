// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TimeBlockEditor } from "./TimeBlockEditor";

afterEach(cleanup);

describe("TimeBlockEditor", () => {
  it("edits each timed endpoint without rendering a datetime-local input", async () => {
    const user = userEvent.setup();
    const onEndDateChange = vi.fn();
    const onEndTimeChange = vi.fn();
    const { container } = render(
      <TimeBlockEditor
        kind="timed"
        startDate="2026-07-14"
        endDate="2026-07-14"
        startTime="19:00"
        endTime="20:00"
        onStartDateChange={vi.fn()}
        onEndDateChange={onEndDateChange}
        onStartTimeChange={vi.fn()}
        onEndTimeChange={onEndTimeChange}
      />
    );

    expect(container.querySelector('input[type="datetime-local"]')).toBeNull();
    expect(screen.getByRole("radio", { name: /开始/ })).toBeChecked();
    expect(screen.getByLabelText("开始时间")).toHaveValue("19:00");

    await user.click(screen.getByRole("radio", { name: /结束/ }));
    expect(screen.getByLabelText("结束时间")).toHaveValue("20:00");
    fireEvent.change(screen.getByLabelText("结束时间"), {
      target: { value: "20:30" }
    });
    expect(onEndTimeChange).toHaveBeenCalledWith("20:30");

    const calendar = screen.getByLabelText("选择结束日期");
    const day15 = within(calendar)
      .getAllByRole("button")
      .find((button) => button.textContent === "15");
    expect(day15).toBeDefined();
    await user.click(day15!);
    expect(onEndDateChange).toHaveBeenCalledWith("2026-07-15");
  });

  it("uses the same in-app calendar for an all-day interval and hides time", () => {
    const { container } = render(
      <TimeBlockEditor
        kind="allDay"
        startDate="2026-07-14"
        endDate="2026-07-16"
        startTime="09:00"
        endTime="10:00"
        onStartDateChange={vi.fn()}
        onEndDateChange={vi.fn()}
        onStartTimeChange={vi.fn()}
        onEndTimeChange={vi.fn()}
      />
    );

    expect(screen.getByLabelText("选择开始日期")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /开始/ })).toHaveAccessibleName(
      "开始 7月14日"
    );
    expect(screen.queryByLabelText("开始时间")).not.toBeInTheDocument();
    expect(container.querySelector('input[type="date"]')).toBeNull();
  });
});
