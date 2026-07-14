// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { fallbackDefaultState } from "../persistence/appStateSchema";
import { AppShell } from "./AppShell";

afterEach(cleanup);

describe("AppShell", () => {
  it("applies theme, compact mode, and font size through stable attributes and tokens", () => {
    const settings = {
      ...fallbackDefaultState().settings,
      colorTheme: "jade-forest" as const,
      compactMode: true,
      fontSize: 19
    };
    render(<AppShell settings={settings}>content</AppShell>);

    const shell = screen.getByText("content");
    expect(shell).toHaveAttribute("data-theme", "jade-forest");
    expect(shell).toHaveAttribute("data-compact", "true");
    expect(shell).toHaveStyle("--font-size-base: 19px");
    expect(shell).toHaveStyle("--type-title-size: 21.5px");
    expect(shell).toHaveStyle("--type-body-size: 19px");
    expect(shell).toHaveStyle("--type-label-size: 14.5px");
    expect(shell).toHaveStyle("--type-caption-size: 12.5px");
    expect(shell).toHaveStyle("--window-bg-opacity: 0.9");
  });

  it("injects generated semantic tokens only for the custom theme", () => {
    const settings = {
      ...fallbackDefaultState().settings,
      colorTheme: "custom" as const,
      customThemeColors: {
        canvas: "#F7F7F8" as const,
        surface: "#FFFFFF" as const,
        accent: "#C8102E" as const
      }
    };
    render(<AppShell settings={settings}>custom content</AppShell>);

    const shell = screen.getByText("custom content");
    expect(shell).toHaveAttribute("data-theme", "custom");
    expect(shell).toHaveStyle("--theme-canvas-rgb: 247 247 248");
    expect(shell).toHaveStyle("color-scheme: light");
    expect(shell.style.getPropertyValue("--theme-text-primary")).not.toBe("");
    expect(shell.style.getPropertyValue("--theme-accent-primary")).not.toBe("");
  });
});
