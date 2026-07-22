use std::{
    fs,
    io::ErrorKind,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        mpsc, Mutex,
    },
    thread,
    time::Duration,
};

use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, WindowEvent,
};
use tauri_plugin_window_state::{AppHandleExt, StateFlags};

#[cfg(windows)]
use windows::Win32::UI::WindowsAndMessaging::{
    BringWindowToTop, SetForegroundWindow, SetWindowPos, ShowWindowAsync, HWND_TOPMOST, SWP_NOMOVE,
    SWP_NOSIZE, SWP_SHOWWINDOW, SW_RESTORE,
};

const MAIN_WINDOW_LABEL: &str = "main";
const RECOVERY_RETRY_DELAY: Duration = Duration::from_millis(100);
const RECOVERY_ACK_TIMEOUT: Duration = Duration::from_secs(3);
const HIDE_FLUSH_TIMEOUT: Duration = Duration::from_secs(3);
const STARTUP_REVEAL_TIMEOUT: Duration = Duration::from_secs(5);
const MAX_RENDERER_SESSION_ID_LENGTH: usize = 128;

static SHOULD_QUIT: AtomicBool = AtomicBool::new(false);

struct WindowLayerCoordinator {
    /// Native window operations are serialized from a blocking worker. Each
    /// operation itself runs on the OS main thread and returns only after that
    /// main-thread transaction has completed.
    gate: Mutex<()>,
    renderer: Mutex<RendererSessionState>,
    recovery_epoch: AtomicU64,
    active_recovery_id: AtomicU64,
    next_hide_id: AtomicU64,
    active_hide_id: AtomicU64,
    startup_revealed: AtomicBool,
}

struct RendererSessionState {
    session_id: Option<String>,
    latest_mode_request_id: u64,
    last_confirmed_mode: WindowLayerMode,
}

