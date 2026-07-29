// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CalendarIntegration } from "../calendar/hooks/useCalendarIntegration";
import { fallbackCalendarState } from "../calendar/persistence";
import { CalendarSettingsSection } from "./CalendarSettingsSection";

afterEach(cleanup);

function calendar(
  overrides: Partial<CalendarIntegration> = {}
): CalendarIntegration {
  return {
    state: fallbackCalendarState(),
    hasHydrated: true,
    available: true,
    addSource: vi.fn(async () => undefined),
    removeSource: vi.fn(async () => undefined),
    renameSource: vi.fn(async () => undefined),
    setSourceColor: vi.fn(async () => undefined),
    refreshSource: vi.fn(async () => undefined),
    refreshAll: vi.fn(async () => undefined),
    flush: vi.fn(async () => undefined),
    ...overrides
  };
}

function calendarWithSource(
  overrides: Partial<CalendarIntegration> = {}
): CalendarIntegration {
  return calendar({
    state: {
      schemaVersion: 2,
      sources: [
        {
          id: "source-1",
          name: "家庭",
          color: "#2dd4bf",
          region: "chinaMainland",
          kind: "published",
          etag: null,
          lastModified: null,
          syncState: "idle",
          activeGeneration: 0,
          lastAttemptAt: null,
          lastSuccessAt: null,
          failureCount: 0,
          nextRetryAt: null,
          errorCode: null
        }
      ],
      snapshotsBySource: { "source-1": [] }
    },
    ...overrides
  });
}

describe("CalendarSettingsSection", () => {
  it("accepts a public link without ever echoing the full value after success", async () => {
    const user = userEvent.setup();
    const integration = calendar();
    const testUrl =
      "webcal://p12-caldav.icloud.com/published/2/dummy_test_token_0123456789";
    render(<CalendarSettingsSection calendar={integration} isOpen />);

    await user.click(screen.getByRole("button", { name: "添加" }));
    await user.type(screen.getByRole("textbox", { name: "公开日历链接" }), testUrl);
    await user.type(screen.getByRole("textbox", { name: "显示名称（可选）" }), "工作");
    await user.click(screen.getByRole("button", { name: "验证并添加" }));

    expect(integration.addSource).toHaveBeenCalledWith({
      url: testUrl,
      name: "工作"
    });
    expect(screen.queryByDisplayValue(testUrl)).not.toBeInTheDocument();
    expect(screen.queryByText(testUrl)).not.toBeInTheDocument();
  });

  it("uses a two-step remove flow for local subscription deletion", async () => {
    const user = userEvent.setup();
    const integration = calendarWithSource();
    render(<CalendarSettingsSection calendar={integration} isOpen />);

    await user.click(screen.getByRole("button", { name: "移除家庭" }));
    expect(integration.removeSource).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "确认" }));

    expect(integration.removeSource).toHaveBeenCalledWith("source-1");
  });

  it("opens an accessible eight-color palette from the source swatch", async () => {
    const user = userEvent.setup();
    const integration = calendarWithSource();
    render(<CalendarSettingsSection calendar={integration} isOpen />);

    await user.click(
      screen.getByRole("button", { name: /更改家庭的颜色/ })
    );

    const colors = screen.getAllByRole("radio");
    expect(colors).toHaveLength(8);
    expect(screen.getByRole("radio", { name: "薄荷青" })).toBeChecked();

    await user.click(screen.getByRole("radio", { name: "珊瑚粉" }));

    expect(integration.setSourceColor).toHaveBeenCalledWith(
      "source-1",
      "#fb7185"
    );
    expect(screen.queryByRole("radio", { name: "珊瑚粉" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "刷新家庭" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "移除家庭" })).toBeInTheDocument();
  });

  it("edits and normalizes a source display name inline", async () => {
    const user = userEvent.setup();
    const integration = calendarWithSource();
    render(<CalendarSettingsSection calendar={integration} isOpen />);

    await user.click(
      screen.getByRole("button", { name: "编辑家庭的显示名称" })
    );
    const input = screen.getByRole("textbox", { name: "显示名称" });
    expect(input).toHaveValue("家庭");
    expect(input).toHaveFocus();

    await user.clear(input);
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
    await user.type(input, "  Personal   Calendar  ");
    await user.keyboard("{Enter}");

    expect(integration.renameSource).toHaveBeenCalledWith(
      "source-1",
      "Personal Calendar"
    );
    expect(
      screen.queryByRole("textbox", { name: "显示名称" })
    ).not.toBeInTheDocument();
  });

  it("cancels the inline name editor with Escape", async () => {
    const user = userEvent.setup();
    const integration = calendarWithSource();
    render(<CalendarSettingsSection calendar={integration} isOpen />);

    await user.click(
      screen.getByRole("button", { name: "编辑家庭的显示名称" })
    );
    await user.keyboard("{Escape}");

    expect(integration.renameSource).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("textbox", { name: "显示名称" })
    ).not.toBeInTheDocument();
  });
});
