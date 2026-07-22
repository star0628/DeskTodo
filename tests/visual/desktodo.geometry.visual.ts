import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { createVisualState } from "./fixtures/appState";
import { openVisualApp, settleVisualState, taskCard } from "./visualHarness";

interface BoxMetric {
  x: number;
  y: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
}

const metrics: Record<string, unknown> = {
  generatedAt: new Date().toISOString(),
  platform: process.platform,
  qualityThresholds: {
    edgeAlignmentPx: 1,
    actionAlignmentPx: 1,
    minimumTitleWidthPx: 72,
    minimumTargetSizePx: 24
  }
};

const customPickerFields = ["窗口底色", "内容表面", "强调颜色"] as const;
const customPickerViewports = [
  { width: 300, height: 280 },
  { width: 340, height: 400 },
  { width: 360, height: 520 }
] as const;
const customPickerFontSizes = [12, 16, 20] as const;

test.describe.configure({ mode: "serial" });

test.afterAll(() => {
  const outputDirectory = join(process.cwd(), "output", "playwright");
  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(
    join(outputDirectory, "phase-3-4-geometry-metrics.json"),
    `${JSON.stringify(metrics, null, 2)}\n`,
    "utf8"
  );
});

test("minimum viewport has no horizontal overflow", async ({ page }) => {
  await openVisualApp(page, createVisualState("typography", { fontSize: 20 }), {
    viewport: { width: 300, height: 280 }
  });

  const result = await page.evaluate(() => {
    const shell = document.querySelector<HTMLElement>(".app-shell");
    return {
      viewportWidth: window.innerWidth,
      documentClientWidth: document.documentElement.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      shellClientWidth: shell?.clientWidth ?? -1,
      shellScrollWidth: shell?.scrollWidth ?? -1
    };
  });
  metrics.minimumViewport = result;

  expect(result.documentScrollWidth).toBeLessThanOrEqual(result.documentClientWidth);
  expect(result.shellScrollWidth).toBeLessThanOrEqual(result.shellClientWidth);
});

for (const viewport of customPickerViewports) {
  for (const fontSize of customPickerFontSizes) {
    test(`keeps every custom color picker horizontally stable at ${viewport.width}px and ${fontSize}px type`, async ({ page }) => {
      await openVisualApp(
        page,
        createVisualState("standard", { colorTheme: "custom", fontSize }),
        { viewport }
      );
      await page.getByRole("button", { name: "打开设置" }).click();

      const measurements: Record<string, unknown> = {};
      for (const field of customPickerFields) {
        await page.getByRole("button", { name: `编辑${field}颜色编码` }).click();
        const picker = page.getByRole("region", { name: `编辑${field}` });
        await expect(picker).toBeVisible();
        await picker.evaluate((element) =>
          element.scrollIntoView({ behavior: "instant", block: "nearest", inline: "nearest" })
        );
        await settleVisualState(page);

        const input = picker.getByRole("textbox", { name: `${field}颜色编码` });
        await input.focus();
        await page.keyboard.press("Tab");
        await page.keyboard.press("Shift+Tab");
        await settleVisualState(page);

        const geometry = await page.evaluate((pickerLabel) => {
          const content = document.querySelector<HTMLElement>(".settings-content");
          const region = document.querySelector<HTMLElement>(
            `[aria-label="编辑${pickerLabel}"][role="region"]`
          );
          if (!content || !region) return null;
          const contentBounds = content.getBoundingClientRect();
          const pickerBounds = region.getBoundingClientRect();
          return {
            clientWidth: content.clientWidth,
            scrollWidth: content.scrollWidth,
            scrollLeft: content.scrollLeft,
            pickerLeft: pickerBounds.left,
            pickerRight: pickerBounds.right,
            contentLeft: contentBounds.left,
            contentRight: contentBounds.right,
            leftOverflow: Math.max(0, contentBounds.left - pickerBounds.left),
            rightOverflow: Math.max(0, pickerBounds.right - contentBounds.right)
          };
        }, field);
        measurements[field] = geometry;

        expect(geometry).not.toBeNull();
        expect(geometry?.scrollWidth).toBe(geometry?.clientWidth);
        expect(geometry?.scrollLeft).toBe(0);
        expect(geometry?.leftOverflow).toBe(0);
        expect(geometry?.rightOverflow).toBe(0);

        await picker.getByRole("button", { name: "取消" }).click();
        await expect(picker).toHaveCount(0);
      }
      metrics[`customPicker-${viewport.width}-${fontSize}`] = measurements;
    });
  }
}

