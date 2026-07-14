import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { THEME_OPTIONS } from "../settings/themeCatalog";

const tokensCss = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");
const builtInThemes = THEME_OPTIONS.filter((theme) => theme.id !== "custom");

const requiredThemeTokens = [
  "--theme-canvas-rgb",
  "--theme-surface-row",
  "--theme-surface-row-hover",
  "--theme-surface-control",
  "--theme-surface-input",
  "--theme-surface-raised",
  "--theme-surface-popup",
  "--theme-surface-scrim",
  "--theme-border-subtle",
  "--theme-border-strong",
  "--theme-text-primary",
  "--theme-text-secondary",
  "--theme-text-tertiary",
  "--theme-accent-primary",
  "--theme-text-on-accent",
  "--theme-text-danger",
  "--theme-focus-ring",
  "--theme-accent-ring",
  "--theme-accent-halo",
  "--theme-progress-track",
  "--theme-scrollbar-thumb",
  "--theme-calendar-dot-selected",
  "--theme-deadline-soon",
  "--theme-deadline-critical",
  "--theme-deadline-overdue",
  "--theme-shadow-window",
  "--theme-shadow-popup"
] as const;

describe("DeskTodo theme tokens", () => {
  it("defines five static themes plus one generated custom theme", () => {
    expect(THEME_OPTIONS).toHaveLength(6);
    expect(new Set(THEME_OPTIONS.map((theme) => theme.id)).size).toBe(6);
    expect(THEME_OPTIONS[THEME_OPTIONS.length - 1]?.id).toBe("custom");

    for (const theme of builtInThemes) {
      const block = getThemeBlock(theme.id);
      for (const token of requiredThemeTokens) {
        expect(getDeclaration(block, token), `${theme.id} is missing ${token}`).not.toBeNull();
      }
    }
  });

  it("keeps layout, typography, and motion declarations out of theme overrides", () => {
    for (const theme of builtInThemes) {
      const block = getThemeBlock(theme.id);
      expect(block).not.toMatch(
        /--(?:space|size|radius|motion|ease|type|font|line-height|stroke|layout)-/
      );
    }
  });

  it("keeps text roles at WCAG AA contrast against each theme base", () => {
    for (const theme of builtInThemes) {
      const block = getThemeBlock(theme.id);
      const base = theme.swatches[0];

      expect(contrast(base, getHexToken(block, "--theme-text-primary"))).toBeGreaterThanOrEqual(
        4.5
      );
      expect(
        contrast(base, getHexToken(block, "--theme-text-secondary"))
      ).toBeGreaterThanOrEqual(4.5);
      expect(contrast(base, getHexToken(block, "--theme-text-tertiary"))).toBeGreaterThanOrEqual(
        4.5
      );
      expect(contrast(base, getHexToken(block, "--theme-accent-primary"))).toBeGreaterThanOrEqual(
        3
      );
      expect(
        contrast(
          getHexToken(block, "--theme-accent-primary"),
          getHexToken(block, "--theme-text-on-accent")
        )
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps text readable on the actual composited row, input, and popup surfaces", () => {
    for (const theme of builtInThemes) {
      const block = getThemeBlock(theme.id);
      const canvas = parseCanvas(getDeclaration(block, "--theme-canvas-rgb"));
      const textColors = [
        parseColor(getDeclaration(block, "--theme-text-primary")),
        parseColor(getDeclaration(block, "--theme-text-secondary")),
        parseColor(getDeclaration(block, "--theme-text-tertiary"))
      ];

      for (const surfaceToken of [
        "--theme-surface-row",
        "--theme-surface-input",
        "--theme-surface-popup"
      ]) {
        const surface = composite(parseColor(getDeclaration(block, surfaceToken)), canvas);
        for (const textColor of textColors) {
          expect(
            contrastRgb(surface, textColor),
            `${theme.id} ${surfaceToken} text contrast`
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it("keeps focus and selected accents perceptible without relying on subtle borders", () => {
    for (const theme of builtInThemes) {
      const block = getThemeBlock(theme.id);
      const canvas = parseCanvas(getDeclaration(block, "--theme-canvas-rgb"));
      const focus = parseColor(getDeclaration(block, "--theme-focus-ring"));
      const accent = parseColor(getDeclaration(block, "--theme-accent-primary"));
      expect(contrastRgb(canvas, focus), `${theme.id} focus ring`).toBeGreaterThanOrEqual(3);
      expect(contrastRgb(canvas, accent), `${theme.id} selected accent`).toBeGreaterThanOrEqual(3);
    }
  });
});

function getThemeBlock(themeId: string): string {
  const pattern = new RegExp(`\\.app-shell\\[data-theme="${themeId}"\\]\\s*\\{([\\s\\S]*?)\\}`);
  const match = tokensCss.match(pattern);
  expect(match, `missing CSS block for ${themeId}`).not.toBeNull();
  return match?.[1] ?? "";
}

function getDeclaration(block: string, token: string): string | null {
  return block.match(new RegExp(`^\\s*${token}:\\s*([^;]+);`, "m"))?.[1]?.trim() ?? null;
}

function getHexToken(block: string, token: string): string {
  const value = getDeclaration(block, token);
  expect(value, `missing token ${token}`).toMatch(/^#[0-9a-f]{6}$/i);
  return value ?? "#000000";
}

function contrast(first: string, second: string): number {
  const light = Math.max(luminance(first), luminance(second));
  const dark = Math.min(luminance(first), luminance(second));
  return (light + 0.05) / (dark + 0.05);
}

function luminance(hex: string): number {
  const channels =
    hex
      .slice(1)
      .match(/.{2}/g)
      ?.map((channel) => Number.parseInt(channel, 16) / 255) ?? [0, 0, 0];
  const linear = channels.map((value) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  );
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

type Rgba = [number, number, number, number];

function parseCanvas(value: string | null): Rgba {
  expect(value, "missing canvas RGB").toMatch(/^\d+\s+\d+\s+\d+$/);
  const channels = (value ?? "0 0 0").split(/\s+/).map(Number);
  return [channels[0], channels[1], channels[2], 1];
}

function parseColor(value: string | null): Rgba {
  expect(value, "missing color").not.toBeNull();
  if (value?.startsWith("#")) {
    const channels = value.slice(1).match(/.{2}/g)?.map((channel) => Number.parseInt(channel, 16));
    return [channels?.[0] ?? 0, channels?.[1] ?? 0, channels?.[2] ?? 0, 1];
  }

  const match = value?.match(
    /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/
  );
  expect(match, `unsupported color ${value}`).not.toBeNull();
  return [Number(match?.[1]), Number(match?.[2]), Number(match?.[3]), Number(match?.[4] ?? 1)];
}

function composite(foreground: Rgba, background: Rgba): Rgba {
  const alpha = foreground[3] + background[3] * (1 - foreground[3]);
  return [
    (foreground[0] * foreground[3] + background[0] * background[3] * (1 - foreground[3])) / alpha,
    (foreground[1] * foreground[3] + background[1] * background[3] * (1 - foreground[3])) / alpha,
    (foreground[2] * foreground[3] + background[2] * background[3] * (1 - foreground[3])) / alpha,
    alpha
  ];
}

function contrastRgb(first: Rgba, second: Rgba): number {
  const light = Math.max(luminanceRgb(first), luminanceRgb(second));
  const dark = Math.min(luminanceRgb(first), luminanceRgb(second));
  return (light + 0.05) / (dark + 0.05);
}

function luminanceRgb(color: Rgba): number {
  const linear = color.slice(0, 3).map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}
