import { expect, test } from "@playwright/test";
import type { TodoItem } from "../../src/domain/todoTypes";
import {
  createVisualState,
  VISUAL_STORAGE_KEY
} from "./fixtures/appState";
import { openVisualApp } from "./visualHarness";

test("deletes a historical parent hierarchy, persists immediately, and restores it with Undo", async ({
  page
}) => {
  const state = createVisualState("standard");
  const parent = state.tasks.find((task) => task.id === "completed-yesterday")!;
  parent.children = [completedChild(parent, "cross-date-child", "2026-07-11")];

  await openVisualApp(page, state);
  await page.getByRole("button", { name: "前一天" }).click();
  await page.getByRole("button", { name: "选择", exact: true }).click();
  await page.getByRole("checkbox", { name: "选择“归档昨日项目资料”" }).check();
  await page.locator(".history-delete-button").click();

  const dialog = page.getByRole("dialog", { name: "删除完成记录" });
  await expect(dialog.getByText("将删除 2 条完成记录。")).toBeVisible();
  await expect(dialog.getByText("其中 1 条属于其他日期。")).toBeVisible();
  await dialog.getByRole("button", { name: "删除", exact: true }).click();

  await expect(page.getByText("这一天还没有完成记录。")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        ({ key, id }) => {
          const raw = localStorage.getItem(key);
          if (!raw) return null;
          const stored = JSON.parse(raw) as { tasks: TodoItem[] };
          return stored.tasks.some((task) => task.id === id);
        },
        { key: VISUAL_STORAGE_KEY, id: parent.id }
      )
    )
    .toBe(false);

  await page.getByRole("button", { name: "撤销" }).click();
  await expect(page.getByText("归档昨日项目资料")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        ({ key, id }) => {
          const raw = localStorage.getItem(key);
          if (!raw) return null;
          const stored = JSON.parse(raw) as { tasks: TodoItem[] };
          return stored.tasks.find((task) => task.id === id)?.children[0]?.id ?? null;
        },
        { key: VISUAL_STORAGE_KEY, id: parent.id }
      )
    )
    .toBe("cross-date-child");
});

test("history selection stays within the minimum viewport", async ({ page }) => {
  await openVisualApp(page, createVisualState("standard"), {
    viewport: { width: 300, height: 280 }
  });
  await page.getByRole("button", { name: "前一天" }).click();
  await page.getByRole("button", { name: "选择", exact: true }).click();

  const metrics = await page.evaluate(() => {
    const shell = document.querySelector<HTMLElement>(".app-shell")!;
    const selectionBar = document.querySelector<HTMLElement>(".history-selection-bar")!;
    const toolbar = document.querySelector<HTMLElement>(".history-toolbar")!;
    return {
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      shellOverflow: shell.scrollWidth - shell.clientWidth,
      selectionBarRight: selectionBar.getBoundingClientRect().right,
      toolbarRight: toolbar.getBoundingClientRect().right,
      viewportWidth: window.innerWidth
    };
  });

  expect(metrics.documentOverflow).toBeLessThanOrEqual(0);
  expect(metrics.shellOverflow).toBeLessThanOrEqual(0);
  expect(metrics.selectionBarRight).toBeLessThanOrEqual(metrics.viewportWidth);
  expect(metrics.toolbarRight).toBeLessThanOrEqual(metrics.viewportWidth);
});

function completedChild(parent: TodoItem, id: string, completedOn: string): TodoItem {
  return {
    ...parent,
    id,
    title: "跨日期完成的子任务",
    completedAt: `${completedOn}T08:00:00.000Z`,
    completedOn,
    recurrenceSeriesId: null,
    children: []
  };
}
