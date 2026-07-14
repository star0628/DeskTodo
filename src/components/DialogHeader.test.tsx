// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DialogHeader } from "./DialogHeader";

afterEach(cleanup);

describe("DialogHeader", () => {
  it("provides one consistent heading and named close action", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { container } = render(
      <DialogHeader
        titleId="dialog-title"
        title="设置"
        subtitle="更改立即生效"
        closeLabel="关闭设置"
        onClose={onClose}
      />
    );

    expect(container.querySelector(".dialog-header")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "设置" })).toHaveAttribute("id", "dialog-title");
    expect(screen.getByText("更改立即生效")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "关闭设置" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
