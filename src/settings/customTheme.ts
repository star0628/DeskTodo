import type { CustomThemeColors, HexColor } from "../domain/todoTypes";

type Rgb = readonly [number, number, number];

export const DEFAULT_CUSTOM_THEME_COLORS: CustomThemeColors = {
  canvas: "#111318",
  surface: "#2B303A",
  accent: "#84CC16"
};

export interface CustomThemeTokens {
  colorScheme: "dark" | "light";
  adjusted: boolean;
  variables: Record<`--theme-${string}`, string>;
}

export function normalizeHexColor(value: string): HexColor | null {
  const raw = value.trim().replace(/^#/, "");
  const expanded = /^[0-9a-f]{3}$/i.test(raw)
    ? raw
        .split("")
        .map((character) => `${character}${character}`)
        .join("")
    : raw;

  return /^[0-9a-f]{6}$/i.test(expanded)
    ? (`#${expanded.toUpperCase()}` as HexColor)
    : null;
}

export function normalizeCustomThemeColors(
  value: CustomThemeColors
): CustomThemeColors | null {
  const canvas = normalizeHexColor(value.canvas);
  const surface = normalizeHexColor(value.surface);
  const accent = normalizeHexColor(value.accent);
  return canvas && surface && accent ? { canvas, surface, accent } : null;
}

export function isCustomThemeColors(value: unknown): value is CustomThemeColors {
  if (typeof value !== "object" || value === null) return false;
  const colors = value as Record<string, unknown>;
  return (
    typeof colors.canvas === "string" &&
    normalizeHexColor(colors.canvas) === colors.canvas.toUpperCase() &&
    typeof colors.surface === "string" &&
    normalizeHexColor(colors.surface) === colors.surface.toUpperCase() &&
    typeof colors.accent === "string" &&
    normalizeHexColor(colors.accent) === colors.accent.toUpperCase()
  );
}

export function customThemeColorsEqual(
  first: CustomThemeColors,
  second: CustomThemeColors
): boolean {
  return (
    first.canvas === second.canvas &&
    first.surface === second.surface &&
    first.accent === second.accent
  );
}

export function getColorScheme(color: HexColor): "dark" | "light" {
  return contrastRatio(color, "#F8FAFC") >= contrastRatio(color, "#111318")
    ? "dark"
    : "light";
}

export function createCustomThemeTokens(colors: CustomThemeColors): CustomThemeTokens {
  const normalized = normalizeCustomThemeColors(colors) ?? DEFAULT_CUSTOM_THEME_COLORS;
  const canvas = normalized.canvas;
  const textPrimary = chooseReadableText(canvas);
  const surfaceSeed = ensureBackgroundContrast(normalized.surface, textPrimary, canvas, 4.5);
  const row = buildReadableSurface(canvas, surfaceSeed, 0.72, textPrimary);
  const rowHover = buildReadableSurface(canvas, surfaceSeed, 0.82, textPrimary);
  const control = buildReadableSurface(canvas, surfaceSeed, 0.54, textPrimary);
  const input = buildReadableSurface(canvas, surfaceSeed, 0.78, textPrimary);
  const raised = buildReadableSurface(canvas, surfaceSeed, 0.88, textPrimary);
  const popup = buildReadableSurface(canvas, surfaceSeed, 0.96, textPrimary);
  const textBackgrounds = [canvas, row, input, popup] as const;
  const textSecondary = ensureForegroundContrast(
    mixHex(textPrimary, canvas, 0.18),
    textBackgrounds,
    4.5,
    textPrimary
  );
  const textTertiary = ensureForegroundContrast(
    mixHex(textPrimary, canvas, 0.3),
    textBackgrounds,
    4.5,
    textPrimary
  );
  const accentStrong = ensureForegroundContrast(
    normalized.accent,
    textBackgrounds,
    3,
    chooseReadableText(canvas)
  );
  const textOnAccent = chooseReadableText(accentStrong);
  const scheme = getColorScheme(canvas);
  const dangerSeed = scheme === "dark" ? "#F87171" : "#B91C1C";
  const danger = ensureForegroundContrast(dangerSeed, textBackgrounds, 3, textPrimary);
  const deadlineSoon = ensureForegroundContrast(
    scheme === "dark" ? "#FBBF24" : "#A16207",
    textBackgrounds,
    3,
    textPrimary
  );
  const deadlineCritical = ensureForegroundContrast(
    scheme === "dark" ? "#FB923C" : "#C2410C",
    textBackgrounds,
    3,
    textPrimary
  );
  const [canvasRed, canvasGreen, canvasBlue] = hexToRgb(canvas);

  return {
    colorScheme: scheme,
    adjusted: surfaceSeed !== normalized.surface || accentStrong !== normalized.accent,
    variables: {
      "--theme-canvas-rgb": `${canvasRed} ${canvasGreen} ${canvasBlue}`,
      "--theme-surface-row": row,
      "--theme-surface-row-hover": rowHover,
      "--theme-surface-control": control,
      "--theme-surface-input": input,
      "--theme-surface-raised": raised,
      "--theme-surface-popup": popup,
      "--theme-surface-scrim": scheme === "dark" ? "rgba(0, 0, 0, 0.42)" : "rgba(20, 24, 30, 0.2)",
      "--theme-border-subtle": rgbaFromHex(textPrimary, 0.2),
      "--theme-border-strong": accentStrong,
      "--theme-text-primary": textPrimary,
      "--theme-text-secondary": textSecondary,
      "--theme-text-tertiary": textTertiary,
      "--theme-accent-primary": accentStrong,
      "--theme-text-on-accent": textOnAccent,
      "--theme-text-danger": danger,
      "--theme-focus-ring": accentStrong,
      "--theme-accent-ring": rgbaFromHex(accentStrong, 0.52),
      "--theme-accent-halo": rgbaFromHex(accentStrong, 0.14),
      "--theme-progress-track": rgbaFromHex(textPrimary, 0.12),
      "--theme-scrollbar-thumb": rgbaFromHex(textPrimary, 0.28),
      "--theme-calendar-dot-selected": textOnAccent,
      "--theme-deadline-soon": deadlineSoon,
      "--theme-deadline-critical": deadlineCritical,
      "--theme-deadline-overdue": danger,
      "--theme-shadow-window": scheme === "dark"
        ? "0 22px 60px rgba(0, 0, 0, 0.46)"
        : "0 22px 60px rgba(20, 24, 30, 0.22)",
      "--theme-shadow-popup": scheme === "dark"
        ? "0 18px 48px rgba(0, 0, 0, 0.5)"
        : "0 18px 48px rgba(20, 24, 30, 0.2)"
    }
  };
}

export function contrastRatio(first: HexColor, second: HexColor): number {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  return (
    (Math.max(firstLuminance, secondLuminance) + 0.05) /
    (Math.min(firstLuminance, secondLuminance) + 0.05)
  );
}

function relativeLuminance(color: HexColor): number {
  const channels = hexToRgb(color).map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function chooseReadableText(background: HexColor): HexColor {
  return contrastRatio(background, "#F8FAFC") >= contrastRatio(background, "#111318")
    ? "#F8FAFC"
    : "#111318";
}

function buildReadableSurface(
  canvas: HexColor,
  surface: HexColor,
  surfaceWeight: number,
  text: HexColor
): HexColor {
  return ensureBackgroundContrast(mixHex(canvas, surface, surfaceWeight), text, canvas, 4.5);
}

function ensureBackgroundContrast(
  background: HexColor,
  foreground: HexColor,
  fallback: HexColor,
  minimum: number
): HexColor {
  if (contrastRatio(background, foreground) >= minimum) return background;
  for (let step = 1; step <= 100; step += 1) {
    const candidate = mixHex(background, fallback, step / 100);
    if (contrastRatio(candidate, foreground) >= minimum) return candidate;
  }
  return fallback;
}

function ensureForegroundContrast(
  foreground: HexColor,
  backgrounds: readonly HexColor[],
  minimum: number,
  fallback: HexColor
): HexColor {
  if (minimumContrast(foreground, backgrounds) >= minimum) return foreground;

  const targets: readonly HexColor[] = [fallback, "#F8FAFC", "#111318"];
  for (let step = 1; step <= 100; step += 1) {
    for (const target of targets) {
      const candidate = mixHex(foreground, target, step / 100);
      if (minimumContrast(candidate, backgrounds) >= minimum) return candidate;
    }
  }
  return fallback;
}

function minimumContrast(color: HexColor, backgrounds: readonly HexColor[]): number {
  return Math.min(...backgrounds.map((background) => contrastRatio(color, background)));
}

function mixHex(first: HexColor, second: HexColor, secondWeight: number): HexColor {
  const ratio = Math.max(0, Math.min(1, secondWeight));
  const firstRgb = hexToRgb(first);
  const secondRgb = hexToRgb(second);
  return rgbToHex([
    Math.round(firstRgb[0] * (1 - ratio) + secondRgb[0] * ratio),
    Math.round(firstRgb[1] * (1 - ratio) + secondRgb[1] * ratio),
    Math.round(firstRgb[2] * (1 - ratio) + secondRgb[2] * ratio)
  ]);
}

function hexToRgb(color: HexColor): Rgb {
  return [
    Number.parseInt(color.slice(1, 3), 16),
    Number.parseInt(color.slice(3, 5), 16),
    Number.parseInt(color.slice(5, 7), 16)
  ];
}

function rgbToHex(color: Rgb): HexColor {
  return `#${color.map((channel) => channel.toString(16).padStart(2, "0")).join("").toUpperCase()}` as HexColor;
}

function rgbaFromHex(color: HexColor, alpha: number): string {
  const [red, green, blue] = hexToRgb(color);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}
