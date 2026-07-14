# DeskTodo UI Phase 2 Token Report

## Scope

Phase 2 standardizes the existing UI without changing Todo behavior, persistence, settings semantics, or the Tauri shell. The work is limited to design tokens, component CSS, accessibility adaptations, and regression coverage.

## Token Architecture

The CSS contract now has three explicit layers in `src/styles/tokens.css`:

1. Foundation tokens define spacing, strokes, radii, control sizes, row sizes, typography, and motion.
2. Semantic tokens expose component-facing roles such as `--surface-row`, `--text-secondary`, `--border-subtle`, and `--focus-ring`.
3. Theme tokens contain only the values needed by the five color themes. Theme blocks do not contain layout, typography, or motion declarations.

Key geometry values:

| Role | Value |
| --- | ---: |
| Standard control | 32px |
| Compact control | 28px |
| Minimum pointer target | 24px |
| Standard task row | 44px |
| Compact task row | 36px |
| Icon | 16px |
| Window radius | 20px |
| Popup radius | 10px |
| Card/control radius | 8px |
| Fast motion | 100ms |
| Normal motion | 160ms |

The spacing scale is 4/8/12/16/20/24/32px. Values of 2/6/10px are reserved for documented optical adjustments rather than general layout.

## Component Migration

- `globals.css` consumes semantic color roles only. It contains no color literals, legacy `--color-*` values, or theme-private `--theme-*` references.
- Standard controls use 32px geometry; compact and task-row actions use 28px geometry.
- At the 300px minimum window width, task actions use the explicit 24px minimum target width so titles retain useful space without hiding actions.
- Task titles have a minimum 24px pointer height.
- Task cards compensate for the stable 8px scrollbar gutter, aligning their right edge with the header, date/search row, and quick-add field.
- Background opacity is applied only through `--surface-canvas`. Foreground text, icons, and controls retain full opacity.

## Accessibility Adaptations

- `prefers-reduced-motion: reduce` sets the motion tokens to 0ms and removes the active-button translation.
- `forced-colors: active` uses Windows system colors, removes decorative shadows and blur, and preserves visible focus outlines.
- Focus styling uses a 2px semantic focus ring.
- All pointer targets visible in the standard fixture are at least 24 by 24px.

## Automated Evidence

The Phase 2 Playwright geometry run records:

| Check | Result |
| --- | ---: |
| Horizontal overflow at 300x280 / 20px font | 0px |
| Common right-edge maximum delta | 0px |
| Parent action-column maximum delta | 0px |
| Visible targets below 24px | 0 |
| Narrowest parent title at 300px / 20px font | 72.61px |
| Primary overlays outside 300x280 viewport | 0 |

Machine-readable metrics are written to `output/playwright/phase-2-geometry-metrics.json` by the test run.

Visual baselines cover all five themes, 300x280 and 480x720 layouts, 12px and 20px typography, 10% and 40% canvas opacity, Windows forced colors, empty/stress/completed states, and all primary overlays.

## Guardrails

`src/styles/tokens.contract.test.ts` and `src/styles/themes.test.ts` prevent the following regressions:

- missing foundation or semantic roles;
- component CSS reaching into theme-private values;
- reintroduction of legacy tokens or direct color literals;
- geometry or typography declarations inside theme overrides;
- raw component radius or motion values replacing the approved tokens;
- root/shell opacity reducing foreground clarity;
- loss of reduced-motion or forced-colors adaptations;
- theme text contrast falling below the tested WCAG thresholds.

## Deliberate Non-Changes

Phase 2 does not add features, alter Todo data, redesign the information architecture, change theme choices, or introduce a UI library or token build pipeline.
