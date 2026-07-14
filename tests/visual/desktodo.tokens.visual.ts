import { expect, test } from "@playwright/test";
import { createVisualState, VISUAL_THEME_IDS } from "./fixtures/appState";
import { openVisualApp } from "./visualHarness";

const semanticTokens = [
  "--surface-canvas",
  "--surface-row",
  "--surface-row-hover",
  "--surface-raised",
  "--surface-popup",
  "--border-subtle",
  "--border-strong",
  "--text-primary",
  "--text-secondary",
  "--text-tertiary",
  "--accent-primary",
  "--focus-ring",
  "--shadow-window",
  "--shadow-popup"
] as const;

test.describe("DeskTodo phase 5 to 7 token integration", () => {
  for (const colorTheme of VISUAL_THEME_IDS) {
    test(`resolves the semantic contract for ${colorTheme}`, async ({ page }) => {
      await openVisualApp(page, createVisualState("standard", { colorTheme }));

      const values = await page.locator(".app-shell").evaluate((shell, tokens) => {
        const styles = getComputedStyle(shell);
        return Object.fromEntries(
          tokens.map((token) => [token, styles.getPropertyValue(token).trim()])
        );
      }, semanticTokens);

      for (const token of semanticTokens) {
        expect(values[token], token).not.toBe("");
      }
    });
  }

  test("applies the approved geometry roles", async ({ page }) => {
    await openVisualApp(page, createVisualState("standard"));

    await expect(page.locator(".app-shell")).toHaveCSS("border-radius", "20px");
    await expect(page.locator(".window-layer-control")).toHaveCSS("width", "48px");
    await expect(page.locator(".date-search-button")).toHaveCSS("width", "32px");
    await expect(page.getByRole("textbox", { name: "添加任务" })).toHaveCSS("height", "40px");
    await expect(page.locator(".task-row.parent:not(:has(.deadline-meta))").first()).toHaveCSS(
      "min-height",
      "44px"
    );
    await expect(page.locator(".task-row.parent:has(.deadline-meta)").first()).toHaveCSS(
      "min-height",
      "52px"
    );
    await expect(page.locator(".task-actions .icon-button").first()).toHaveCSS("width", "28px");
    await expect(page.locator(".task-actions-parent").first()).toHaveCSS("width", "160px");
    await expect(page.locator(".task-card").first()).toHaveCSS("border-radius", "8px");

    await page.getByRole("button", { name: /选择日期/ }).click();
    await expect(page.getByRole("dialog", { name: "选择工作日期" })).toHaveCSS(
      "border-radius",
      "10px"
    );
  });

  test("applies every font-size step without semantic dead zones", async ({ page }) => {
    const observed: Array<Record<string, string>> = [];

    for (const fontSize of [12, 14, 16, 20]) {
      await openVisualApp(page, createVisualState("typography", { fontSize }));
      observed.push(
        await page.locator(".app-shell").evaluate((shell) => {
          const styles = getComputedStyle(shell);
          return {
            base: styles.getPropertyValue("--font-size-base").trim(),
            title: styles.getPropertyValue("--type-title-size").trim(),
            body: styles.getPropertyValue("--type-body-size").trim(),
            label: styles.getPropertyValue("--type-label-size").trim(),
            caption: styles.getPropertyValue("--type-caption-size").trim()
          };
        })
      );
      await expect(page.locator(".task-title").first()).toHaveCSS("font-size", `${fontSize}px`);
    }

    expect(observed).toEqual([
      { base: "12px", title: "18px", body: "12px", label: "11px", caption: "10px" },
      { base: "14px", title: "19px", body: "14px", label: "12px", caption: "10.5px" },
      { base: "16px", title: "20px", body: "16px", label: "13px", caption: "11px" },
      { base: "20px", title: "22px", body: "20px", label: "15px", caption: "13px" }
    ]);
  });

  test("updates rendered typography immediately when the slider changes", async ({ page }) => {
    await openVisualApp(page, createVisualState("typography", { fontSize: 16 }));
    await page.getByRole("button", { name: "打开设置" }).click();

    const slider = page.getByRole("slider", { name: "界面字号" });
    await slider.fill("14");

    await expect(slider).toHaveValue("14");
    await expect(page.locator(".task-title").first()).toHaveCSS("font-size", "14px");
    await expect(page.locator(".settings-hint").first()).toHaveCSS("font-size", "10.5px");
  });

  test("keeps foreground content fully opaque at the minimum canvas opacity", async ({ page }) => {
    await openVisualApp(
      page,
      createVisualState("standard", { backgroundOpacityPercent: 10 }),
      { backdrop: "contrast" }
    );

    await expect(page.locator(".app-shell")).toHaveCSS("opacity", "1");
    await expect(page.locator(".task-title").first()).toHaveCSS("opacity", "1");
    const alpha = await page.locator(".app-shell").evaluate((shell) => {
      const match = getComputedStyle(shell).backgroundColor.match(
        /rgba?\([^,]+,[^,]+,[^,]+(?:,\s*([\d.]+))?\)/
      );
      return match?.[1] ? Number(match[1]) : 1;
    });
    expect(alpha).toBeCloseTo(0.1, 2);
  });

  test("removes nonessential motion when the user requests reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openVisualApp(page, createVisualState("standard"));

    const motion = await page.locator(".app-shell").evaluate((shell) => {
      const styles = getComputedStyle(shell);
      return {
        fast: styles.getPropertyValue("--motion-fast").trim(),
        normal: styles.getPropertyValue("--motion-normal").trim()
      };
    });
    expect(motion).toEqual({ fast: "0ms", normal: "0ms" });
    await expect(page.getByRole("button", { name: "搜索历史任务" })).toHaveCSS(
      "transition-duration",
      "0s, 0s, 0s, 0s, 0s"
    );
  });

  test("removes blur and decorative shadows in forced colors", async ({ page }) => {
    await page.emulateMedia({ forcedColors: "active" });
    await openVisualApp(page, createVisualState("standard"));

    await expect(page.locator(".app-shell")).toHaveCSS("backdrop-filter", "none");
    await expect(page.locator(".app-shell")).toHaveCSS("box-shadow", "none");
    await expect(page.locator(".app-shell")).toHaveCSS("border-top-style", "solid");
  });

  test("keeps nested overlays opaque without a second blur layer", async ({ page }) => {
    await openVisualApp(page, createVisualState("standard"));
    await page.getByRole("button", { name: "打开设置" }).click();
    const settings = page.getByRole("dialog", { name: "设置" });
    await expect(settings).toHaveCSS("backdrop-filter", "none");
    await expect(settings).toHaveCSS("border-radius", "10px");
    await expect(settings.locator(".dialog-header")).toHaveCSS("min-height", "52px");
    await expect(settings.getByRole("button", { name: "关闭设置" })).toHaveCSS("width", "32px");
    await expect(settings.getByRole("button", { name: "关闭设置" })).toHaveCSS("height", "32px");
  });
});
