import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

interface TauriWindowConfig {
  label?: string;
  decorations?: boolean;
  transparent?: boolean;
  shadow?: boolean;
  visible?: boolean;
  alwaysOnTop?: boolean;
}

interface SecurityConfig {
  csp?: Record<string, string>;
  devCsp?: Record<string, string>;
}

interface TauriConfig {
  app?: {
    windows?: TauriWindowConfig[];
    security?: SecurityConfig;
  };
}

const rustSource = () => readFileSync(resolve(process.cwd(), "src-tauri/src/lib.rs"), "utf8");
const appSource = () => readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const windowLayerSource = () => readFileSync(resolve(process.cwd(), "src/persistence/windowLayer.ts"), "utf8");

describe("Tauri transparent window contract", () => {
  it("keeps the transparent undecorated window hidden in a safe normal config state", () => {
    const config = JSON.parse(
      readFileSync(resolve(process.cwd(), "src-tauri/tauri.conf.json"), "utf8")
    ) as TauriConfig;
    const mainWindow = config.app?.windows?.find((window) => window.label === "main");

    expect(mainWindow).toMatchObject({
      decorations: false,
      transparent: true,
      shadow: false,
      visible: false,
      alwaysOnTop: false
    });
  });

  it("keeps loopback development access out of the production CSP", () => {
    const config = JSON.parse(
      readFileSync(resolve(process.cwd(), "src-tauri/tauri.conf.json"), "utf8")
    ) as TauriConfig;
    const releaseCsp = config.app?.security?.csp;
    const devCsp = config.app?.security?.devCsp;

    expect(releaseCsp).toMatchObject({
      "default-src": expect.stringContaining("'self'"),
      "connect-src": expect.stringContaining("ipc:"),
      "style-src": expect.stringContaining("'unsafe-inline'")
    });
    expect(releaseCsp?.["connect-src"]).not.toContain("127.0.0.1");
    expect(releaseCsp?.["connect-src"]).not.toContain("ws:");
    expect(devCsp?.["connect-src"]).toContain("http://127.0.0.1:1420");
    expect(devCsp?.["connect-src"]).toContain("ws://127.0.0.1:1420");
  });

  it("uses renderer sessions and main-thread acknowledgements for layer changes", () => {
    const source = rustSource();
    const frontend = windowLayerSource();

    expect(source).toContain("renderer: Mutex<RendererSessionState>");
    expect(source).toContain("fn begin_renderer_session");
    expect(source).toContain("fn register_mode_request");
    expect(source).toContain("fn is_current_mode_request");
    expect(source).toContain("run_on_main_thread_and_wait");
    expect(source).toContain("tauri::async_runtime::spawn_blocking");
    expect(source).toContain("apply_window_layer_with_rollback");
    expect(frontend).toContain("sessionId");
    expect(frontend).toContain("createRendererSessionId");
    expect(frontend).toContain("getNativeResponseError");
  });

  it("atomically applies the hydrated mode and reveals the startup window", () => {
    const source = rustSource();
    const frontend = appSource();
    const windowLayer = windowLayerSource();

    expect(source).toContain("async fn desktodo_initialize_window_lifecycle");
    expect(source).toContain("run_mode_transaction(app, session_id, request_id, mode, true, None)");
    expect(source).toContain("STARTUP_REVEAL_TIMEOUT");
    expect(source).not.toContain("desktodo_show_main_window");
    expect(frontend).toContain("windowLayerController.initialize(mode)");
    expect(frontend).toContain("windowLayerReady={hasHydrated && windowLayerInitialized}");
    expect(windowLayer).toContain("INITIALIZE_WINDOW_LIFECYCLE_COMMAND");
  });

  it("uses a cancellable recovery acknowledgement with a safe fallback", () => {
    const source = rustSource();
    const frontend = appSource();

    expect(source).toContain("RECOVERY_ACK_TIMEOUT");
    expect(source).toContain("fn desktodo_complete_window_recovery");
    expect(source).toContain("schedule_recovery_ack_fallback");
    expect(source).toContain('"modeSessionIdAtStart"');
    expect(source).toContain("recovery_ack_fallback_blocking");
    expect(frontend).toContain("await windowLayerController.flush()");
    expect(frontend).toContain("windowLayerController.completeRecovery(payload.recoveryId)");
    expect(source).not.toContain("RECOVERY_PENDING");
  });

  it("uses a native-issued hide token for every frontend hide acknowledgement", () => {
    const source = rustSource();
    const controls = readFileSync(resolve(process.cwd(), "src/components/WindowControls.tsx"), "utf8");
    const frontend = appSource();

    expect(source).toContain("fn desktodo_begin_hide_main_window");
    expect(source).toContain("async fn desktodo_hide_main_window");
    expect(source).toContain("schedule_hide_fallback");
    expect(source).toContain("if !coordinator.is_current_hide(hide_id)");
    expect(controls).toContain("BEGIN_HIDE_MAIN_WINDOW_COMMAND");
    expect(controls).toContain("HIDE_MAIN_WINDOW_COMMAND, { hideId }");
    expect(frontend).toContain('invoke("desktodo_hide_main_window", { hideId: payload.hideId })');
  });

  it("keeps native-only window permissions behind custom commands", () => {
    const cargoSource = readFileSync(resolve(process.cwd(), "src-tauri/Cargo.toml"), "utf8");
    const capabilitySource = readFileSync(
      resolve(process.cwd(), "src-tauri/capabilities/default.json"),
      "utf8"
    );

    expect(cargoSource).not.toContain("tauri-plugin-opener");
    expect(capabilitySource).not.toContain("opener:");
    expect(capabilitySource).not.toContain("core:default");
    expect(capabilitySource).toContain("core:event:allow-listen");
    expect(capabilitySource).toContain("core:window:allow-start-dragging");
    expect(capabilitySource).not.toContain("allow-set-always-on-top");
    expect(capabilitySource).not.toContain("allow-set-always-on-bottom");
    expect(capabilitySource).not.toContain("allow-hide");
  });

  it("avoids unsupported desktop embedding mechanisms", () => {
    const source = rustSource();

    expect(source).not.toMatch(/WorkerW|Progman|SetParent/);
    expect(source).toContain("ShowWindowAsync(hwnd, SW_RESTORE)");
    expect(source).toContain("Some(HWND_TOPMOST)");
  });
});
