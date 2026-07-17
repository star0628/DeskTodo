<p align="right">
  <a href="./README.md">简体中文</a> · <strong>English</strong>
</p>

# DeskTodo

[![CI](https://github.com/star0628/DeskTodo/actions/workflows/ci.yml/badge.svg)](https://github.com/star0628/DeskTodo/actions/workflows/ci.yml)
[![Latest Release](https://img.shields.io/github/v/release/star0628/DeskTodo?label=Latest%20Release)](https://github.com/star0628/DeskTodo/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

DeskTodo is a Windows-first minimal desktop Todo widget. It is intentionally small: a frameless translucent desktop checklist with local persistence, tray behavior, and stable core task interactions.

The current release is v0.4.0. The validated `v0.1.0-personal-release` tag remains frozen as the personal release baseline.

## Download and Install

> Supports 64-bit Windows 10 and Windows 11.

[**Download the latest Windows installer**](https://github.com/star0628/DeskTodo/releases/latest)

1. Open the download page above and select `DeskTodo_x.x.x_x64-setup.exe` under **Assets**.
2. Do not download GitHub's generated `Source code.zip` or `Source code.tar.gz`; those archives contain source code, not the installer.
3. Run the installer and follow the current-user installation prompts. Administrator privileges are normally not required.
4. Start DeskTodo from the Windows Start menu after installation.
5. The window close button sends DeskTodo to the tray. Left-click the tray icon to restore it, or use the right-click menu to show, hide, or quit.

DeskTodo installers are not currently commercially code-signed, so Microsoft Defender SmartScreen may display a warning. Download only from this repository's Releases page and verify the installer against `SHA256SUMS.txt` from the same release. If Microsoft Edge WebView2 Runtime is not already installed, setup may need an internet connection to obtain it.

### Upgrade, Data, and Uninstall

- Upgrade: download and run the newer installer. Back up the data file before a production upgrade.
- Data file: `%APPDATA%\com.desktodo.desktop\desktodo-state.json`.
- Uninstall: open Windows Settings → Apps → Installed apps → DeskTodo → Uninstall.
- Source contributors can continue with Development below; regular users do not need Node.js, Rust, or Cargo.

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
- Tauri autostart
- Tauri dialog and file-system plugins

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
npx playwright install chromium
npm run test:ui
```

Vitest covers domain, persistence, settings, and component behavior. Playwright visual regression tests run locally on Windows because compositor and font differences make pixel snapshots unsuitable as a cross-platform required check.

## Build

```bash
npm run build
npm run tauri build
```

`npm run tauri build` is the required native desktop validation command. A browser-only run is not enough to validate tray, close-to-tray, single-instance, Store, or window-state behavior.

Unsigned Windows builds may trigger a Microsoft Defender SmartScreen warning. Release binaries should be downloaded only from this repository's GitHub Releases page and verified against the published SHA256 checksum.

## Privacy and Data

DeskTodo is local-first. It has no account system, analytics, telemetry, cloud sync, or application-managed network service. In the Tauri application, task data is stored by Tauri Store at:

```text
%APPDATA%\com.desktodo.desktop\desktodo-state.json
```

Browser development uses localStorage instead. Do not attach a real Store file to a public issue because task titles may contain private information.

## Implemented

- Frameless transparent always-on-top Tauri widget window.
- Dark translucent UI with rounded corners and a scrollable task list.
- Deterministic app typography: Arial for Latin text and SimHei for Chinese text, with SVG icons instead of icon fonts.
- Compact Header settings dialog with five fixed accessible palettes plus a three-color custom theme: Graphite Lime, Red Frost White, Frost Blue, Jade Forest, Ink Gold, and Custom.
- App-native color picker with live preview, opaque HEX input, cancel/confirm behavior, and automatic readable semantic-token generation.
- Interface font size control from 12px to 20px with synchronized slider and numeric input.
- Background opacity control from 10% to 100% with live preview and a low-readability warning below 40%.
- Compact density mode and a preference to collapse the completed section by default.
- Optional Windows startup launch through the official Tauri autostart plugin.
- Add, edit, toggle, and delete parent tasks.
- Add, edit, toggle, and delete one-level subtasks.
- Press and hold a task row to drag-sort it while surrounding tasks move smoothly out of the way.
- Mark unfinished parent tasks as important; important work is derived to the top without rewriting stored task order.
- Search current and historical parent/subtask titles with Chinese, English, full-width text, and emoji matching. `Ctrl+F` opens search.
- Repeat parent tasks every day, on workdays, or on selected weekdays, including copied one-level subtasks.
- Set a local deadline on a parent task through the same compact time-arrangement control used for recurrence.
- Choose per task between a calm countdown and an explicit local deadline label such as `今天 22:00`, `明天 22:00`, or `7月16日 22:00`.
- In countdown mode, switch to stable `MM:SS` updates only inside the final 30 minutes.
- Carry both the local clock-time deadline pattern and its display mode into future recurring occurrences.
- Repeating work keeps at most one unfinished occurrence and creates only the latest due occurrence after time away, avoiding backlog floods.
- Deleting a repeating occurrence can skip only that occurrence or stop the whole series.
- Parent subtask progress display.
- A focused Today view containing all unfinished work plus tasks completed today.
- Automatic removal of older completed work from the Today view without deleting history.
- Previous-day navigation and a compact dark Chinese calendar for reviewing daily completion history.
- Calendar completion dots with accessible per-day completion counts.
- Fully completed work grouped in a collapsible section below active work.
- Eight-second undo for parent-task, subtask, and confirmed historical-record deletion.
- `Ctrl+N` focuses Quick Add on Today when no editor or calendar is active.
- `Ctrl+Z` restores the pending deletion when focus is outside an editor.
- A compact derived completion line under the header progress count.
- Focus follows tasks moved between active and completed groups and returns to an item restored by undo.
- Short compositor-friendly UI feedback that respects the Windows reduced-motion preference.
- Historical completion lists with parent context and an explicit selection mode for confirmed cleanup.
- Versioned UTF-8 completion-history export with an inclusive local-date range and native Save dialog.
- Validated completion-history import with preview, duplicate/conflict skipping, and per-import undo.
- Browser export/import fallback through Blob downloads and local file selection.
- Local-midnight, window-focus, and visibility refresh so the Today view rolls over after sleep or tray use.
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

## Daily History

DeskTodo records both the exact completion timestamp and the local calendar date when a task or subtask is checked. The Today view is derived rather than destructively cleaned: unfinished work remains visible across days, work completed today stays visible until the local day changes, and older completed work remains available from the date navigator.

Historical dates remain read-only during normal review. Quick Add and editing controls are available only on Today. When cleanup is required, `选择` enters a dedicated selection mode; deletion requires a second confirmation, reports any child records affected on other dates, and can be undone for eight seconds. A completed parent that still contains unfinished children is protected from historical deletion. Deadlines belong to Today tasks and do not turn historical completion views into editable schedules.

The calendar is keyboard accessible, uses Monday as the first day of the week, and prevents future-date selection. A dot under a date means at least one parent task or subtask was completed on that date; its accessible day label includes the exact count. Today keeps active work above a collapsible completed section. A completed parent with an unfinished child remains in the active area so open work is never hidden.

State schema v8 contains live tasks, imported completion snapshots, visual settings, custom theme seeds, importance, recurrence series, optional deadlines, and each task's deadline display mode. Valid v1-v7 data is migrated in memory; the first subsequent save preserves the original state under the matching versioned backup key before writing schema v8. Existing v6 deadlines migrate to countdown mode, preserving their exact timestamp and current visual behavior. Because v0.1.0 did not store a dedicated completion timestamp, already-completed v1 tasks use their last `updatedAt` value as a best-effort historical completion time. New v0.2 completions are recorded exactly.

## Importance, Search, and Recurrence

Important is intentionally a parent-task flag rather than a separate priority system. In Today, unfinished important parents appear before regular unfinished parents; completed work remains in the completed section at the bottom. Stored array order is not mutated by this display rule.

Search is local and read-only. It scans parent and one-level child titles in the current Store state, supports NFKC normalization and case-insensitive Latin matching, and can jump to the matching Today row or historical completion date. It does not add indexing, analytics, or cloud services.

Repeating tasks use a small recurrence-series model rather than cloning an unlimited schedule in advance. Supported rules are daily, Monday-to-Friday workdays, and selected weekdays. DeskTodo keeps at most one unfinished occurrence per series; after the app has been closed for several occurrence dates, it creates the latest due occurrence only. A future occurrence copies the latest saved parent title, importance flag, child titles, relative deadline clock time, and deadline display mode while resetting all completion state.

Deadlines are stored as canonical ISO timestamps and edited as the user's Windows local date and time. The Time Arrangement dialog provides a per-task `倒计时 / 截止时间` choice. Countdown mode remains minute-granular outside the last 30 minutes and updates once per second below that threshold. Deadline-time mode shows `今天`, `明天`, a same-year month/day, or a full cross-year date; overdue work keeps an explicit `已逾期` marker instead of relying on color alone. DeskTodo recomputes from the system clock after focus and visibility changes instead of counting timer ticks, so sleep and tray time do not accumulate drift. Deadlines remain visual metadata only and do not send notifications or reminders.

## Settings

Open the small gear button in the Header. Settings apply immediately and are persisted through the same reducer and repository path as the rest of the app state.

- Theme: five fixed palettes plus Custom. The red-and-white palette is named Red Frost White (`赤霞霜白`); its stored compatibility id remains `citic-red` so existing user data does not break.
- Custom theme: Window Canvas, Content Surface, and Accent colors accept opaque `#RRGGBB` values. Dragging previews locally; Confirm saves once through the reducer. Derived text, focus, border, and control colors are contrast-corrected automatically, while background opacity remains a separate setting.
- Font size: 12–20px in one-pixel steps. Both the slider and numeric input update the same reducer setting.
- Background opacity: 10–100%. Dragging previews locally; releasing or committing the field saves one validated reducer setting. Very low values can reduce readability against bright wallpaper.
- Compact mode: reduces spacing and row height without changing task data.
- Completed section: controls whether completed work starts collapsed in the Today view.
- Startup launch: reads and changes the actual operating-system registration using Tauri autostart. It is disabled in browser development because no desktop registration exists there.

### Completion Record Transfer

The Data section exports completed parent tasks and subtasks for an inclusive local-date range. The generated `.desktodo.txt` file is pretty-printed UTF-8 JSON: it remains readable in a text editor while retaining a versioned structure suitable for strict import validation. Exact timestamps use ISO/RFC 3339 strings, while `completedOn` preserves the source device's local completion date.

Import is intentionally limited to completion history. It does not recreate unfinished work, activate recurrence series, or overwrite themes and other settings. The app parses and validates the whole file before showing a preview; malformed or unsupported files leave Store data unchanged. Re-importing the same records is idempotent, and records with the same source identity but different content are reported as conflicts and skipped.

DeskTodo currently records task creation time and completion time, not a true work-session start time. Exports therefore label these fields as creation and completion; they must not be interpreted as measured working duration.

Validate startup launch against an installed or fixed-path release executable. A development binary can move or be replaced, which makes it a poor target for a persistent Windows startup entry. DeskTodo does not start hidden; the existing single-instance behavior prevents a second window if the user launches it again manually.

## Typography

DeskTodo-owned Latin text, numbers, and Western punctuation use the locally installed Arial family. Chinese text and CJK punctuation use the locally installed SimHei family. Form controls, dialogs, and the calendar inherit the same `DeskTodo UI` font policy. Interface icons are SVGs and do not depend on an icon font.

SimHei is a Windows Simplified Chinese supplemental font. The target Windows installation must have Arial and SimHei available; DeskTodo does not redistribute Microsoft font files. User-authored emoji, rare ideographs, or symbols missing from both families may use a Windows fallback font so that task content remains readable. This is the only intentional font fallback exception.

## Known Limitations

- No cloud sync.
- No account login.
- No notification reminders.
- No Pomodoro.
- No time tracking.
- Completion-history transfer is not a full disaster-recovery backup for unfinished tasks, active recurrence, or settings.
- No projects.
- No tags.
- No natural language date parsing.
- No auto edge hide.
- No reminder notification when a deadline arrives; deadlines are in-widget visual metadata only.

If Tauri Store fails to load, DeskTodo falls back to the default empty state and logs a warning. If a save fails, the app stays open and logs a warning; the write should be treated as failed.

In Tauri, DeskTodo persists data through Tauri Store. In browser development and tests, it uses the repository-compatible localStorage fallback. Hydration never writes the default empty state back to storage by itself; after invalid data is detected, a clean state is saved only after the user makes a real Todo change.

Window layer modes:

- Top: uses Tauri `setAlwaysOnTop(true)` and keeps the widget above normal windows.
- Normal: clears top and bottom z-order flags while keeping the widget tray-first and skipped from the taskbar.
- Desktop: uses Tauri `setAlwaysOnBottom(true)` as a best-effort desktop sticker mode. It is not a WorkerW/Progman desktop embedding and can sit behind active windows or the Windows desktop surface. To keep the widget recoverable after Show Desktop, the tray Show action, tray left-click, and a second launch temporarily raise the native window; if the saved mode was Desktop, DeskTodo explicitly changes it to Normal and saves that change so the control, Store, and native z-order remain consistent.

Tray interaction supports left-click to show the widget. The right-click menu remains available for Show, Hide, and Quit.

Transparent windows can depend on the local Windows compositor, GPU driver, and WebView2 behavior. The code is configured for the target widget style, but a development machine with transparency limitations may render the window background differently.

## Contributing

Bug reports and focused pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before making changes. Security vulnerabilities must follow [SECURITY.md](SECURITY.md) and must not be posted as public issues.

## License

DeskTodo source code is licensed under the [MIT License](LICENSE). Third-party libraries remain subject to their own licenses; direct runtime dependency notices are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
