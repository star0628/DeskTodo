import { describe, expect, it } from "vitest";
import type { HexColor } from "../domain/todoTypes";
import {
  contrastRatio,
  createCustomThemeTokens,
  DEFAULT_CUSTOM_THEME_COLORS,
  normalizeHexColor
} from "./customTheme";

describe("custom theme colors", () => {
  it("normalizes supported three and six digit HEX values", () => {
    expect(normalizeHexColor("abc")).toBe("#AABBCC");
    expect(normalizeHexColor(" #12ef90 ")).toBe("#12EF90");
  });

  it("rejects malformed and alpha-bearing color values", () => {
    expect(normalizeHexColor("")).toBeNull();
    expect(normalizeHexColor("#12")).toBeNull();
    expect(normalizeHexColor("#GG1122")).toBeNull();
    expect(normalizeHexColor("#11223388")).toBeNull();
  });

  it("generates deterministic complete semantic tokens", () => {
    const first = createCustomThemeTokens(DEFAULT_CUSTOM_THEME_COLORS);
    const second = createCustomThemeTokens(DEFAULT_CUSTOM_THEME_COLORS);

    expect(first).toEqual(second);
    expect(Object.keys(first.variables)).toHaveLength(27);
    expect(first.variables["--theme-canvas-rgb"]).toBe("17 19 24");
  });

  it.each([
    { canvas: "#111318", surface: "#2B303A", accent: "#84CC16" },
    { canvas: "#F7F7F8", surface: "#FFFFFF", accent: "#C8102E" },
    { canvas: "#808080", surface: "#808080", accent: "#808080" }
  ] as const)("keeps generated text and controls readable for %#", (colors) => {
    const result = createCustomThemeTokens(colors);
    const backgrounds = [
      rgbStringToHex(result.variables["--theme-canvas-rgb"]),
      result.variables["--theme-surface-row"] as HexColor,
      result.variables["--theme-surface-input"] as HexColor,
      result.variables["--theme-surface-popup"] as HexColor
    ];

    for (const textToken of [
      "--theme-text-primary",
      "--theme-text-secondary",
      "--theme-text-tertiary"
    ] as const) {
      const text = result.variables[textToken] as HexColor;
      for (const background of backgrounds) {
        expect(contrastRatio(text, background), `${textToken} on ${background}`).toBeGreaterThanOrEqual(4.5);
      }
    }

    const accent = result.variables["--theme-accent-primary"] as HexColor;
    const onAccent = result.variables["--theme-text-on-accent"] as HexColor;
    const focus = result.variables["--theme-focus-ring"] as HexColor;
    for (const background of backgrounds) {
      expect(contrastRatio(focus, background)).toBeGreaterThanOrEqual(3);
    }
    expect(contrastRatio(accent, onAccent)).toBeGreaterThanOrEqual(4.5);
  });
});

function rgbStringToHex(value: string): HexColor {
  const channels = value.split(/\s+/).map(Number);
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("").toUpperCase()}` as HexColor;
}
