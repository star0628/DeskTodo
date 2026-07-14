import { expect, type Locator, type Page } from "@playwright/test";
import type { AppState } from "../../src/domain/todoTypes";
import {
  VISUAL_FIXED_TIME,
  VISUAL_STORAGE_KEY
} from "./fixtures/appState";

export interface VisualViewport {
  width: number;
  height: number;
}

interface OpenVisualAppOptions {
  viewport?: VisualViewport;
  backdrop?: "neutral" | "contrast";
}

export async function openVisualApp(
  page: Page,
  state: AppState,
  options: OpenVisualAppOptions = {}
) {
  await page.setViewportSize(options.viewport ?? { width: 360, height: 520 });
  await page.clock.setFixedTime(new Date(VISUAL_FIXED_TIME));
  await page.addInitScript(
    ({ key, value }) => window.localStorage.setItem(key, value),
    { key: VISUAL_STORAGE_KEY, value: JSON.stringify(state) }
  );

  await page.goto("/");
  await expect(page.locator(".app-shell")).toBeVisible();
  await expect(page.locator(".loading-state")).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "添加任务" })).toBeVisible();

  await page.evaluate(async (backdrop) => {
    await document.fonts.ready;
    const root = document.documentElement;
    root.style.backgroundColor = "#242932";
    root.style.backgroundImage =
      backdrop === "contrast"
        ? "linear-gradient(45deg, #f4f4f5 25%, transparent 25%), linear-gradient(-45deg, #f4f4f5 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #f4f4f5 75%), linear-gradient(-45deg, transparent 75%, #f4f4f5 75%)"
        : "none";
    root.style.backgroundPosition = "0 0, 0 8px, 8px -8px, -8px 0";
    root.style.backgroundSize = "16px 16px";
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    );
  }, options.backdrop ?? "neutral");
}

export function taskCard(page: Page, title: string): Locator {
  return page.locator(".task-card").filter({ hasText: title }).first();
}

export async function captureBaseline(page: Page, name: string) {
  await expect(page).toHaveScreenshot(name, {
    animations: "disabled",
    caret: "hide",
    scale: "css"
  });
}

export async function settleVisualState(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  );
}