test("completion record transfer fits the widget settings viewport", async ({ page }) => {
  await openVisualApp(page, createVisualState("standard"), {
    viewport: { width: 360, height: 520 }
  });

  await page.getByRole("button", { name: "打开设置" }).click();
  await page.getByRole("button", { name: "导出完成记录" }).click();
  await settleVisualState(page);

  const result = await page.evaluate(() => {
    const content = document.querySelector<HTMLElement>(".settings-content");
    const panel = document.querySelector<HTMLElement>(".data-transfer-panel");
    return {
      documentOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      contentOverflow: content ? content.scrollWidth > content.clientWidth : true,
      contentWidths: content
        ? { client: content.clientWidth, scroll: content.scrollWidth }
        : null,
      panelOverflow: panel ? panel.scrollWidth > panel.clientWidth : true,
      panelWidths: panel ? { client: panel.clientWidth, scroll: panel.scrollWidth } : null,
      panelVisible: Boolean(panel),
      saveButtonVisible: Boolean(
        Array.from(document.querySelectorAll("button")).find((button) =>
          button.textContent?.includes("保存 TXT")
        )
      )
    };
  });
  metrics.completionRecordTransfer = result;

  expect(result.documentOverflow).toBe(false);
  expect(result.contentOverflow).toBe(false);
  expect(result.panelOverflow).toBe(false);
  expect(result.panelVisible).toBe(true);
  expect(result.saveButtonVisible).toBe(true);
});

