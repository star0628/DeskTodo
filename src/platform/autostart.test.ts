import { describe, expect, it, vi } from "vitest";
import { createAutostartService } from "./autostart";

describe("autostartService", () => {
  it("reads and changes the native registration when Tauri is available", async () => {
    const api = {
      enable: vi.fn(async () => undefined),
      disable: vi.fn(async () => undefined),
      isEnabled: vi.fn(async () => true)
    };
    const service = createAutostartService(api, () => true);

    await expect(service.isEnabled()).resolves.toBe(true);
    await service.setEnabled(false);
    await service.setEnabled(true);

    expect(api.disable).toHaveBeenCalledOnce();
    expect(api.enable).toHaveBeenCalledOnce();
  });

  it("is a safe unavailable fallback in the browser", async () => {
    const api = {
      enable: vi.fn(async () => undefined),
      disable: vi.fn(async () => undefined),
      isEnabled: vi.fn(async () => true)
    };
    const service = createAutostartService(api, () => false);

    expect(service.isAvailable()).toBe(false);
    await expect(service.isEnabled()).resolves.toBe(false);
    await service.setEnabled(true);
    expect(api.enable).not.toHaveBeenCalled();
  });
});
