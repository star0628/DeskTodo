import { describe, expect, it } from "vitest";
import { WINDOW_LAYER_LABELS } from "./windowLayer";

describe("windowLayer", () => {
  it("defines compact labels for all supported modes", () => {
    expect(WINDOW_LAYER_LABELS).toEqual({
      alwaysOnTop: "置顶",
      normal: "普通",
      alwaysOnBottom: "桌面"
    });
  });
});