test("keeps the common right edge aligned", async ({ page }) => {
  await openVisualApp(page, createVisualState("standard"));

  const result = await page.evaluate(() => {
    function right(selector: string): number | null {
      return document.querySelector<HTMLElement>(selector)?.getBoundingClientRect().right ?? null;
    }
    const taskRights = Array.from(document.querySelectorAll<HTMLElement>(".task-card"), (item) =>
      item.getBoundingClientRect().right
    );
    const values = {
      headerActions: right(".header-actions"),
      dateSearch: right(".date-search-button"),
      quickAdd: right(".quick-add input"),
      taskCards: taskRights
    };
    const finite = [values.headerActions, values.dateSearch, values.quickAdd, ...taskRights].filter(
      (value): value is number => typeof value === "number"
    );
    return {
      ...values,
      maximumDelta: finite.length > 0 ? Math.max(...finite) - Math.min(...finite) : null
    };
  });
  metrics.rightEdgeAlignment = result;

  expect(result.headerActions).not.toBeNull();
  expect(result.dateSearch).not.toBeNull();
  expect(result.quickAdd).not.toBeNull();
  expect(result.taskCards.length).toBeGreaterThan(0);
  expect(result.maximumDelta).not.toBeNull();
  expect(result.maximumDelta ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(1);
});

test("keeps header controls fixed when browser-only window operations are unavailable", async ({ page }) => {
  await openVisualApp(page, createVisualState("typography", { fontSize: 20 }), {
    viewport: { width: 300, height: 280 }
  });

  const layerControl = page.locator(".window-layer-control");
  await expect(layerControl).toBeDisabled();
  await expect(page.getByRole("button", { name: "隐藏窗口，窗口控制仅桌面版可用" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "关闭到托盘，窗口控制仅桌面版可用" })).toBeDisabled();

  const snapshot = await page.evaluate(() => {
    const selectors = {
      layer: ".window-layer-control",
      settings: ".settings-trigger",
      hide: '[aria-label^="隐藏窗口"]',
      close: '[aria-label^="关闭到托盘"]'
    };
    return Object.fromEntries(
      Object.entries(selectors).flatMap(([name, selector]) => {
        const box = document.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
        return box ? [[`${name}X`, box.x], [`${name}Y`, box.y], [`${name}Width`, box.width]] : [];
      })
    );
  });

  const layout = await page.evaluate(() => {
    const header = document.querySelector<HTMLElement>(".header")?.getBoundingClientRect();
    const title = document.querySelector<HTMLElement>(".header-title-area")?.getBoundingClientRect();
    const actions = document.querySelector<HTMLElement>(".header-actions")?.getBoundingClientRect();
    return {
      display: getComputedStyle(document.querySelector<HTMLElement>(".header")!).display,
      flexWrap: getComputedStyle(document.querySelector<HTMLElement>(".header-actions")!).flexWrap,
      titleRight: title?.right ?? -1,
      actionsLeft: actions?.left ?? -1,
      actionsBottom: actions?.bottom ?? -1,
      headerBottom: header?.bottom ?? -1
    };
  });
  const result = { snapshot, layout };
  metrics.headerControlStability = result;

  expect(layout.display).toBe("grid");
  expect(layout.flexWrap).toBe("nowrap");
  expect(layout.titleRight).toBeLessThanOrEqual(layout.actionsLeft);
  expect(layout.actionsBottom).toBeLessThanOrEqual(layout.headerBottom);
  expect(snapshot.layerWidth).toBe(44);
});

test("keeps search anchored while the Today shortcut appears", async ({ page }) => {
  await openVisualApp(page, createVisualState("standard"));

  const readDateLayout = () =>
    page.evaluate(() => {
      const date = document.querySelector<HTMLElement>(".date-picker-trigger")!.getBoundingClientRect();
      const search = document.querySelector<HTMLElement>(".date-search-button")!.getBoundingClientRect();
      return {
        dateWidth: date.width,
        searchX: search.x,
        searchRight: search.right,
        hasTodayShortcut: Boolean(document.querySelector(".today-button"))
      };
    });

  const today = await readDateLayout();
  await page.getByRole("button", { name: "前一天" }).click();
  await settleVisualState(page);
  const historical = await readDateLayout();
  metrics.dateNavigationStability = { today, historical };

  expect(today.hasTodayShortcut).toBe(false);
  expect(historical.hasTodayShortcut).toBe(true);
  expect(Math.abs(today.searchX - historical.searchX)).toBeLessThanOrEqual(1);
  expect(Math.abs(today.searchRight - historical.searchRight)).toBeLessThanOrEqual(1);
  expect(today.dateWidth - historical.dateWidth).toBeGreaterThanOrEqual(44);
});

test("keeps parent-task action columns aligned", async ({ page }) => {
  await openVisualApp(page, createVisualState("standard"));

  const result = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll<HTMLElement>(".task-row.parent"));
    const selectors = {
      important: ".important-button",
      recurrence: ".recurrence-trigger",
      addSubtask: '[aria-label="添加子任务"]',
      deleteTask: '[aria-label="删除任务"]'
    };
    const columns = Object.fromEntries(
      Object.entries(selectors).map(([name, selector]) => {
        const positions = rows.flatMap((row) => {
          const control = row.querySelector<HTMLElement>(selector);
          return control ? [control.getBoundingClientRect().x] : [];
        });
        return [
          name,
          {
            positions,
            maximumDelta:
              positions.length > 0 ? Math.max(...positions) - Math.min(...positions) : null
          }
        ];
      })
    );
    return { rowCount: rows.length, columns };
  });
  metrics.parentActionAlignment = result;

  expect(result.rowCount).toBeGreaterThan(1);
  for (const column of Object.values(result.columns)) {
    expect(column.positions).toHaveLength(result.rowCount);
    expect(column.maximumDelta).not.toBeNull();
    expect(column.maximumDelta ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(1);
  }
});

