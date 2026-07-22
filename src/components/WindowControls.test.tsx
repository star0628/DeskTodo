// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BEGIN_HIDE_MAIN_WINDOW_COMMAND,
  HIDE_MAIN_WINDOW_COMMAND,
  hideAfterFlush,
  WindowControls
} from "./WindowControls";

afterEach(cleanup);

describe("WindowControls", () => {
  it("keeps browser controls explicitly unavailable", () => {
    render(<WindowControls available={false} />);

    const hide = screen.getByRole("button", { name: /隐藏窗口，窗口控制仅桌面版可用/ });
    expect(hide).toBeDisabled();
    expect(hide).toHaveAttribute("aria-disabled", "true");
  });

  it("invokes the native hide command after a successful renderer flush", async () => {
    const user = userEvent.setup();
    const flush = vi.fn(async () => undefined);
    const invokeCommand = vi
      .fn()
      .mockResolvedValueOnce({ status: "pending", hideId: 17 })
      .mockResolvedValueOnce({ status: "hidden" });
    render(<WindowControls available flush={flush} invokeCommand={invokeCommand} />);

    await user.click(screen.getByRole("button", { name: "隐藏窗口" }));

    await waitFor(() =>
      expect(invokeCommand).toHaveBeenLastCalledWith(HIDE_MAIN_WINDOW_COMMAND, { hideId: 17 })
    );
    expect(invokeCommand).toHaveBeenNthCalledWith(1, BEGIN_HIDE_MAIN_WINDOW_COMMAND);
    expect(flush).toHaveBeenCalledOnce();
  });

  it("still invokes native hide when the renderer flush fails", async () => {
    const flushError = new Error("save failed");
    const flush = vi.fn(async () => {
      throw flushError;
    });
    const invokeCommand = vi
      .fn()
      .mockResolvedValueOnce({ status: "pending", hideId: 19 })
      .mockResolvedValueOnce({ status: "hidden" });

    await hideAfterFlush(flush, invokeCommand);

    expect(flush).toHaveBeenCalledOnce();
    expect(invokeCommand).toHaveBeenLastCalledWith(HIDE_MAIN_WINDOW_COMMAND, { hideId: 19 });
  });

  it("does not issue an unsafe untokened hide when native intent registration fails", async () => {
    const invokeCommand = vi.fn().mockResolvedValue({ status: "invalid" });

    await hideAfterFlush(vi.fn(), invokeCommand);

    expect(invokeCommand).toHaveBeenCalledTimes(1);
    expect(invokeCommand).toHaveBeenCalledWith(BEGIN_HIDE_MAIN_WINDOW_COMMAND);
  });
});
