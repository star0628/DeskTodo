import { expect, test } from "@playwright/test";
import {
  createVisualState,
  VISUAL_THEME_IDS
} from "./fixtures/appState";
import {
  captureBaseline,
  openVisualApp,
  settleVisualState,
  taskCard
} from "./visualHarness";

test.describe("DeskTodo phase 5 to 7 visual baseline", () => {
  for (const colorTheme of VISUAL_THEME_IDS) {
    test(`theme ${colorTheme} at standard viewport`, async ({ page }) => {
      await openVisualApp(page, createVisualState("standard", { colorTheme }));
      await captureBaseline(page, `theme-${colorTheme}-360x520.png`);
    });
  }

  test("minimum viewport", async ({ page }) => {
    await openVisualApp(page, createVisualState("typography"), {
      viewport: { width: 300, height: 280 }
    });
    await captureBaseline(page, "shell-300x280-normal.png");
  });

  test("minimum viewport in compact mode", async ({ page }) => {
    await openVisualApp(page, createVisualState("typography", { compactMode: true }), {
      viewport: { width: 300, height: 280 }
    });
    await captureBaseline(page, "shell-300x280-compact.png");
  });

  test("wide viewport", async ({ page }) => {
    await openVisualApp(page, createVisualState("standard"), {
      viewport: { width: 480, height: 720 }
    });
    await captureBaseline(page, "shell-480x720.png");
  });

  test("minimum font size", async ({ page }) => {
    await openVisualApp(page, createVisualState("typography", { fontSize: 12 }));
    await captureBaseline(page, "typography-font-12px.png");
  });

  test("maximum font size", async ({ page }) => {
    await openVisualApp(page, createVisualState("typography", { fontSize: 20 }));
    await captureBaseline(page, "typography-font-20px.png");
  });

  test("ten percent background opacity", async ({ page }) => {
    await openVisualApp(
      page,
      createVisualState("standard", { backgroundOpacityPercent: 10 }),
      { backdrop: "contrast" }
    );
    await captureBaseline(page, "opacity-10-percent.png");
  });

  test("forty percent background opacity", async ({ page }) => {
    await openVisualApp(
      page,
      createVisualState("standard", { backgroundOpacityPercent: 40 }),
      { backdrop: "contrast" }
    );
    await captureBaseline(page, "opacity-40-percent.png");
  });

  test("ninety percent background opacity", async ({ page }) => {
    await openVisualApp(
      page,
      createVisualState("standard", { backgroundOpacityPercent: 90 }),
      { backdrop: "contrast" }
    );
    await captureBaseline(page, "opacity-90-percent.png");
  });

  test("Windows forced-colors mode", async ({ page }) => {
    await page.emulateMedia({ forcedColors: "active" });
    await openVisualApp(page, createVisualState("standard"));
    await captureBaseline(page, "forced-colors-standard.png");
  });

  test("empty state", async ({ page }) => {
    await openVisualApp(page, createVisualState("empty"));
    await expect(page.getByText("今天还没有任务。先写下一件最重要的小事。")).toBeVisible();
    await captureBaseline(page, "state-empty.png");
  });

  test("stress list with 24 tasks", async ({ page }) => {
    await openVisualApp(page, createVisualState("stress"));
    await captureBaseline(page, "state-stress-24-tasks.png");
  });

  test("completed section collapsed by default", async ({ page }) => {
    await openVisualApp(
      page,
      createVisualState("standard", { collapseCompletedByDefault: true })
    );
    await expect(page.getByRole("button", { name: "已完成 1" })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
    await captureBaseline(page, "state-completed-collapsed.png");
  });

  test("calendar overlay", async ({ page }) => {
    await openVisualApp(page, createVisualState("history"));
    await page.getByRole("button", { name: /选择日期/ }).click();
    await expect(page.getByRole("dialog", { name: "选择工作日期" })).toBeVisible();
    await captureBaseline(page, "overlay-calendar.png");
  });

  test("search overlay", async ({ page }) => {
    await openVisualApp(page, createVisualState("history"));
    await page.getByRole("button", { name: "搜索任务" }).click();
    await expect(page.getByRole("dialog", { name: "搜索任务" })).toBeVisible();
    await page.getByRole("searchbox", { name: "搜索任务和子任务" }).fill("项目");
    await settleVisualState(page);
    await captureBaseline(page, "overlay-search.png");
  });

  test("settings overlay", async ({ page }) => {
    await openVisualApp(page, createVisualState("standard"));
    await page.getByRole("button", { name: "打开设置" }).click();
    await expect(page.getByRole("dialog", { name: "设置" })).toBeVisible();
    await captureBaseline(page, "overlay-settings.png");
  });

  test("custom theme color picker stays contained at the minimum viewport", async ({ page }) => {
    await openVisualApp(
      page,
      createVisualState("standard", { colorTheme: "custom" }),
      { viewport: { width: 300, height: 280 } }
    );
    await page.getByRole("button", { name: "打开设置" }).click();
    await page.getByRole("button", { name: "编辑强调颜色颜色编码" }).click();
    const picker = page.getByRole("region", { name: "编辑强调颜色" });
    await expect(picker).toBeVisible();
    await picker.evaluate((element) =>
      element.scrollIntoView({ behavior: "instant", block: "nearest", inline: "nearest" })
    );
    await settleVisualState(page);

    const overflow = await page.locator(".settings-content").evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return {
        horizontal: element.scrollWidth - element.clientWidth,
        scrollLeft: element.scrollLeft,
        vertical: element.scrollHeight - element.clientHeight,
        overflowX: getComputedStyle(element).overflowX,
        offenders: [...element.querySelectorAll<HTMLElement>("*")]
          .filter((child) => {
            const box = child.getBoundingClientRect();
            return (
              box.width > 0 &&
              (box.right - bounds.right > 1 || bounds.left - box.left > 1)
            );
          })
          .map((child) => ({
            tag: child.tagName,
            className: child.className,
            left: child.getBoundingClientRect().left,
            right: child.getBoundingClientRect().right,
            rootLeft: bounds.left,
            rootRight: bounds.right
          }))
      };
    });
    expect(overflow.offenders).toEqual([]);
    expect(overflow.horizontal).toBe(0);
    expect(overflow.scrollLeft).toBe(0);
    expect(overflow.overflowX).toBe("hidden");
    expect(overflow.vertical).toBeGreaterThan(0);
    await captureBaseline(page, "overlay-custom-theme-picker-300x280.png");
  });

  for (const colorTheme of VISUAL_THEME_IDS) {
    test(`settings popup material in ${colorTheme}`, async ({ page }) => {
      await openVisualApp(page, createVisualState("standard", { colorTheme }));
      await page.getByRole("button", { name: "打开设置" }).click();
      await expect(page.getByRole("dialog", { name: "设置" })).toBeVisible();
      await captureBaseline(page, `popup-settings-${colorTheme}.png`);
    });
  }

  test("recurrence overlay", async ({ page }) => {
    await openVisualApp(page, createVisualState("standard"));
    await taskCard(page, "回复客户关于交付时间的邮件")
      .getByRole("button", { name: /设置计划日期、截止时间或重复/ })
      .click();
    await expect(page.getByRole("dialog", { name: "时间安排" })).toBeVisible();
    await expect(page.getByRole("radio", { name: "截止时间" })).toBeChecked();
    await captureBaseline(page, "overlay-recurrence.png");
  });

  test("deadline display modes stay contained at the minimum width", async ({ page }) => {
    await openVisualApp(page, createVisualState("standard"), {
      viewport: { width: 300, height: 520 }
    });

    const countdownTask = taskCard(page, "完成季度项目复盘并确认关键结论");
    const dateTimeTask = taskCard(page, "回复客户关于交付时间的邮件");
    await expect(countdownTask.getByText(/剩 \d+:/)).toBeVisible();
    await expect(dateTimeTask.getByText("明天 22:00")).toBeVisible();
    await expect(dateTimeTask).not.toContainText("剩");

    const overflow = await page.locator(".app-shell").evaluate((element) => ({
      horizontal: element.scrollWidth - element.clientWidth,
      offenders: [...element.querySelectorAll<HTMLElement>(".deadline-meta")]
        .filter((meta) => meta.scrollWidth - meta.clientWidth > 1)
        .map((meta) => meta.textContent)
    }));
    expect(overflow.horizontal).toBeLessThanOrEqual(1);
    expect(overflow.offenders).toEqual([]);
    await captureBaseline(page, "deadline-modes-300x520.png");
  });

  test("recurring delete confirmation", async ({ page }) => {
    await openVisualApp(page, createVisualState("standard"));
    await taskCard(page, "工作日检查项目待办")
      .getByRole("button", { name: "删除任务" })
      .click();
    await expect(page.getByRole("dialog", { name: /删除重复任务/ })).toBeVisible();
    await captureBaseline(page, "overlay-delete-recurring.png");
  });

  test("inline subtask entry", async ({ page }) => {
    await openVisualApp(page, createVisualState("standard"));
    await taskCard(page, "准备周一项目进度汇报")
      .getByRole("button", { name: "添加子任务" })
      .click();
    await expect(page.getByRole("textbox", { name: "子任务标题" })).toBeFocused();
    await page.getByRole("textbox", { name: "子任务标题" }).fill("补充测试中的子任务草稿");
    const chrome = await page.evaluate(() => {
      const box = (selector: string) =>
        document.querySelector<HTMLElement>(selector)?.getBoundingClientRect() ?? null;
      return {
        windowScrollY: window.scrollY,
        headerActions: box(".header-actions"),
        dateNavigator: box(".date-navigator"),
        quickAdd: box(".quick-add")
      };
    });
    expect(chrome.windowScrollY).toBe(0);
    expect(chrome.headerActions?.top).toBeGreaterThanOrEqual(0);
    expect(chrome.dateNavigator?.top).toBeGreaterThanOrEqual(0);
    expect(chrome.quickAdd?.top).toBeGreaterThanOrEqual(0);
    await captureBaseline(page, "state-inline-subtask-entry.png");
  });
});
