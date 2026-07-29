import { expect, test, type Page } from "@playwright/test";
import {
  createVisualState,
  VISUAL_FIXED_TIME,
  VISUAL_THEME_IDS
} from "./fixtures/appState";
import {
  captureBaseline,
  openVisualApp,
  settleVisualState,
  taskCard
} from "./visualHarness";

async function openCalendarSourceSettings(
  page: Page,
  options: {
    viewport?: { width: number; height: number };
    fontSize?: number;
  } = {}
) {
  await page.setViewportSize(options.viewport ?? { width: 360, height: 520 });
  await page.clock.setFixedTime(new Date(VISUAL_FIXED_TIME));
  const query = options.fontSize ? `?font=${options.fontSize}` : "";
  await page.goto(`/tests/visual/calendar-settings-harness.html${query}`);
  await expect(page.locator(".app-shell")).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts.ready;
    document.documentElement.style.backgroundColor = "#242932";
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    );
  });
  await page.getByRole("button", { name: "打开设置" }).click();
  const settings = page.getByRole("dialog", { name: "设置" });
  await expect(settings).toBeVisible();
  await expect(
    settings.getByRole("button", { name: "编辑家庭安排的显示名称" })
  ).toBeVisible();
  return settings;
}

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

  test("calendar source color palette", async ({ page }) => {
    const settings = await openCalendarSourceSettings(page);
    const colorButton = settings.getByRole("button", {
      name: /更改家庭安排的颜色/
    });
    await colorButton.click();
    const palette = settings.getByRole("group", {
      name: "选择家庭安排的日历颜色"
    });
    await expect(palette).toBeVisible();
    await expect(palette.getByRole("radio")).toHaveCount(8);
    await expect(palette.getByRole("radio", { name: "薄荷青" })).toBeChecked();
    await palette.evaluate((element) =>
      element.scrollIntoView({ behavior: "instant", block: "center" })
    );
    await settleVisualState(page);

    const geometry = await palette.evaluate((element) => {
      const content = element.closest<HTMLElement>(".settings-content");
      const colorTarget =
        element.parentElement?.querySelector<HTMLElement>(
          ".calendar-source-color-button"
        );
      const bounds = element.getBoundingClientRect();
      const contentBounds = content?.getBoundingClientRect();
      const targetBounds = colorTarget?.getBoundingClientRect();
      const optionBounds = Array.from(
        element.querySelectorAll<HTMLElement>(".calendar-source-color-option"),
        (option) => option.getBoundingClientRect()
      );
      return {
        contentOverflow: content
          ? content.scrollWidth - content.clientWidth
          : Number.POSITIVE_INFINITY,
        leftOverflow: contentBounds
          ? Math.max(0, contentBounds.left - bounds.left)
          : Number.POSITIVE_INFINITY,
        rightOverflow: contentBounds
          ? Math.max(0, bounds.right - contentBounds.right)
          : Number.POSITIVE_INFINITY,
        targetWidth: targetBounds?.width ?? 0,
        targetHeight: targetBounds?.height ?? 0,
        minimumOptionWidth: Math.min(...optionBounds.map((box) => box.width)),
        minimumOptionHeight: Math.min(...optionBounds.map((box) => box.height))
      };
    });
    expect(geometry.contentOverflow).toBe(0);
    expect(geometry.leftOverflow).toBe(0);
    expect(geometry.rightOverflow).toBe(0);
    expect(geometry.targetWidth).toBeGreaterThanOrEqual(32);
    expect(geometry.targetHeight).toBeGreaterThanOrEqual(32);
    expect(geometry.minimumOptionWidth).toBeGreaterThanOrEqual(32);
    expect(geometry.minimumOptionHeight).toBeGreaterThanOrEqual(32);
    await captureBaseline(page, "overlay-calendar-source-colors.png");
  });

  test("calendar source metadata controls fit the minimum viewport and persist keyboard edits", async ({
    page
  }) => {
    const settings = await openCalendarSourceSettings(page, {
      viewport: { width: 300, height: 280 },
      fontSize: 20
    });

    await settings
      .getByRole("button", { name: /更改家庭安排的颜色/ })
      .click();
    const selectedColor = settings.getByRole("radio", { name: "薄荷青" });
    await selectedColor.focus();
    await page.keyboard.press("ArrowRight");
    await expect(
      settings.getByRole("group", {
        name: "选择家庭安排的日历颜色"
      })
    ).toHaveCount(0);
    await expect(
      settings.getByRole("button", {
        name: /更改家庭安排的颜色，当前暖金/
      })
    ).toBeVisible();

    await settings
      .getByRole("button", { name: "编辑家庭安排的显示名称" })
      .click();
    const editor = settings.locator(".calendar-source-name-editor");
    const input = editor.getByRole("textbox", { name: "显示名称" });
    await expect(input).toBeFocused();
    await editor.evaluate((element) =>
      element.scrollIntoView({ behavior: "instant", block: "nearest" })
    );
    const editorGeometry = await editor.evaluate((element) => {
      const content = element.closest<HTMLElement>(".settings-content");
      const contentBounds = content?.getBoundingClientRect();
      const editorBounds = element.getBoundingClientRect();
      return {
        contentClientWidth: content?.clientWidth ?? 0,
        contentScrollWidth: content?.scrollWidth ?? Number.POSITIVE_INFINITY,
        leftOverflow: contentBounds
          ? Math.max(0, contentBounds.left - editorBounds.left)
          : Number.POSITIVE_INFINITY,
        rightOverflow: contentBounds
          ? Math.max(0, editorBounds.right - contentBounds.right)
          : Number.POSITIVE_INFINITY
      };
    });
    expect(editorGeometry.contentScrollWidth).toBe(
      editorGeometry.contentClientWidth
    );
    expect(editorGeometry.leftOverflow).toBe(0);
    expect(editorGeometry.rightOverflow).toBe(0);
    await input.fill("  家庭   日历  ");
    await page.keyboard.press("Enter");
    await expect(editor).toHaveCount(0);
    await expect(
      settings.getByRole("button", {
        name: "编辑家庭 日历的显示名称"
      })
    ).toBeVisible();

    const geometry = await settings.locator(".settings-content").evaluate((content) => ({
      clientWidth: content.clientWidth,
      scrollWidth: content.scrollWidth,
      scrollLeft: content.scrollLeft
    }));
    expect(geometry.scrollWidth).toBe(geometry.clientWidth);
    expect(geometry.scrollLeft).toBe(0);
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
      .getByRole("button", { name: /设置计划日期、时间段、截止时间或重复/ })
      .click();
    await expect(page.getByRole("dialog", { name: "时间安排" })).toBeVisible();
    await expect(page.getByRole("radio", { name: "截止时间" })).toBeChecked();
    await captureBaseline(page, "overlay-recurrence.png");
  });

  test("time block overlay uses the in-app calendar", async ({ page }) => {
    await openVisualApp(page, createVisualState("standard"));
    await taskCard(page, "回复客户关于交付时间的邮件")
      .getByRole("button", { name: /设置计划日期、时间段、截止时间或重复/ })
      .click();
    await page.getByRole("tab", { name: "时间段" }).click();
    await page.getByRole("radio", { name: "指定时间" }).click();
    await expect(page.getByLabel("选择开始日期")).toBeVisible();
    await expect(page.locator('input[type="datetime-local"]')).toHaveCount(0);
    await captureBaseline(page, "overlay-time-block.png");
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
