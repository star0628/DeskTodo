# DeskTodo UI Phase 1 Baseline Report

Generated: 2026-07-13

## Scope

Phase 1 establishes a repeatable visual baseline and objective quality gates. It does not change product UI, interaction behavior, domain logic, persistence, or Tauri runtime behavior.

Changes in this phase are limited to:

- Playwright visual-test infrastructure and scripts.
- Deterministic schema-v4 test fixtures isolated from user data.
- Screenshot baselines and geometry/keyboard assertions.
- Fixture validation tests.
- Generated review metrics and contact-sheet tooling.

## Baseline Matrix

The checked-in baseline contains 21 screenshots:

| Group | Scenarios |
| --- | --- |
| Themes | Graphite Lime, CITIC Red, Frost Blue, Jade Forest, Ink Gold |
| Window sizes | 300x280 normal, 300x280 compact, 360x520 standard, 480x720 wide |
| Typography | 12px and 20px |
| Opacity | 10% and 40% over a deterministic high-contrast desktop backdrop |
| Content states | Empty, 24-task stress list, completed section collapsed, inline subtask entry |
| Overlays | Calendar, search, settings, recurrence, recurring-task deletion |

Snapshot directory: `tests/visual/__screenshots__/`

## Determinism Controls

- Browser locale: `zh-CN`.
- Time zone: `Asia/Shanghai`.
- Clock: fixed to `2026-07-13T09:00:00+08:00` before application startup.
- Storage: every test initializes its own valid schema-v4 state in localStorage.
- Fonts: waits for `document.fonts.ready` before capture.
- Animation and caret: disabled during screenshot comparison.
- Desktop background: injected only by the visual harness; production CSS is untouched.
- Execution: one worker, fixed viewport, fixed color scheme, fixed device scale factor.

## Automated Quality Gates

| Gate | Result | Evidence |
| --- | --- | --- |
| No horizontal overflow at 300x280 | PASS | document 300/300px; shell 298/298px client/scroll width |
| Parent task action columns align | PASS | important, recurrence, add and delete columns each have 0px variance |
| Stress content scrolls only in the task list | PASS | shell 518/518px; list 331/1302px; `overflow-y: auto` |
| Primary overlays fit inside 300x280 | PASS | calendar, search, settings, recurrence and delete dialog remain in viewport |
| Keyboard focus flow | PASS | quick add and dialogs retain visible keyboard navigation |
| Hover/focus does not change title x-position or width | PASS | measured x and width remain unchanged |
| Visual snapshots are stable | PASS | two consecutive full runs passed 30/30 with zero changed snapshots |
| Fixture schemas are valid and deterministic | PASS | all five fixtures and theme variants parse successfully |

Machine-readable metrics: `output/playwright/phase-1-geometry-metrics.json` (generated and ignored by Git).

## Findings

### P0 - Release-blocking

No P0 visual defects were found in the automated matrix or the native 100% DPI inspection.

### P1 - Important, schedule for a product UI phase

1. **Task-list right edge is inset by 8px.** Header actions, date/search, and quick add end at x=339px; task cards end at x=331px because of the list scrollbar gutter. The layout is stable but the shared right edge is not visually exact.
2. **Maximum-font title space is below the target.** At 20px font size in the narrow stress fixture, the smallest measured title area is 50.84px versus the 72px quality target. Truncation works, but scanning long titles becomes difficult.
3. **Task-title pointer target is 19px high.** Icon controls and checkbox hit areas pass the 24px audit, but the title button itself remains below the 24px target.
4. **10% background opacity has limited contrast on busy desktops.** The setting behaves as designed and includes a warning, but the test backdrop confirms that foreground readability can be materially reduced. A later UI phase should protect text/surface contrast without removing the user's opacity choice.

These findings are recorded only. Fixing them would change production UI and is intentionally outside Phase 1.

### P2 - Polish candidates

- Reassess visual weight consistency between header controls and task-row actions.
- Reduce perceived border density where multiple translucent surfaces meet.

These are review notes, not regressions and not Phase 1 implementation work.

## Native Windows Inspection

The existing release executable was inspected in a real Tauri/WebView2 window without changing Todo data or settings.

| Environment | Result |
| --- | --- |
| Windows system DPI 96 / 100% scaling | PASS: no obvious white edge, black edge, overlap, or clipped primary control |
| 125% scaling | NOT VERIFIED: no active 125% Windows session was available |
| 150% scaling | NOT VERIFIED: no active 150% Windows session was available |

Changing the user's system display scale would disturb the active desktop and may require sign-out. Browser device scaling is not reported as native Windows DPI evidence. The 125% and 150% rows must be checked in real sessions before claiming full DPI coverage.

## Commands

```powershell
npm run test:ui:update  # intentional baseline regeneration only
npm run test:ui         # normal visual and geometry gate
npm run test:ui:report  # inspect Playwright HTML report
./tests/visual/createContactSheets.ps1
```

## Final Verification

| Command | Result |
| --- | --- |
| `npm ci` | PASS: 133 packages installed from lockfile; 0 vulnerabilities |
| `npm run typecheck` | PASS |
| `npm test` | PASS: 25 files / 197 tests |
| `npm run test:ui` | PASS: 30 tests, including 21 screenshot comparisons |
| `npm run build` | PASS: Vite 8.1.3 production build |
| `npm audit` | PASS: 0 vulnerabilities |
| `npm run tauri info` | PASS: MSVC, WebView2 150.0.4078.65, Rust 1.96.1 and Cargo 1.96.1 detected |
| `npm run tauri build` | PASS: release executable built successfully |

An existing calendar unit test was made independent of the machine's real date by locating the selected day through its `已选择` accessible label. No component implementation changed.

## Phase 1 Exit State

- Baseline infrastructure: complete.
- 21 checked-in visual references: complete.
- Automated geometry and keyboard gates: complete.
- Native 100% DPI inspection: complete.
- Native 125% and 150% DPI inspection: pending an appropriate Windows display session.
- Production UI/source changes: none.