impl Default for WindowLayerCoordinator {
    fn default() -> Self {
        Self {
            gate: Mutex::new(()),
            renderer: Mutex::new(RendererSessionState {
                session_id: None,
                latest_mode_request_id: 0,
                // The config starts hidden in normal mode, so this is a safe
                // rollback target before the renderer has confirmed a mode.
                last_confirmed_mode: WindowLayerMode::Normal,
            }),
            recovery_epoch: AtomicU64::new(0),
            active_recovery_id: AtomicU64::new(0),
            next_hide_id: AtomicU64::new(0),
            active_hide_id: AtomicU64::new(0),
            startup_revealed: AtomicBool::new(false),
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum WindowLayerMode {
    AlwaysOnTop,
    Normal,
    AlwaysOnBottom,
}

impl WindowLayerMode {
    fn parse(value: &str) -> Result<Self, String> {
        match value {
            "alwaysOnTop" => Ok(Self::AlwaysOnTop),
            "normal" => Ok(Self::Normal),
            "alwaysOnBottom" => Ok(Self::AlwaysOnBottom),
            _ => Err("Unsupported DeskTodo window layer mode.".into()),
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::AlwaysOnTop => "alwaysOnTop",
            Self::Normal => "normal",
            Self::AlwaysOnBottom => "alwaysOnBottom",
        }
    }
}

impl WindowLayerCoordinator {
    fn begin_renderer_session(&self, session_id: &str, request_id: u64) -> Result<(), String> {
        if !is_valid_renderer_session_id(session_id) || request_id == 0 {
            return Err("DeskTodo renderer session request is invalid.".into());
        }

        let mut renderer = self
            .renderer
            .lock()
            .map_err(|_| "DeskTodo renderer session coordinator is unavailable.".to_string())?;
        renderer.session_id = Some(session_id.to_owned());
        renderer.latest_mode_request_id = request_id;
        Ok(())
    }

    fn register_mode_request(&self, session_id: &str, request_id: u64) -> bool {
        if request_id == 0 {
            return false;
        }

        let Ok(mut renderer) = self.renderer.lock() else {
            return false;
        };
        if renderer.session_id.as_deref() != Some(session_id) {
            return false;
        }
        if request_id <= renderer.latest_mode_request_id {
            return false;
        }

        renderer.latest_mode_request_id = request_id;
        true
    }

    fn is_current_mode_request(&self, session_id: &str, request_id: u64) -> bool {
        let Ok(renderer) = self.renderer.lock() else {
            return false;
        };
        renderer.session_id.as_deref() == Some(session_id)
            && renderer.latest_mode_request_id == request_id
    }

    fn is_current_renderer_session(&self, session_id: &str) -> bool {
        let Ok(renderer) = self.renderer.lock() else {
            return false;
        };
        renderer.session_id.as_deref() == Some(session_id)
    }

    fn mode_request_snapshot(&self) -> (Option<String>, u64) {
        let Ok(renderer) = self.renderer.lock() else {
            return (None, 0);
        };
        (renderer.session_id.clone(), renderer.latest_mode_request_id)
    }

    fn last_confirmed_mode(&self) -> WindowLayerMode {
        self.renderer
            .lock()
            .map(|renderer| renderer.last_confirmed_mode)
            .unwrap_or(WindowLayerMode::Normal)
    }

    fn record_confirmed_mode(&self, mode: WindowLayerMode) {
        if let Ok(mut renderer) = self.renderer.lock() {
            renderer.last_confirmed_mode = mode;
        }
    }

    fn begin_recovery(&self) -> u64 {
        self.cancel_hide();
        self.startup_revealed.store(true, Ordering::SeqCst);
        let recovery_id = self.recovery_epoch.fetch_add(1, Ordering::SeqCst) + 1;
        self.active_recovery_id.store(recovery_id, Ordering::SeqCst);
        recovery_id
    }

    fn cancel_recovery(&self) {
        self.recovery_epoch.fetch_add(1, Ordering::SeqCst);
        self.active_recovery_id.store(0, Ordering::SeqCst);
    }

    fn is_current_recovery(&self, recovery_id: u64) -> bool {
        recovery_id != 0
            && self.recovery_epoch.load(Ordering::SeqCst) == recovery_id
            && self.active_recovery_id.load(Ordering::SeqCst) == recovery_id
    }

    fn complete_recovery(&self, recovery_id: u64) -> bool {
        if !self.is_current_recovery(recovery_id) {
            return false;
        }
        self.active_recovery_id
            .compare_exchange(recovery_id, 0, Ordering::SeqCst, Ordering::SeqCst)
            .is_ok()
    }

    fn begin_hide(&self) -> u64 {
        let hide_id = self.next_hide_id.fetch_add(1, Ordering::SeqCst) + 1;
        self.active_hide_id.store(hide_id, Ordering::SeqCst);
        hide_id
    }

    fn is_current_hide(&self, hide_id: u64) -> bool {
        hide_id != 0 && self.active_hide_id.load(Ordering::SeqCst) == hide_id
    }

    fn cancel_hide(&self) {
        self.active_hide_id.store(0, Ordering::SeqCst);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(WindowLayerCoordinator::default())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            recover_main_window(app);
        }))
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(window_state_flags())
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            desktodo_initialize_window_lifecycle,
            desktodo_apply_window_layer_mode,
            desktodo_complete_window_recovery,
            desktodo_begin_hide_main_window,
            desktodo_hide_main_window,
            desktodo_quit,
            desktodo_store_file_status
        ])
        .setup(|app| {
            build_tray(app)?;
            schedule_startup_reveal_fallback(app.handle());
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if !SHOULD_QUIT.load(Ordering::SeqCst) {
                    api.prevent_close();
                    request_frontend_hide(window.app_handle());
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running DeskTodo");
}

#[tauri::command]
async fn desktodo_initialize_window_lifecycle(
    app: tauri::AppHandle,
    mode: String,
    request_id: u64,
    session_id: String,
) -> Result<serde_json::Value, String> {
    let mode = WindowLayerMode::parse(&mode)?;
    let coordinator = app.state::<WindowLayerCoordinator>();
    coordinator.begin_renderer_session(&session_id, request_id)?;
    coordinator.cancel_recovery();
    coordinator.cancel_hide();

    run_mode_transaction(app, session_id, request_id, mode, true, None).await
}

#[tauri::command]
async fn desktodo_apply_window_layer_mode(
    app: tauri::AppHandle,
    mode: String,
    request_id: u64,
    session_id: String,
    recovery_id: Option<u64>,
) -> Result<serde_json::Value, String> {
    let mode = WindowLayerMode::parse(&mode)?;
    if !is_valid_renderer_session_id(&session_id) {
        return Err("DeskTodo renderer session request is invalid.".into());
    }

    let coordinator = app.state::<WindowLayerCoordinator>();
    if !coordinator.register_mode_request(&session_id, request_id) {
        return Ok(window_layer_result("stale", mode, &session_id));
    }

    match recovery_id {
        Some(recovery_id) if coordinator.is_current_recovery(recovery_id) => {}
        Some(_) => return Ok(window_layer_result("stale", mode, &session_id)),
        None => coordinator.cancel_recovery(),
    }

    run_mode_transaction(app, session_id, request_id, mode, false, recovery_id).await
}

#[tauri::command]
fn desktodo_complete_window_recovery(
    app: tauri::AppHandle,
    recovery_id: u64,
    session_id: String,
) -> serde_json::Value {
    let coordinator = app.state::<WindowLayerCoordinator>();
    if !is_valid_renderer_session_id(&session_id)
        || !coordinator.is_current_renderer_session(&session_id)
        || !coordinator.complete_recovery(recovery_id)
    {
        return serde_json::json!({ "status": "stale" });
    }

    serde_json::json!({ "status": "completed" })
}

#[tauri::command]
fn desktodo_begin_hide_main_window(app: tauri::AppHandle) -> serde_json::Value {
    let hide_id = begin_frontend_hide(&app);
    serde_json::json!({ "status": "pending", "hideId": hide_id })
}

#[tauri::command]
async fn desktodo_hide_main_window(
    app: tauri::AppHandle,
    hide_id: u64,
) -> Result<serde_json::Value, String> {
    if hide_id == 0 {
        return Err("DeskTodo hide acknowledgement is invalid.".into());
    }

    let hidden = hide_main_window_for_request(app, hide_id).await?;
    Ok(serde_json::json!({
        "status": if hidden { "hidden" } else { "stale" }
    }))
}

async fn run_mode_transaction(
    app: tauri::AppHandle,
    session_id: String,
    request_id: u64,
    mode: WindowLayerMode,
    reveal: bool,
    recovery_id: Option<u64>,
) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let coordinator = app.state::<WindowLayerCoordinator>();
        let _guard = coordinator
            .gate
            .lock()
            .map_err(|_| "DeskTodo window layer coordinator is unavailable.".to_string())?;

        let is_current_request = coordinator.is_current_mode_request(&session_id, request_id);
        let is_current_recovery = recovery_id
            .map(|recovery_id| coordinator.is_current_recovery(recovery_id))
            .unwrap_or(true);
        if !is_current_request || !is_current_recovery {
            return Ok(window_layer_result("stale", mode, &session_id));
        }

        let window = app
            .get_webview_window(MAIN_WINDOW_LABEL)
            .ok_or_else(|| "DeskTodo main window is unavailable.".to_string())?;
        let previous_mode = coordinator.last_confirmed_mode();
        let focus = mode != WindowLayerMode::AlwaysOnBottom;
        run_on_main_thread_and_wait(&window, move |window| {
            apply_window_layer_with_rollback(window, mode, previous_mode)?;
            if reveal {
                reveal_window(window, focus, previous_mode)?;
            }
            Ok(())
        })?;

        coordinator.record_confirmed_mode(mode);
        if !coordinator.is_current_mode_request(&session_id, request_id)
            || recovery_id
                .map(|recovery_id| !coordinator.is_current_recovery(recovery_id))
                .unwrap_or(false)
        {
            return Ok(window_layer_result("stale", mode, &session_id));
        }

        if reveal {
            coordinator.startup_revealed.store(true, Ordering::SeqCst);
        }
        Ok(window_layer_result("applied", mode, &session_id))
    })
    .await
    .map_err(|error| format!("DeskTodo native window transaction failed: {error}"))?
}

