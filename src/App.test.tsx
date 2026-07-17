// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fallbackDefaultState } from "./persistence/appStateSchema";
import App from "./App";

const repositoryMock = vi.hoisted(() => ({
  load: vi.fn(),
  save: vi.fn()
}));

vi.mock("./persistence", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./persistence")>();
  return {
    ...actual,
    appStateRepository: repositoryMock,
    isTauriRuntime: () => false
  };
});

vi.mock("./hooks/useLocalDay", () => ({
  useLocalDay: () => "2026-07-17"
}));

beforeEach(() => {
  repositoryMock.load.mockResolvedValue({
    state: fallbackDefaultState(),
    status: "ok"
  });
  repositoryMock.save.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("App date views", () => {
  it("creates and saves a task for the selected future date", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("textbox", { name: "添加任务" });
    await user.click(screen.getByRole("button", { name: "后一天" }));

    const input = screen.getByRole("textbox", { name: "添加任务" });
    expect(input).toHaveAttribute("placeholder", "为明天 7月18日添加任务，Enter 创建");
    await user.type(input, "准备周报{Enter}");

    await waitFor(() => expect(repositoryMock.save).toHaveBeenCalledOnce());
    expect(repositoryMock.save.mock.calls[0][0].tasks[0]).toMatchObject({
      title: "准备周报",
      scheduledFor: "2026-07-18",
      children: []
    });
  });

  it("keeps a past date read-only", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("textbox", { name: "添加任务" });
    await user.click(screen.getByRole("button", { name: "前一天" }));

    expect(screen.queryByRole("textbox", { name: "添加任务" })).not.toBeInTheDocument();
    expect(screen.getByText("这一天还没有完成记录。")).toBeInTheDocument();
  });
});
