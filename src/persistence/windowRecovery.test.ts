import { describe, expect, it } from "vitest";
import { getRecoveredWindowLayerMode } from "./windowRecovery";

describe("window recovery layer policy", () => {
  it("promotes desktop mode to normal so a recovered window stays reachable", () => {
    expect(getRecoveredWindowLayerMode("alwaysOnBottom")).toBe("normal");
  });

  it.each(["alwaysOnTop", "normal"] as const)("preserves %s mode", (mode) => {
    expect(getRecoveredWindowLayerMode(mode)).toBe(mode);
  });
});