test("uses the reclaimed progress slot for task copy without disturbing actions", async ({ page }) => {
  await openVisualApp(page, createVisualState("standard"));

  const result = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll<HTMLElement>(".task-row.parent"));
    const rowWithoutProgress = rows.find((row) => !row.querySelector(".subtask-progress"));
    const rowWithProgress = rows.find((row) => row.querySelector(".subtask-progress"));

    const geometry = (row: HTMLElement | undefined) => {
      if (!row) return null;
      const copy = row.querySelector<HTMLElement>(".task-copy")?.getBoundingClientRect();
      const actions = row.querySelector<HTMLElement>(".task-actions-parent")?.getBoundingClientRect();
      const progress = row.querySelector<HTMLElement>(".subtask-progress");
      if (!copy || !actions) return null;
      return {
        copyWidth: copy.width,
        copyToActionsGap: actions.left - copy.right,
        progressInsideCopy: progress ? Boolean(progress.closest(".task-copy")) : null,
        progressInsideMeta: progress ? Boolean(progress.closest(".task-meta-row")) : null,
        progressInsideActions: progress ? Boolean(progress.closest(".task-actions-parent")) : null
      };
    };

    return {
      rowCount: rows.length,
      withoutProgress: geometry(rowWithoutProgress),
      withProgress: geometry(rowWithProgress)
    };
  });
  metrics.reclaimedTaskCopySlot = result;

  expect(result.rowCount).toBeGreaterThan(1);
  expect(result.withoutProgress).not.toBeNull();
  expect(result.withProgress).not.toBeNull();
  expect(result.withoutProgress?.copyWidth ?? 0).toBeGreaterThanOrEqual(72);
  expect(result.withProgress?.progressInsideCopy).toBe(true);
  expect(result.withProgress?.progressInsideMeta).toBe(true);
  expect(result.withProgress?.progressInsideActions).toBe(false);
  expect(result.withoutProgress?.copyToActionsGap ?? 0).toBeGreaterThanOrEqual(7);
  expect(result.withoutProgress?.copyToActionsGap ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(9);
});

test("audits visible pointer target sizes", async ({ page }) => {
  await openVisualApp(page, createVisualState("standard"));

  const result = await page.evaluate(() => {
    const controls = Array.from(
      document.querySelectorAll<HTMLElement>(
        "button, input:not([type='checkbox']), [role='switch'], .task-checkbox-hit"
      )
    );
    const visible = controls.flatMap((control) => {
      const box = control.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) return [];
      return [
        {
          label:
            control.getAttribute("aria-label") ??
            control.querySelector<HTMLElement>("[aria-label]")?.getAttribute("aria-label") ??
            control.getAttribute("title") ??
            control.textContent?.trim().slice(0, 40) ??
            control.tagName,
          width: round(box.width),
          height: round(box.height)
        }
      ];
    });
    return {
      inspected: visible.length,
      below24: visible.filter((item) => item.width < 24 || item.height < 24)
    };

    function round(value: number) {
      return Math.round(value * 100) / 100;
    }
  });
  metrics.pointerTargets = result;

  expect(result.inspected).toBeGreaterThan(0);
  expect(result.below24).toEqual([]);
});

test("keeps the shell fixed while the stress list scrolls", async ({ page }) => {
  await openVisualApp(page, createVisualState("stress"));

  const result = await page.evaluate(() => {
    const shell = document.querySelector<HTMLElement>(".app-shell");
    const list = document.querySelector<HTMLElement>(".task-list");
    return {
      shellClientHeight: shell?.clientHeight ?? -1,
      shellScrollHeight: shell?.scrollHeight ?? -1,
      listClientHeight: list?.clientHeight ?? -1,
      listScrollHeight: list?.scrollHeight ?? -1,
      listOverflowY: list ? getComputedStyle(list).overflowY : "missing"
    };
  });
  metrics.stressScrolling = result;

  expect(result.shellScrollHeight).toBeLessThanOrEqual(result.shellClientHeight);
  expect(result.listScrollHeight).toBeGreaterThan(result.listClientHeight);
  expect(result.listOverflowY).toBe("auto");
});

test("keeps all primary overlays inside the minimum viewport", async ({ page }) => {
  await openVisualApp(page, createVisualState("standard"), {
    viewport: { width: 300, height: 280 }
  });

  const overlayBoxes: Record<string, BoxMetric> = {};

  await page.getByRole("button", { name: /选择日期/ }).click();
  overlayBoxes.calendar = await visibleDialogBox(page, "选择工作日期");
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "搜索任务" }).click();
  overlayBoxes.search = await visibleDialogBox(page, "搜索任务");
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "打开设置" }).click();
  overlayBoxes.settings = await visibleDialogBox(page, "设置");
  await page.keyboard.press("Escape");

  await taskCard(page, "回复客户关于交付时间的邮件")
    .getByRole("button", { name: /设置计划日期、截止时间或重复/ })
    .click();
  await page.getByRole("switch", { name: /设置截止时间/ }).click();
  overlayBoxes.recurrence = await visibleDialogBox(page, "时间安排");
  await page.keyboard.press("Escape");

  await taskCard(page, "工作日检查项目待办")
    .getByRole("button", { name: "删除任务" })
    .click();
  overlayBoxes.recurringDelete = await visibleDialogBox(page, "删除重复任务");
  await page.keyboard.press("Escape");

  metrics.overlayBoundsAtMinimumViewport = overlayBoxes;
  for (const box of Object.values(overlayBoxes)) {
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(300);
    expect(box.bottom).toBeLessThanOrEqual(280);
  }
});

