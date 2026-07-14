# Contributing to DeskTodo

DeskTodo is a focused Windows desktop Todo widget. Contributions should improve reliability, accessibility, maintainability, or the existing compact workflow without turning the project into a general-purpose task management platform.

## Before You Start

- Search existing issues before opening a new one.
- Open an issue before starting a large behavioral change.
- Keep pull requests focused and avoid unrelated refactors.
- Never include personal Store data, credentials, generated binaries, or build output.

## Windows Prerequisites

- Node.js and npm
- Rust and Cargo
- Microsoft C++ Build Tools with Desktop development with C++
- Microsoft Edge WebView2 Runtime

## Development

```powershell
npm ci
npm run dev
npm run tauri dev
```

Browser mode is useful for UI work, but native behavior must be validated in a Tauri window.

## Required Checks

Run these commands before opening a pull request:

```powershell
npm run typecheck
npm test
npm run build
npm audit
npm run tauri build
```

For visual changes, also run:

```powershell
npx playwright install chromium
npm run test:ui
```

## Architecture Rules

- Todo state changes must go through `src/domain/todoReducer.ts`.
- React components must not mutate tasks or child arrays.
- Persistence must go through the repository layer under `src/persistence`.
- Components must not call Tauri Store or localStorage directly.
- Schema changes require validation, migration, rollback protection, and tests.
- New reducer behavior requires Vitest coverage.
- Browser fallback must remain functional for frontend development.
- Native tray, Store, window-state, single-instance, and autostart behavior must be tested on Windows.

See `AGENTS.md` for the complete engineering constraints.

## Pull Requests

Describe what changed, why it changed, user impact, migration impact, and the commands used for validation. Screenshots should contain only synthetic task data and must not expose personal desktop content.
