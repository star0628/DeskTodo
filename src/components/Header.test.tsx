// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fallbackDefaultState } from "../persistence/appStateSchema";
import { Header } from "./Header";

const { startDragging } = vi.hoisted(() => ({
  startDragging: vi.fn(async () => undefined)
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ startDragging })
}));

vi.mock("../persistence", () => ({
  isTauriRuntime: () => true
}));

vi.mock("../platform/autostart", () => ({
  autostartService: {
    isAvailable: () => false,
    isEnabled: async () => false,
    setEnabled: async () => undefined
  }
}));

afterEach(() => {
  cleanup();
  startDragging.mockClear();
});

describe("Header drag boundaries", () => {
  it("lets theme-card text select its radio without starting a window drag", async () => {
    const user = userEvent.setup();
    const dispatch = vi.fn();
    const settings = fallbackDefaultState().settings;
    render(
      <Header
        progressLabel="0 / 0 done"
        progressRatio={0}
        windowLayerMode={settings.windowLayerMode}
        onWindowLayerModeChange={vi.fn()}
        settings={settings}
        dispatch={dispatch}
      />
    );

    await user.click(screen.getByRole("button", { name: "打开设置" }));
    await user.click(screen.getByText("赤霞霜白"));
    await user.click(screen.getByText("深绿中性底，低刺激青色强调"));

    expect(dispatch).toHaveBeenNthCalledWith(1, {
      type: "setColorTheme",
      theme: "citic-red"
    });
    expect(dispatch).toHaveBeenNthCalledWith(2, {
      type: "setColorTheme",
      theme: "jade-forest"
    });
    expect(startDragging).not.toHaveBeenCalled();
  });

  it("keeps the title area draggable in Tauri", async () => {
    const user = userEvent.setup();
    const settings = fallbackDefaultState().settings;
    render(
      <Header
        progressLabel="0 / 0 done"
        progressRatio={0}
        windowLayerMode={settings.windowLayerMode}
        onWindowLayerModeChange={vi.fn()}
        settings={settings}
        dispatch={vi.fn()}
      />
    );

    await user.click(screen.getByRole("heading", { name: "Day Todo" }));
    expect(startDragging).toHaveBeenCalledOnce();
  });

  it("keeps every header control outside the window drag target", () => {
    const settings = fallbackDefaultState().settings;
    render(
      <Header
        progressLabel="3 / 8 done"
        progressRatio={3 / 8}
        windowLayerMode={settings.windowLayerMode}
        onWindowLayerModeChange={vi.fn()}
        settings={settings}
        dispatch={vi.fn()}
      />
    );

    const controls = screen.getByRole("group", { name: "应用与窗口控制" });
    for (const button of within(controls).getAllByRole("button")) {
      fireEvent.mouseDown(button, { button: 0 });
    }

    expect(startDragging).not.toHaveBeenCalled();
    expect(screen.getByLabelText("完成进度 3 / 8 done")).toBeInTheDocument();
  });
});