test("maintains keyboard focus flow for quick add and dialogs", async ({ page }) => {
  await openVisualApp(page, createVisualState("standard"));
  const quickAdd = page.getByRole("textbox", { name: "添加任务" });

  await page.keyboard.press("Control+N");
  await expect(quickAdd).toBeFocused();

  const settingsTrigger = page.getByRole("button", { name: "打开设置" });
  await settingsTrigger.click();
  await expect(page.getByRole("dialog", { name: "设置" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(settingsTrigger).toBeFocused();

  const calendarTrigger = page.getByRole("button", { name: /选择日期/ });
  await calendarTrigger.click();
  await expect(page.getByRole("dialog", { name: "选择工作日期" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(calendarTrigger).toBeFocused();

  const searchTrigger = page.getByRole("button", { name: "搜索任务" });
  await searchTrigger.click();
  const searchDialog = page.getByRole("dialog", { name: "搜索任务" });
  await expect(searchDialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(searchTrigger).toBeFocused();

  const recurrenceTrigger = taskCard(page, "回复客户关于交付时间的邮件")
    .getByRole("button", { name: /设置计划日期、截止时间或重复/ });
  await recurrenceTrigger.click();
  await expect(page.getByRole("dialog", { name: "时间安排" })).toBeVisible();
  await page.getByRole("switch", { name: /设置截止时间/ }).click();
  await page.keyboard.press("Escape");
  await expect(recurrenceTrigger).toBeFocused();

  const deleteTrigger = taskCard(page, "工作日检查项目待办")
    .getByRole("button", { name: "删除任务" });
  await deleteTrigger.click();
  const deleteDialog = page.getByRole("dialog", { name: "删除重复任务" });
  await expect(deleteDialog).toBeVisible();
  await expect(deleteDialog.getByRole("button", { name: "取消" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(deleteTrigger).toBeFocused();

  metrics.keyboardFocusFlow = "passed";
});

test("keeps keyboard focus away from controls behind modal dialogs", async ({ page }) => {
  await openVisualApp(page, createVisualState("standard"));
  await page.getByRole("button", { name: "打开设置" }).click();
  const dialog = page.getByRole("dialog", { name: "设置" });
  await expect(dialog).toBeVisible();

  for (let index = 0; index < 16; index += 1) {
    await page.keyboard.press("Tab");
    const focus = await dialog.evaluate((element) => {
      const active = document.activeElement;
      const isInteractive = active?.matches(
        "button, input, textarea, select, a[href], [tabindex]:not([tabindex='-1'])"
      );
      return {
        inside: element.contains(active),
        isBody: active === document.body,
        outsideInteractive: Boolean(isInteractive && !element.contains(active))
      };
    });
    expect(focus.outsideInteractive, `focus reached a background control after ${index + 1} tabs`).toBe(
      false
    );
    expect(focus.inside || focus.isBody).toBe(true);
  }
});

test("does not shift task title geometry on hover or focus", async ({ page }) => {
  await openVisualApp(page, createVisualState("standard"));
  const card = taskCard(page, "回复客户关于交付时间的邮件");
  const title = card.locator(".task-title");
  const before = await box(title);

  await card.hover();
  await settleVisualState(page);
  const afterHover = await box(title);
  await title.focus();
  await settleVisualState(page);
  const afterFocus = await box(title);

  const result = { before, afterHover, afterFocus };
  metrics.taskTitleStability = result;
  expect(afterHover.width).toBe(before.width);
  expect(afterFocus.width).toBe(before.width);
  expect(afterHover.x).toBe(before.x);
  expect(afterFocus.x).toBe(before.x);
});

test("keeps useful title width at the maximum stress setting", async ({ page }) => {
  await openVisualApp(page, createVisualState("typography", { fontSize: 20 }), {
    viewport: { width: 300, height: 280 }
  });
  const titleBoxes = await page.locator(".task-row.parent .task-title").evaluateAll((titles) =>
    titles.map((title) => {
      const box = title.getBoundingClientRect();
      return {
        title: title.textContent ?? "",
        width: Math.round(box.width * 100) / 100
      };
    })
  );
  const result = {
    minimumWidth: Math.min(...titleBoxes.map((item) => item.width)),
    titles: titleBoxes
  };
  metrics.maximumStressTitleWidth = result;

  expect(result.minimumWidth).toBeGreaterThanOrEqual(72);
});

test("long-press drag reorders and immediately persists a task without a visible handle", async ({
  page
}) => {
  await openVisualApp(page, createVisualState("typography"));
  const firstTitle = "准备周一项目进度汇报并复核全部附件及会议材料确保最终版本准确无误";
  const secondTitle = "SuperLongEnglishTaskTitleWithoutAnyWhitespaceForOverflowTesting";
  const source = taskCard(page, firstTitle);
  const target = taskCard(page, secondTitle);

  await expect(source.locator(".task-row.parent")).not.toHaveAttribute("aria-roledescription");
  await longPressDrag(page, source.locator(".task-title"), target.locator(".task-title"));

  const visibleOrder = await page.locator(".task-row.parent .task-title").allTextContents();
  expect(visibleOrder.indexOf(secondTitle)).toBeLessThan(visibleOrder.indexOf(firstTitle));

  await expect
    .poll(() =>
      page.evaluate(() => {
        const raw = localStorage.getItem("desktodo:app-state");
        return raw
          ? (JSON.parse(raw) as { tasks: Array<{ id: string }> }).tasks.map((task) => task.id)
          : [];
      })
    )
    .toEqual(expect.arrayContaining(["long-english", "long-chinese"]));

  const storedOrder = await page.evaluate(() => {
    const raw = localStorage.getItem("desktodo:app-state");
    return raw
      ? (JSON.parse(raw) as { tasks: Array<{ id: string }> }).tasks.map((task) => task.id)
      : [];
  });
  expect(storedOrder.indexOf("long-english")).toBeLessThan(storedOrder.indexOf("long-chinese"));
});

test("a normal task click does not start sorting", async ({ page }) => {
  await openVisualApp(page, createVisualState("typography"));
  const title = "准备周一项目进度汇报并复核全部附件及会议材料确保最终版本准确无误";
  const titles = page.locator(".task-row.parent .task-title");
  const before = await titles.allTextContents();

  await taskCard(page, title).locator(".task-title").click();

  await expect(titles).toHaveText(before);
  await expect(page.locator(".inline-edit-input")).toHaveCount(0);
});

test("keeps every header control visible at the maximum font size", async ({ page }) => {
  await openVisualApp(page, createVisualState("typography", { fontSize: 20 }));

  for (const name of [
    /窗口层级/,
    "打开设置",
    "隐藏窗口",
    "关闭到托盘"
  ]) {
    const control = page.getByRole("button", { name });
    await expect(control).toBeVisible();
    const controlBox = await box(control);
    expect(controlBox.x).toBeGreaterThanOrEqual(0);
    expect(controlBox.right).toBeLessThanOrEqual(360);
  }
});

async function visibleDialogBox(page: Page, name: string): Promise<BoxMetric> {
  const dialog = page.getByRole("dialog", { name });
  await expect(dialog).toBeVisible();
  return box(dialog);
}

async function longPressDrag(page: Page, source: Locator, target: Locator) {
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  expect(sourceBox).not.toBeNull();
  expect(targetBox).not.toBeNull();
  if (!sourceBox || !targetBox) return;

  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(260);
  await page.mouse.move(
    targetBox.x + targetBox.width / 2,
    targetBox.y + targetBox.height * 0.8,
    { steps: 12 }
  );
  await page.waitForTimeout(80);
  await page.mouse.up();
  await settleVisualState(page);
}

async function box(locator: ReturnType<Page["locator"]>): Promise<BoxMetric> {
  const value = await locator.boundingBox();
  expect(value).not.toBeNull();
  const item = value ?? { x: 0, y: 0, width: 0, height: 0 };
  return {
    x: round(item.x),
    y: round(item.y),
    width: round(item.width),
    height: round(item.height),
    right: round(item.x + item.width),
    bottom: round(item.y + item.height)
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
