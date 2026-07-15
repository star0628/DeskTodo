import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const tokensCss = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");
const globalsCss = readFileSync(new URL("./globals.css", import.meta.url), "utf8");

describe("DeskTodo design token contract", () => {
  it("defines the approved geometry and motion foundation", () => {
    for (const [token, value] of Object.entries({
      "--space-1": "4px",
      "--space-2": "8px",
      "--space-3": "12px",
      "--space-4": "16px",
      "--space-5": "20px",
      "--space-6": "24px",
      "--space-7": "32px",
      "--radius-window": "20px",
      "--radius-popup": "10px",
      "--radius-card": "8px",
      "--radius-control": "8px",
      "--size-control": "32px",
      "--size-control-compact": "28px",
      "--size-layer-control": "48px",
      "--size-layer-control-compact": "44px",
      "--size-icon": "16px",
      "--size-task-row": "44px",
      "--size-task-row-compact": "36px",
      "--size-task-action-slot": "28px",
      "--size-task-action-slot-compact": "24px",
      "--motion-fast": "100ms",
      "--motion-normal": "160ms",
      "--ease-standard": "cubic-bezier(0.2, 0, 0, 1)"
    })) {
      expect(getDeclaration(tokensCss, token), token).toBe(value);
    }
  });

  it("exposes the complete semantic component surface", () => {
    for (const token of [
      "--surface-canvas",
      "--surface-row",
      "--surface-row-hover",
      "--surface-control-hover",
      "--surface-raised",
      "--surface-popup",
      "--border-subtle",
      "--border-strong",
      "--text-primary",
      "--text-secondary",
      "--text-tertiary",
      "--accent-primary",
      "--deadline-normal",
      "--deadline-soon",
      "--deadline-critical",
      "--deadline-overdue",
      "--focus-ring",
      "--shadow-window",
      "--shadow-popup"
    ]) {
      expect(getDeclaration(tokensCss, token), token).not.toBeNull();
    }
  });

  it("keeps component CSS independent from theme-private and legacy tokens", () => {
    expect(globalsCss).not.toContain("--theme-");
    expect(globalsCss).not.toContain("--color-");
    expect(tokensCss).not.toContain("--color-");
  });

  it("keeps color literals out of component CSS", () => {
    expect(globalsCss).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(globalsCss).not.toMatch(/\b(?:rgb|rgba|hsl|hsla)\s*\(/i);
  });

  it("uses radius and motion tokens in component CSS", () => {
    for (const declaration of globalsCss.matchAll(/border-radius:\s*([^;]+);/g)) {
      expect(declaration[1]).toMatch(/^(?:var\(--radius-[^)]+\)|inherit)$/);
    }

    expect(globalsCss).not.toMatch(/\b(?:100|120|160|200|250|300)ms\b/);
    expect(globalsCss).toContain("var(--motion-fast) var(--ease-standard)");
    expect(globalsCss).toContain("var(--motion-normal) var(--ease-standard)");
  });

  it("limits adjustable transparency to the canvas surface", () => {
    expect(tokensCss.match(/--window-bg-opacity/g)).toHaveLength(2);
    expect(globalsCss).not.toContain("--window-bg-opacity");

    const shellBlock = getRuleBlock(globalsCss, ".app-shell");
    expect(shellBlock).not.toMatch(/^\s*opacity\s*:/m);
  });

  it("adapts to Windows forced colors and reduced motion", () => {
    expect(globalsCss).toContain("@media (forced-colors: active)");
    expect(globalsCss).toContain("--surface-canvas: Canvas");
    expect(globalsCss).toContain("--focus-ring: Highlight");
    expect(globalsCss).toContain("@media (prefers-reduced-motion: reduce)");
    expect(globalsCss).toContain("--motion-fast: 0ms");
    expect(globalsCss).toContain("--motion-normal: 0ms");
  });
});

function getDeclaration(css: string, token: string): string | null {
  return css.match(new RegExp(`^\\s*${token}:\\s*([^;]+);`, "m"))?.[1]?.trim() ?? null;
}

function getRuleBlock(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`));
  expect(match, `missing rule ${selector}`).not.toBeNull();
  return match?.[1] ?? "";
}
