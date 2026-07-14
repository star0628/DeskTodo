// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { shouldFocusQuickAdd, shouldUndoDelete } from "./keyboard";

function event(target: EventTarget = document.body) {
  return { key: "n", ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, target };
}

describe("shouldFocusQuickAdd", () => {
  it("accepts Ctrl+N on today's idle view", () => {
    expect(shouldFocusQuickAdd(event(), true, false)).toBe(true);
  });

  it("does not intercept editing, calendar, history, or modified shortcuts", () => {
    const input = document.createElement("input");
    expect(shouldFocusQuickAdd(event(input), true, false)).toBe(false);
    expect(shouldFocusQuickAdd(event(), true, true)).toBe(false);
    expect(shouldFocusQuickAdd(event(), false, false)).toBe(false);
    expect(shouldFocusQuickAdd({ ...event(), shiftKey: true }, true, false)).toBe(false);
  });
});

describe("shouldUndoDelete", () => {
  it("accepts Ctrl+Z only when an undo is available", () => {
    expect(shouldUndoDelete({ ...event(), key: "z" }, true)).toBe(true);
    expect(shouldUndoDelete({ ...event(), key: "z" }, false)).toBe(false);
  });

  it("does not replace native undo in editable controls", () => {
    const input = document.createElement("input");
    expect(shouldUndoDelete({ ...event(input), key: "z" }, true)).toBe(false);
    expect(shouldUndoDelete({ ...event(), key: "z", shiftKey: true }, true)).toBe(false);
  });
});
