// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QuickAddInput } from "./QuickAddInput";

afterEach(cleanup);

describe("QuickAddInput", () => {
  it("trims a task title and ignores empty input", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<QuickAddInput onAdd={onAdd} />);
    const input = screen.getByRole("textbox", { name: "添加任务" });

    await user.type(input, "   ");
    await user.keyboard("{Enter}");
    expect(onAdd).not.toHaveBeenCalled();

    await user.clear(input);
    await user.type(input, "  复核项目材料  ");
    await user.keyboard("{Enter}");

    expect(onAdd).toHaveBeenCalledOnce();
    expect(onAdd).toHaveBeenCalledWith("复核项目材料");
    expect(input).toHaveValue("");
  });

  it("does not submit Enter while a Chinese IME composition is active", () => {
    const onAdd = vi.fn();
    render(<QuickAddInput onAdd={onAdd} />);
    const input = screen.getByRole("textbox", { name: "添加任务" });

    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "中文任务" } });
    fireEvent.keyDown(input, {
      key: "Enter",
      code: "Enter",
      keyCode: 229,
      isComposing: true
    });
    expect(onAdd).not.toHaveBeenCalled();
    expect(input).toHaveValue("中文任务");

    fireEvent.compositionEnd(input);
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
    expect(onAdd).toHaveBeenCalledOnce();
    expect(onAdd).toHaveBeenCalledWith("中文任务");
  });
});
