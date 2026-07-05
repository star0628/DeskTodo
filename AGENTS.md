# DeskTodo Engineering Rules

- Do not add cloud sync, login, AI, Pomodoro, time tracking, projects, tags, natural language scheduling, notifications, startup launch, drag sorting, auto edge hide, analytics, or complex themes unless explicitly requested.
- Todo state changes must go through `src/domain/todoReducer.ts`.
- React components must not directly mutate `tasks` or nested `children` arrays.
- Persistence must go through the repository layer in `src/persistence`.
- Do not call Tauri Store or localStorage directly from React components.
- Keep app state schema validation centralized in `src/persistence/appStateSchema.ts`.
- Hydration must not trigger persistence writes by itself.
- Invalid or unreadable persisted data must not be overwritten until a real user Todo mutation occurs.
- Real Todo mutations should be saved promptly; avoid debounce unless every hide, close, and quit path can flush reliably.
- Tray Quit must route through the frontend flush path before calling the Rust quit command, with a Rust fallback so the user can still exit.
- Window layer mode must stay minimal: top, normal, and best-effort bottom only.
- Rust window show/recovery paths must not silently change the persisted window layer mode; UI, Store, and native z-order should stay consistent.
- Do not implement WorkerW, Progman, SetParent desktop embedding, or auto edge hiding.
- Prefer stability and data safety over feature count.
- New reducer behavior must include Vitest coverage.
- Keep the UI in a compact desktop widget style.
- Avoid complex dependencies and UI component libraries.
