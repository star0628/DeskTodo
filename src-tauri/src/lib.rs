use std::{
    fs,
    io::ErrorKind,
    sync::atomic::{AtomicBool, Ordering},
    thread,
    time::Duration,
};

use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Emitter, Manager, WindowEvent,
};
use tauri_plugin_window_state::{AppHandleExt, StateFlags};

static SHOULD_QUIT: AtomicBool = AtomicBool::new(false);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main_window(app);
        }))
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(window_state_flags())
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            desktodo_quit,
            desktodo_store_file_status
        ])
        .setup(|app| {
            build_tray(app)?;
            show_main_window(app.handle());
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if !SHOULD_QUIT.load(Ordering::SeqCst) {
                    api.prevent_close();
                    let _ = window.app_handle().save_window_state(window_state_flags());
                    let _ = window.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running DeskTodo");
}

fn build_tray(app: &mut tauri::App) -> tauri::Result<()> {
    let show_item = MenuItem::with_id(app, "show", "显示 DeskTodo", true, None::<&str>)?;
    let hide_item = MenuItem::with_id(app, "hide", "隐藏 DeskTodo", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_item, &hide_item, &quit_item])?;
    let icon = Image::from_bytes(include_bytes!("../icons/icon.png"))?;

    TrayIconBuilder::new()
        .tooltip("DeskTodo")
        .icon(icon)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main_window(app),
            "hide" => hide_main_window(app),
            "quit" => request_frontend_quit(app),
            _ => {}
        })
        .build(app)?;

    Ok(())
}

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        let _ = window.emit("desktodo://reapply-window-layer", ());
    }
}

fn hide_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = app.save_window_state(window_state_flags());
        let _ = window.hide();
    }
}

fn request_frontend_quit(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
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
    let _ = app.save_window_state(window_state_flags());
    app.exit(0);
}

fn window_state_flags() -> StateFlags {
    StateFlags::POSITION | StateFlags::SIZE
}
