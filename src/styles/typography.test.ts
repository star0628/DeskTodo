import { describe, expect, it } from "vitest";
import { createTypographyScale } from "./typography";

describe("createTypographyScale", () => {
  it.each([
    [12, { base: "12px", title: "18px", body: "12px", label: "11px", caption: "10px" }],
    [14, { base: "14px", title: "19px", body: "14px", label: "12px", caption: "10.5px" }],
    [16, { base: "16px", title: "20px", body: "16px", label: "13px", caption: "11px" }],
    [20, { base: "20px", title: "22px", body: "20px", label: "15px", caption: "13px" }]
  ])("maps %ipx to a readable semantic scale", (fontSize, expected) => {
    expect(createTypographyScale(fontSize)).toEqual(expected);
  });

  it("changes every semantic role at every supported font-size step", () => {
    const scales = Array.from({ length: 9 }, (_, index) => createTypographyScale(12 + index));

    for (const role of ["title", "body", "label", "caption"] as const) {
      expect(new Set(scales.map((scale) => scale[role])).size, role).toBe(scales.length);
    }
  });

  it("clamps defensive callers to the supported range", () => {
    expect(createTypographyScale(8)).toEqual(createTypographyScale(12));
    expect(createTypographyScale(24)).toEqual(createTypographyScale(20));
  });
});
