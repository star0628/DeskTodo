import { describe, expect, it } from "vitest";
import { parseAppState } from "../../src/persistence/appStateSchema";
import {
  createVisualState,
  VISUAL_THEME_IDS
} from "../visual/fixtures/appState";

describe("visual baseline fixtures", () => {
  it.each(["empty", "standard", "stress", "typography", "history"] as const)(
    "keeps the %s fixture schema-valid",
    (fixture) => {
      const result = parseAppState(createVisualState(fixture));
      expect(result.status).toBe("ok");
    }
  );

  it("keeps every theme variant schema-valid and internally consistent", () => {
    for (const colorTheme of VISUAL_THEME_IDS) {
      const result = parseAppState(createVisualState("standard", { colorTheme }));
      expect(result.status, colorTheme).toBe("ok");
      expect(result.state.settings.theme).toBe(colorTheme === "citic-red" ? "light" : "dark");
    }
  });

  it("uses deterministic ids and timestamps", () => {
    expect(createVisualState("standard")).toEqual(createVisualState("standard"));
  });
});
