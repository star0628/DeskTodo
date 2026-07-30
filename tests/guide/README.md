# User-guide capture harness

This folder renders deterministic documentation-only scenes from the real DeskTodo components. It does not load Tauri Store, localStorage, Windows Credential Manager, or a user's Apple Calendar URL.

## Files

- `user-guide-harness.html` / `userGuideHarness.tsx`: interactive component scenes with fixed date and fixture state.
- `user-guide-board.html` / `userGuideBoard.ts`: annotated boards assembled from the raw scene captures.
- `vite.guide.config.ts`: isolated Vite cache and port for worktrees whose `node_modules` may be a junction.

The production app, visual regression fixtures, and visual baselines are not modified by this harness.

## Capture workflow

1. Start the guide server:

   ```powershell
   node_modules\.bin\vite.cmd --config tests\guide\vite.guide.config.ts --configLoader runner
   ```

2. Open the component scene with Playwright CLI:

   ```powershell
   npx --yes --package @playwright/cli playwright-cli -s=deskguide open "http://127.0.0.1:1422/tests/guide/user-guide-harness.html?scene=app" --browser msedge --headed
   ```

3. Capture raw interaction states into:

   ```text
   output/playwright/user-guide/raw/
   ```

4. Open each `user-guide-board.html?board=<name>` page at `1400 × 920` and save the final PNG into:

   ```text
   docs/images/user-guide/
   ```

5. Visually inspect every final PNG, then run typecheck, unit tests, the production build, and the existing Playwright visual suite. Never update the existing visual baselines as part of documentation capture.

Only use synthetic fixture content or a public Apple-owned holiday feed. Never paste a real private published-calendar link into the harness, screenshots, source code, or committed documentation.
