import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const globalsCss = readFileSync(new URL("./globals.css", import.meta.url), "utf8");

describe("DeskTodo material and motion contract", () => {
  it("keeps real backdrop blur on the window canvas only", () => {
    expect(getRuleBlock(".app-shell")).toContain("backdrop-filter: blur(22px) saturate(130%)");
    expect(getRuleBlock(".calendar-dialog")).not.toContain("backdrop-filter");
    expect(getRuleBlock(".settings-dialog")).not.toContain("backdrop-filter");
    expect(globalsCss.match(/backdrop-filter:\s*blur/g)).toHaveLength(1);
  });

  it("uses one semantic popup surface for every primary overlay", () => {
    const surface = getRuleBlock(".dialog-surface");
    expect(surface).toContain("background: var(--surface-popup)");
    expect(surface).toContain("border-radius: var(--radius-popup)");
    expect(surface).toContain("box-shadow: var(--shadow-popup)");
    expect(surface).toContain("border: var(--stroke-thin) solid var(--border-strong)");
  });

  it("keeps list surfaces flat and motion paint-only", () => {
    expect(getRuleBlock(".task-card")).not.toContain("box-shadow");
    expect(globalsCss).not.toMatch(/transition\s*:\s*all\b/i);
    expect(globalsCss).not.toMatch(
      /transition(?:-property)?\s*:[^;]*(?:width|height|margin|padding|grid-template|backdrop-filter|box-shadow)/i
    );
  });

  it("uses the shared header and close control geometry", () => {
    expect(getRuleBlock(".dialog-header")).toContain("min-height: var(--size-dialog-header)");
    expect(getRuleBlock(".dialog-close")).toContain("width: var(--size-control)");
    expect(getRuleBlock(".dialog-close")).toContain("height: var(--size-control)");
  });
});

function getRuleBlock(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = globalsCss.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`));
  expect(match, `missing rule ${selector}`).not.toBeNull();
  return match?.[1] ?? "";
}
