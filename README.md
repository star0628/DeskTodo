# DeskTodo

DeskTodo is a Windows-first minimal desktop Todo widget. It is intentionally small: a frameless translucent desktop checklist with local persistence, tray behavior, and stable core task interactions.

## Tech Stack

- Tauri 2
- React
- TypeScript
- Vite
- Plain CSS
- Vitest
- Tauri Store
- Tauri window-state
- Tauri single-instance

## Development

```bash
npm ci
npm run dev
npm run tauri dev
```

`npm run dev` starts the browser fallback at `http://127.0.0.1:1420/`. In browser mode, persistence falls back to localStorage because Tauri Store is unavailable.

Windows native development requires:

- Rust and Cargo on `PATH`
- Microsoft C++ Build Tools with Desktop development with C++
- Microsoft Edge WebView2 Runtime

## Tests

```bash
npm run typecheck
npm test
```

## Build

```bash
npm run build
npm run tauri build
```

`npm run tauri build` is the required native desktop validation command. A browser-only run is not enough to validate tray, close-to-tray, single-instance, Store, or window-state behavior.

## Implemented

- Frameless transparent always-on-top Tauri widget window.
- Dark translucent UI with rounded corners and a scrollable task list.
- Add, edit, toggle, and delete parent tasks.
- Add, edit, toggle, and delete one-level subtasks.
- Parent subtask progress display.
- Pure reducer no-op handling for missing task ids.
- Tauri Store persistence through a repository layer.
- localStorage fallback for browser development and unit tests.
- Safe schema parsing with fallback for missing, broken, mismatched, or nested child data.
- Async hydration that does not auto-overwrite missing or invalid persisted data.
- Immediate saves after real Todo state changes to avoid fast-exit data loss.
- System tray with show, hide, and quit menu items.
- Close-to-tray behavior.
- Tray quit asks the frontend to flush Todo Store writes before the Rust process exits.
- Single-instance wake-up behavior.
- Window position and size persistence.
- Header window controls for hide and close-to-tray.
- Header window layer control: top, normal, and desktop/bottom modes.
- The window is skipped from the taskbar by default and is recovered through the tray or by launching the app again.
- Reducer, selector, and persistence tests.

## Known Limitations

- No cloud sync.
- No account login.
- No notification reminders.
- No Pomodoro.
- No time tracking.
- No projects.
- No tags.
- No natural language date parsing.
- No drag sorting.
- No startup launch.
- No auto edge hide.

If Tauri Store fails to load, DeskTodo falls back to the default empty state and logs a warning. If a save fails, the app stays open and logs a warning; the write should be treated as failed.

In Tauri, DeskTodo persists data through Tauri Store. In browser development and tests, it uses the repository-compatible localStorage fallback. Hydration never writes the default empty state back to storage by itself; after invalid data is detected, a clean state is saved only after the user makes a real Todo change.

Window layer modes:

- Top: uses Tauri `setAlwaysOnTop(true)` and keeps the widget above normal windows.
- Normal: clears top and bottom z-order flags while keeping the widget tray-first and skipped from the taskbar.
- Desktop: uses Tauri `setAlwaysOnBottom(true)` as a best-effort desktop sticker mode. It is not a WorkerW/Progman desktop embedding and can sit behind active windows on Windows. The tray Show item and second launch request the window to show/focus and then reapply the selected layer mode, so UI, Store, and native window state stay consistent. If Windows keeps the bottom window covered by other apps, clear the covering window or switch DeskTodo back to Top once it is visible.

Tray interaction is intentionally conservative: use the right-click tray menu for Show, Hide, and Quit. Left-click tray toggling is disabled to avoid platform-specific behavior.

Transparent windows can depend on the local Windows compositor, GPU driver, and WebView2 behavior. The code is configured for the target widget style, but a development machine with transparency limitations may render the window background differently.