async fn hide_main_window_for_request(app: tauri::AppHandle, hide_id: u64) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let coordinator = app.state::<WindowLayerCoordinator>();
        let _guard = coordinator
            .gate
            .lock()
            .map_err(|_| "DeskTodo window layer coordinator is unavailable.".to_string())?;
        if !coordinator.is_current_hide(hide_id) {
            return Ok(false);
        }

        coordinator.cancel_recovery();
        let window = app
            .get_webview_window(MAIN_WINDOW_LABEL)
            .ok_or_else(|| "DeskTodo main window is unavailable.".to_string())?;
        let app_for_main_thread = app.clone();
        run_on_main_thread_and_wait(&window, move |window| {
            if let Err(error) = app_for_main_thread.save_window_state(window_state_flags()) {
                eprintln!("DeskTodo window geometry save before hide failed: {error}");
            }
            window.hide().map_err(|error| error.to_string())
        })?;

        coordinator.cancel_hide();
        Ok(true)
    })
    .await
    .map_err(|error| format!("DeskTodo native hide transaction failed: {error}"))?
}

fn window_layer_result(status: &str, mode: WindowLayerMode, session_id: &str) -> serde_json::Value {
    serde_json::json!({
        "status": status,
        "mode": mode.as_str(),
        "sessionId": session_id
    })
}

