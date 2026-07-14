import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const fontsCss = readFileSync(new URL("./fonts.css", import.meta.url), "utf8");
const globalsCss = readFileSync(new URL("./globals.css", import.meta.url), "utf8");

describe("DeskTodo font policy", () => {
  it("maps application Latin and Chinese text only to Arial and SimHei", () => {
    expect(fontsCss).toContain('local("Arial")');
    expect(fontsCss).toContain('local("Arial Bold")');
    expect(fontsCss).toContain('local("SimHei")');
    expect(fontsCss).toContain('--font-ui: "DeskTodo UI"');
    expect(fontsCss).not.toMatch(/\bInter\b|Segoe UI|Microsoft YaHei|system-ui/i);
    const localFamilies = Array.from(fontsCss.matchAll(/local\("([^"]+)"\)/g), (match) => match[1]);
    expect(new Set(localFamilies)).toEqual(new Set(["Arial", "Arial Bold", "SimHei"]));
  });

  it("forces the app and native form controls to inherit the font token", () => {
    expect(globalsCss).toContain("font-family: var(--font-ui)");
    expect(globalsCss).toContain("font-synthesis: none");
    expect(globalsCss).not.toMatch(/\bInter\b|Segoe UI|Microsoft YaHei|system-ui|sans-serif/i);
  });

  it("uses four canonical type roles and compatibility aliases only", () => {
    const tokensCss = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");
    for (const role of ["title", "body", "label", "caption"]) {
      expect(tokensCss).toMatch(new RegExp(`--type-${role}-size:`));
    }
    for (const [alias, role] of [
      ["heading", "title"],
      ["subheading", "body"],
      ["section", "label"],
      ["small", "caption"],
      ["micro", "caption"]
    ]) {
      expect(tokensCss).toContain(`--type-${alias}-size: var(--type-${role}-size)`);
      expect(globalsCss).not.toContain(`var(--type-${alias}-size)`);
    }
  });
});
