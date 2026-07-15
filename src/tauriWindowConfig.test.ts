import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

interface TauriWindowConfig {
  label?: string;
  decorations?: boolean;
  transparent?: boolean;
  shadow?: boolean;
}

describe("Tauri transparent window contract", () => {
  it("disables the native undecorated window shadow that creates a Windows edge line", () => {
    const config = JSON.parse(
      readFileSync(resolve(process.cwd(), "src-tauri/tauri.conf.json"), "utf8")
    ) as { app?: { windows?: TauriWindowConfig[] } };
    const mainWindow = config.app?.windows?.find((window) => window.label === "main");

    expect(mainWindow).toMatchObject({
      decorations: false,
      transparent: true,
      shadow: false
    });
  });

  it("routes every user-facing reveal entry through the shared recovery path", () => {
    const rustSource = readFileSync(resolve(process.cwd(), "src-tauri/src/lib.rs"), "utf8");

    expect(rustSource).toContain("TrayIconEvent::Click");
    expect(rustSource).toContain("button: MouseButton::Left");
    expect(rustSource).toContain("button_state: MouseButtonState::Up");
    expect(rustSource).toContain("TrayIconEvent::DoubleClick");
    expect(rustSource).toContain("recover_main_window(tray.app_handle())");
    expect(rustSource).toContain('"show" => recover_main_window(app)');
    expect(rustSource).toContain("recover_main_window(app);");
    expect(rustSource).toContain(".show_menu_on_left_click(false)");
    expect(rustSource).toContain("show_main_window_on_startup(app.handle())");
  });

  it("temporarily promotes, shows, restores and focuses, then performs one bounded verification", () => {
    const rustSource = readFileSync(resolve(process.cwd(), "src-tauri/src/lib.rs"), "utf8");
    const recoveryStart = rustSource.indexOf("fn recover_main_window");
    const recoveryEnd = rustSource.indexOf("fn hide_main_window", recoveryStart);
    const recoverySource = rustSource.slice(recoveryStart, recoveryEnd);

    expect(recoveryStart).toBeGreaterThan(-1);
    expect(recoverySource).toContain("set_always_on_bottom(false)");
    expect(recoverySource).toContain("set_always_on_top(true)");
    expect(recoverySource).toContain("force_windows_foreground(&window)");
    expect(recoverySource.indexOf("window.show()")).toBeLessThan(
      recoverySource.indexOf("window.unminimize()")
    );
    expect(recoverySource.indexOf("window.unminimize()")).toBeLessThan(
      recoverySource.indexOf("window.set_focus()")
    );
    expect(recoverySource).toContain("Duration::from_millis(100)");
    expect(recoverySource).toContain("run_on_main_thread");
    expect(recoverySource).toContain("is_visible()");
    expect(recoverySource).toContain("is_minimized()");
    expect(recoverySource).toContain("is_focused()");
    expect(recoverySource).toContain("RECOVERY_PENDING.store(true, Ordering::SeqCst)");
    expect(recoverySource).toContain("complete_window_recovery(retry_window.app_handle())");
  });

  it("settles the temporary foreground layer only after native focus succeeds", () => {
    const rustSource = readFileSync(resolve(process.cwd(), "src-tauri/src/lib.rs"), "utf8");

    expect(rustSource).toContain(
      "WindowEvent::Focused(true) => complete_window_recovery(window.app_handle())"
    );
    expect(rustSource).toContain("RECOVERY_PENDING.swap(false, Ordering::SeqCst)");
    expect(rustSource).toContain('window.emit("desktodo://recover-window", ())');
  });

  it("uses a Windows-only native restore fallback without desktop embedding", () => {
    const rustSource = readFileSync(resolve(process.cwd(), "src-tauri/src/lib.rs"), "utf8");
    const cargoSource = readFileSync(resolve(process.cwd(), "src-tauri/Cargo.toml"), "utf8");

    expect(cargoSource).toContain("[target.'cfg(windows)'.dependencies]");
    expect(rustSource).toContain("ShowWindowAsync(hwnd, SW_RESTORE)");
    expect(rustSource).toContain("Some(HWND_TOPMOST)");
    expect(rustSource).toContain("BringWindowToTop(hwnd)");
    expect(rustSource).toContain("SetForegroundWindow(hwnd)");
    expect(rustSource).not.toMatch(/WorkerW|Progman|SetParent/);
  });

  it("reconciles the recovered native layer with frontend state", () => {
    const rustSource = readFileSync(resolve(process.cwd(), "src-tauri/src/lib.rs"), "utf8");
    const appSource = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");

    expect(rustSource).not.toContain("desktodo://reapply-window-layer");
    expect(appSource).not.toContain("desktodo://reapply-window-layer");
    expect(rustSource).toContain("desktodo://recover-window");
    expect(appSource).toContain('listen("desktodo://recover-window"');
    expect(appSource).toContain('dispatchTodoAction({ type: "setWindowLayerMode", mode: recoveredMode })');
    expect(appSource).toContain("applyWindowLayerMode(state.settings.windowLayerMode)");
  });
});