fn run_on_main_thread_and_wait<T, F>(
    window: &tauri::WebviewWindow,
    operation: F,
) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce(&tauri::WebviewWindow) -> Result<T, String> + Send + 'static,
{
    let (sender, receiver) = mpsc::sync_channel(1);
    let task_window = window.clone();
    window
        .run_on_main_thread(move || {
            let _ = sender.send(operation(&task_window));
        })
        .map_err(|error| error.to_string())?;
    receiver
        .recv()
        .map_err(|_| "DeskTodo main-thread window transaction was cancelled.".to_string())?
}

fn apply_window_layer_with_rollback(
    window: &tauri::WebviewWindow,
    mode: WindowLayerMode,
    rollback_mode: WindowLayerMode,
) -> Result<(), String> {
    if let Err(error) = apply_window_layer_unchecked(window, mode) {
        if let Err(rollback_error) = apply_window_layer_unchecked(window, rollback_mode) {
            return Err(format!(
                "DeskTodo window layer apply failed: {error}; rollback to {} also failed: {rollback_error}",
                rollback_mode.as_str()
            ));
        }
        return Err(format!(
            "DeskTodo window layer apply failed and was rolled back to {}: {error}",
            rollback_mode.as_str()
        ));
    }
    Ok(())
}

fn apply_window_layer_unchecked(
    window: &tauri::WebviewWindow,
    mode: WindowLayerMode,
) -> Result<(), String> {
    match mode {
        WindowLayerMode::AlwaysOnTop => {
            window
                .set_always_on_bottom(false)
                .map_err(|error| error.to_string())?;
            window
                .set_always_on_top(true)
                .map_err(|error| error.to_string())?;
        }
        WindowLayerMode::Normal => {
            window
                .set_always_on_top(false)
                .map_err(|error| error.to_string())?;
            window
                .set_always_on_bottom(false)
                .map_err(|error| error.to_string())?;
        }
        WindowLayerMode::AlwaysOnBottom => {
            window
                .set_always_on_top(false)
                .map_err(|error| error.to_string())?;
            window
                .set_always_on_bottom(true)
                .map_err(|error| error.to_string())?;
        }
    }

    window
        .set_skip_taskbar(true)
        .map_err(|error| error.to_string())
}

