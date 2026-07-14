// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AutostartService } from "../platform/autostart";
import { fallbackDefaultState } from "../persistence/appStateSchema";
import { SettingsDialog } from "./SettingsDialog";

afterEach(cleanup);

describe("SettingsDialog", () => {
  it("dispatches theme, font size, and interface setting changes", async () => {
    const user = userEvent.setup();
    const dispatch = vi.fn();
    render(<SettingsDialog settings={fallbackDefaultState().settings} dispatch={dispatch} />);

    await user.click(screen.getByRole("button", { name: "打开设置" }));
    await user.click(screen.getByRole("radio", { name: /赤霞霜白/ }));
    await user.clear(screen.getByRole("spinbutton", { name: "界面字号数值" }));
    await user.type(screen.getByRole("spinbutton", { name: "界面字号数值" }), "18");
    await user.click(screen.getByRole("switch", { name: /紧凑模式/ }));
    await user.click(screen.getByRole("switch", { name: /默认折叠已完成/ }));

    expect(dispatch).toHaveBeenCalledWith({ type: "setColorTheme", theme: "citic-red" });
    expect(dispatch).toHaveBeenCalledWith({ type: "setFontSize", size: 18 });
    expect(dispatch).toHaveBeenCalledWith({ type: "setCompactMode", enabled: true });
    expect(dispatch).toHaveBeenCalledWith({
      type: "setCollapseCompletedByDefault",
      enabled: true
    });
  });

  it("disables autostart in the browser fallback", async () => {
    const user = userEvent.setup();
    render(<SettingsDialog settings={fallbackDefaultState().settings} dispatch={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "打开设置" }));
    const toggle = screen.getByRole("switch", { name: /开机自启动/ });
    expect(toggle).toBeDisabled();
    expect(screen.getByText("仅桌面版可用")).toBeInTheDocument();
  });

  it("reads and updates the native autostart status", async () => {
    const user = userEvent.setup();
    let enabled = false;
    const autostart: AutostartService = {
      isAvailable: () => true,
      isEnabled: vi.fn(async () => enabled),
      setEnabled: vi.fn(async (next) => {
        enabled = next;
      })
    };
    render(
      <SettingsDialog
        settings={fallbackDefaultState().settings}
        dispatch={vi.fn()}
        autostart={autostart}
      />
    );

    await user.click(screen.getByRole("button", { name: "打开设置" }));
    const toggle = screen.getByRole("switch", { name: /开机自启动/ });
    await waitFor(() => expect(toggle).not.toBeDisabled());
    await user.click(toggle);

    await waitFor(() => expect(toggle).toBeChecked());
    expect(autostart.setEnabled).toHaveBeenCalledWith(true);
  });

  it("restores the trigger focus after closing", async () => {
    const user = userEvent.setup();
    render(<SettingsDialog settings={fallbackDefaultState().settings} dispatch={vi.fn()} />);

    const trigger = screen.getByRole("button", { name: "打开设置" });
    await user.click(trigger);
    expect(screen.getByRole("dialog", { name: "设置" })).toHaveClass(
      "dialog-surface",
      "dialog-sheet"
    );
    await user.click(screen.getByRole("button", { name: "关闭设置" }));
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("previews opacity while dragging and commits one valid reducer action", async () => {
    const user = userEvent.setup();
    const dispatch = vi.fn();
    const preview = vi.fn();
    render(
      <SettingsDialog
        settings={fallbackDefaultState().settings}
        dispatch={dispatch}
        onBackgroundOpacityPreview={preview}
      />
    );

    await user.click(screen.getByRole("button", { name: "打开设置" }));
    const slider = screen.getByRole("slider", { name: "背景不透明度" });
    fireEvent.change(slider, { target: { value: "35" } });

    expect(preview).toHaveBeenLastCalledWith(35);
    expect(screen.getByText("低透明度可能降低文字可读性")).toBeInTheDocument();
    expect(dispatch).not.toHaveBeenCalledWith({ type: "setBackgroundOpacity", percent: 35 });

    fireEvent.pointerUp(slider);
    expect(dispatch).toHaveBeenCalledWith({ type: "setBackgroundOpacity", percent: 35 });
    expect(preview).toHaveBeenLastCalledWith(null);
  });

  it("clamps typed opacity to the supported 10-100 range", async () => {
    const user = userEvent.setup();
    const dispatch = vi.fn();
    render(<SettingsDialog settings={fallbackDefaultState().settings} dispatch={dispatch} />);

    await user.click(screen.getByRole("button", { name: "打开设置" }));
    const input = screen.getByRole("spinbutton", { name: "背景不透明度数值" });
    await user.clear(input);
    await user.type(input, "5");
    fireEvent.blur(input);

    expect(input).toHaveValue(10);
    expect(dispatch).toHaveBeenCalledWith({ type: "setBackgroundOpacity", percent: 10 });
  });

  it("keeps the renamed red-white theme id and places custom theme last", async () => {
    const user = userEvent.setup();
    render(<SettingsDialog settings={fallbackDefaultState().settings} dispatch={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "打开设置" }));
    const radios = screen.getAllByRole("radio");

    expect(screen.getByRole("radio", { name: /赤霞霜白/ })).toHaveAttribute(
      "value",
      "citic-red"
    );
    expect(radios[radios.length - 1]).toHaveAccessibleName(/自定配色/);
  });

  it("previews a custom HEX color without saving and commits exactly once", async () => {
    const user = userEvent.setup();
    const dispatch = vi.fn();
    const preview = vi.fn();
    const settings = {
      ...fallbackDefaultState().settings,
      colorTheme: "custom" as const
    };
    render(
      <SettingsDialog
        settings={settings}
        dispatch={dispatch}
        onCustomThemePreview={preview}
      />
    );

    await user.click(screen.getByRole("button", { name: "打开设置" }));
    await user.click(screen.getByRole("button", { name: "编辑强调颜色颜色编码" }));
    const input = screen.getByRole("textbox", { name: "强调颜色颜色编码" });
    fireEvent.change(input, { target: { value: "#1266cc" } });

    expect(preview).toHaveBeenLastCalledWith({
      ...settings.customThemeColors,
      accent: "#1266CC"
    });
    expect(dispatch).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "确定" }));
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({
      type: "setCustomThemeColors",
      colors: { ...settings.customThemeColors, accent: "#1266CC" }
    });
    expect(preview).toHaveBeenLastCalledWith(null);
  });

  it("rejects alpha HEX values and Escape cancels an uncommitted preview", async () => {
    const user = userEvent.setup();
    const dispatch = vi.fn();
    const preview = vi.fn();
    const settings = {
      ...fallbackDefaultState().settings,
      colorTheme: "custom" as const
    };
    render(
      <SettingsDialog
        settings={settings}
        dispatch={dispatch}
        onCustomThemePreview={preview}
      />
    );

    await user.click(screen.getByRole("button", { name: "打开设置" }));
    const trigger = screen.getByRole("button", { name: "编辑窗口底色颜色编码" });
    await user.click(trigger);
    const input = screen.getByRole("textbox", { name: "窗口底色颜色编码" });
    fireEvent.change(input, { target: { value: "#11223388" } });
    await user.click(screen.getByRole("button", { name: "确定" }));

    expect(screen.getByText("请输入 #RRGGBB")).toBeInTheDocument();
    expect(dispatch).not.toHaveBeenCalled();

    fireEvent.keyDown(screen.getByRole("region", { name: "编辑窗口底色" }), { key: "Escape" });
    expect(screen.queryByRole("region", { name: "编辑窗口底色" })).not.toBeInTheDocument();
    expect(preview).toHaveBeenLastCalledWith(null);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /编辑窗口底色，当前颜色/ })).toHaveFocus()
    );
  });
});
