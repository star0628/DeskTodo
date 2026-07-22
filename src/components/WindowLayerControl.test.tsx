// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WindowLayerControl } from "./WindowLayerControl";

afterEach(cleanup);

describe("WindowLayerControl", () => {
  it("cycles to the next mode when the native bridge is available", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<WindowLayerControl mode="alwaysOnTop" onChange={onChange} available />);

    await user.click(screen.getByRole("button", { name: "窗口层级：置顶" }));

    expect(onChange).toHaveBeenCalledWith("normal");
  });

  it("is explicitly unavailable in the browser fallback", () => {
    render(<WindowLayerControl mode="normal" onChange={vi.fn()} available={false} />);

    const control = screen.getByRole("button", { name: /窗口层级：普通，窗口层级仅桌面版可用/ });
    expect(control).toBeDisabled();
    expect(control).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("status")).toHaveTextContent("窗口层级仅桌面版可用");
  });

  it("reports loading before hydration instead of misreporting browser unavailability", () => {
    render(<WindowLayerControl mode="normal" onChange={vi.fn()} ready={false} available={false} />);

    const control = screen.getByRole("button", { name: /窗口层级：普通，正在加载窗口设置/ });
    expect(control).toBeDisabled();
    expect(control).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent("正在加载窗口设置");
  });

  it("disables repeated changes while a native request is pending", () => {
    render(<WindowLayerControl mode="alwaysOnBottom" onChange={vi.fn()} available pending />);

    const control = screen.getByRole("button", { name: /正在切换窗口层级/ });
    expect(control).toBeDisabled();
    expect(control).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent("正在切换窗口层级");
  });
});