fn reveal_window(
    window: &tauri::WebviewWindow,
    focus: bool,
    rollback_mode: WindowLayerMode,
) -> Result<(), String> {
    if let Err(error) = window.show().map_err(|error| error.to_string()) {
        let _ = apply_window_layer_unchecked(window, rollback_mode);
        return Err(error);
    }
    if let Err(error) = window.unminimize().map_err(|error| error.to_string()) {
        let _ = apply_window_layer_unchecked(window, rollback_mode);
        return Err(error);
    }
    if focus {
        let _ = window.set_focus();
    }
    Ok(())
}

fn build_tray(app: &mut tauri::App) -> tauri::Result<()> {
    let show_item = MenuItem::with_id(app, "show", "显示 DeskTodo", true, None::<&str>)?;
    let hide_item = MenuItem::with_id(app, "hide", "隐藏 DeskTodo", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_item, &hide_item, &quit_item])?;
    let icon = Image::from_bytes(include_bytes!("../icons/32x32.png"))?;

    TrayIconBuilder::new()
        .tooltip("DeskTodo")
        .icon(icon)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => recover_main_window(app),
            "hide" => request_frontend_hide(app),
            "quit" => request_frontend_quit(app),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| match event {
            TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            }
            | TrayIconEvent::DoubleClick {
                button: MouseButton::Left,
                ..
            } => recover_main_window(tray.app_handle()),
            _ => {}
        })
        .build(app)?;

    Ok(())
}

fn recover_main_window(app: &tauri::AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || recover_main_window_blocking(app));
}

fn recover_main_window_blocking(app: tauri::AppHandle) {
    let coordinator = app.state::<WindowLayerCoordinator>();
    let recovery_id = coordinator.begin_recovery();
    let (mode_session_id_at_start, mode_request_id_at_start) = coordinator.mode_request_snapshot();

    let first_attempt = recover_window_attempt(&app, recovery_id);
    if !matches!(first_attempt, Ok(Some(true))) && coordinator.is_current_recovery(recovery_id) {
        thread::sleep(RECOVERY_RETRY_DELAY);
        let _ = recover_window_attempt(&app, recovery_id);
    }

    if !coordinator.is_current_recovery(recovery_id) {
        return;
    }

    emit_recovery_request(
        &app,
        recovery_id,
        mode_session_id_at_start,
        mode_request_id_at_start,
    );
    schedule_recovery_ack_fallback(app, recovery_id);
}

fn recover_window_attempt(
    app: &tauri::AppHandle,
    recovery_id: u64,
) -> Result<Option<bool>, String> {
    let coordinator = app.state::<WindowLayerCoordinator>();
    let _guard = coordinator
        .gate
        .lock()
        .map_err(|_| "DeskTodo window layer coordinator is unavailable.".to_string())?;
    if !coordinator.is_current_recovery(recovery_id) {
        return Ok(None);
    }

    let window = app
        .get_webview_window(MAIN_WINDOW_LABEL)
        .ok_or_else(|| "DeskTodo main window is unavailable.".to_string())?;
    run_on_main_thread_and_wait(&window, move |window| {
        prepare_window_for_recovery(window);
        Ok(try_focus_recovered_window(window))
    })
    .map(Some)
}

fn emit_recovery_request(
    app: &tauri::AppHandle,
    recovery_id: u64,
    mode_session_id_at_start: Option<String>,
    mode_request_id_at_start: u64,
) {
    let coordinator = app.state::<WindowLayerCoordinator>();
    if !coordinator.is_current_recovery(recovery_id) {
        return;
    }

    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let payload = serde_json::json!({
            "recoveryId": recovery_id,
            "modeRequestIdAtStart": mode_request_id_at_start,
            "modeSessionIdAtStart": mode_session_id_at_start
        });
        if let Err(error) = window.emit("desktodo://recover-window", payload) {
            eprintln!("DeskTodo window recovery event failed: {error}");
        }
    }
}

