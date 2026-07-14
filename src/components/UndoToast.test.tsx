// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UndoToast } from "./UndoToast";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("UndoToast", () => {
  it("invokes undo without stealing initial focus", async () => {
    const user = userEvent.setup();
    const onUndo = vi.fn();
    render(<UndoToast message="已删除任务" onUndo={onUndo} onDismiss={vi.fn()} />);

    expect(screen.getByRole("status")).toHaveTextContent("已删除任务");
    expect(screen.getByRole("button", { name: "撤销" })).not.toHaveFocus();
    await user.click(screen.getByRole("button", { name: "撤销" }));
    expect(onUndo).toHaveBeenCalledOnce();
  });

  it("dismisses after eight seconds", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(<UndoToast message="已删除任务" onUndo={vi.fn()} onDismiss={onDismiss} />);

    vi.advanceTimersByTime(7999);
    expect(onDismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