fn schedule_recovery_ack_fallback(app: tauri::AppHandle, recovery_id: u64) {
    thread::spawn(move || {
        thread::sleep(RECOVERY_ACK_TIMEOUT);
        recovery_ack_fallback_blocking(app, recovery_id);
    });
}

fn recovery_ack_fallback_blocking(app: tauri::AppHandle, recovery_id: u64) {
    let coordinator = app.state::<WindowLayerCoordinator>();
    let Ok(_guard) = coordinator.gate.lock() else {
        return;
    };
    if !coordinator.is_current_recovery(recovery_id) {
        return;
    }

    let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        let _ = coordinator.complete_recovery(recovery_id);
        return;
    };
    let rollback_mode = coordinator.last_confirmed_mode();
    let fallback_result = run_on_main_thread_and_wait(&window, move |window| {
        apply_window_layer_with_rollback(window, WindowLayerMode::Normal, rollback_mode)?;
        reveal_window(window, true, rollback_mode)
    });
    if fallback_result.is_ok() {
        coordinator.record_confirmed_mode(WindowLayerMode::Normal);
    }
    let _ = coordinator.complete_recovery(recovery_id);
}

fn prepare_window_for_recovery(window: &tauri::WebviewWindow) {
    let _ = window.set_always_on_bottom(false);
    let _ = window.set_always_on_top(true);
    let _ = window.show();
    let _ = window.unminimize();
}

fn try_focus_recovered_window(window: &tauri::WebviewWindow) -> bool {
    force_windows_foreground(window);
    if !matches!(window.is_focused(), Ok(true)) {
        let _ = window.set_focus();
    }
    matches!(window.is_focused(), Ok(true))
}

#[cfg(windows)]
fn force_windows_foreground(window: &tauri::WebviewWindow) {
    let Ok(hwnd) = window.hwnd() else {
        return;
    };

    unsafe {
        let _ = ShowWindowAsync(hwnd, SW_RESTORE);
        let _ = SetWindowPos(
            hwnd,
            Some(HWND_TOPMOST),
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW,
        );
        let _ = BringWindowToTop(hwnd);
        let _ = SetForegroundWindow(hwnd);
    }
}

#[cfg(not(windows))]
fn force_windows_foreground(_window: &tauri::WebviewWindow) {}

fn begin_frontend_hide(app: &tauri::AppHandle) -> u64 {
    let coordinator = app.state::<WindowLayerCoordinator>();
    coordinator.cancel_recovery();
    let hide_id = coordinator.begin_hide();
    schedule_hide_fallback(app.clone(), hide_id);
    hide_id
}

fn request_frontend_hide(app: &tauri::AppHandle) {
    let hide_id = begin_frontend_hide(app);
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        if let Err(error) = window.emit(
            "desktodo://request-hide",
            serde_json::json!({ "hideId": hide_id }),
        ) {
            eprintln!("DeskTodo frontend hide request failed: {error}");
        }
    }
}

fn schedule_hide_fallback(app: tauri::AppHandle, hide_id: u64) {
    thread::spawn(move || {
        thread::sleep(HIDE_FLUSH_TIMEOUT);
        let _ = tauri::async_runtime::block_on(hide_main_window_for_request(app, hide_id));
    });
}

fn schedule_startup_reveal_fallback(app: &tauri::AppHandle) {
    let app = app.clone();
    thread::spawn(move || {
        thread::sleep(STARTUP_REVEAL_TIMEOUT);
        startup_reveal_fallback_blocking(app);
    });
}

fn startup_reveal_fallback_blocking(app: tauri::AppHandle) {
    let coordinator = app.state::<WindowLayerCoordinator>();
    if coordinator
        .startup_revealed
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return;
    }

    let Ok(_guard) = coordinator.gate.lock() else {
        return;
    };
    let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        return;
    };
    let rollback_mode = coordinator.last_confirmed_mode();
    let fallback_result = run_on_main_thread_and_wait(&window, move |window| {
        if matches!(window.is_visible(), Ok(true)) {
            return Ok(false);
        }
        apply_window_layer_with_rollback(window, WindowLayerMode::Normal, rollback_mode)?;
        reveal_window(window, true, rollback_mode)?;
        Ok(true)
    });
    if matches!(fallback_result, Ok(true)) {
        coordinator.record_confirmed_mode(WindowLayerMode::Normal);
    }
}

fn request_frontend_quit(app: &tauri::AppHandle) {
    let coordinator = app.state::<WindowLayerCoordinator>();
    coordinator.cancel_recovery();
    coordinator.cancel_hide();

    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();

        if window.emit("desktodo://request-quit", ()).is_ok() {
            let app = app.clone();
            thread::spawn(move || {
                thread::sleep(Duration::from_secs(5));
                if !SHOULD_QUIT.load(Ordering::SeqCst) {
                    eprintln!("DeskTodo quit flush timed out; exiting.");
                    finish_quit(&app);
                }
            });
            return;
        }
    }

    eprintln!("DeskTodo quit request could not reach frontend; exiting.");
    finish_quit(app);
}

#[tauri::command]
fn desktodo_quit(app: tauri::AppHandle) {
    finish_quit(&app);
}

#[tauri::command]
fn desktodo_store_file_status(app: tauri::AppHandle) -> String {
    let path = match app.path().app_data_dir() {
        Ok(dir) => dir.join("desktodo-state.json"),
        Err(error) => {
            eprintln!("DeskTodo Store path lookup failed: {error}");
            return "error".into();
        }
    };

    let contents = match fs::read_to_string(path) {
        Ok(contents) => contents,
        Err(error) if error.kind() == ErrorKind::NotFound => return "missing".into(),
        Err(error) => {
            eprintln!("DeskTodo Store file read failed: {error}");
            return "error".into();
        }
    };

    if serde_json::from_str::<serde_json::Value>(&contents).is_ok() {
        "present".into()
    } else {
        "invalid".into()
    }
}

fn finish_quit(app: &tauri::AppHandle) {
    SHOULD_QUIT.store(true, Ordering::SeqCst);
    let coordinator = app.state::<WindowLayerCoordinator>();
    coordinator.cancel_recovery();
    coordinator.cancel_hide();
    let _ = app.save_window_state(window_state_flags());
    app.exit(0);
}

fn window_state_flags() -> StateFlags {
    StateFlags::POSITION | StateFlags::SIZE
}

fn is_valid_renderer_session_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= MAX_RENDERER_SESSION_ID_LENGTH
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
}

#[cfg(test)]
mod tests {
    use super::WindowLayerCoordinator;

    #[test]
    fn renderer_session_replaces_old_request_sequence_after_reload() {
        let coordinator = WindowLayerCoordinator::default();

        coordinator
            .begin_renderer_session("renderer-one", 1)
            .unwrap();
        assert!(coordinator.register_mode_request("renderer-one", 2));
        coordinator
            .begin_renderer_session("renderer-two", 1)
            .unwrap();
        assert!(!coordinator.register_mode_request("renderer-one", 3));
        assert!(!coordinator.register_mode_request("renderer-two", 1));
        assert!(coordinator.register_mode_request("renderer-two", 2));
    }

    #[test]
    fn recovery_epoch_invalidates_stale_retry_and_ack() {
        let coordinator = WindowLayerCoordinator::default();

        let first = coordinator.begin_recovery();
        assert!(coordinator.is_current_recovery(first));
        let second = coordinator.begin_recovery();
        assert!(!coordinator.is_current_recovery(first));
        assert!(coordinator.complete_recovery(second));
        assert!(!coordinator.is_current_recovery(second));
    }

    #[test]
    fn stale_hide_ack_cannot_hide_after_new_reveal() {
        let coordinator = WindowLayerCoordinator::default();

        let hide_id = coordinator.begin_hide();
        assert!(coordinator.is_current_hide(hide_id));
        coordinator.begin_recovery();
        assert!(!coordinator.is_current_hide(hide_id));
    }
}
