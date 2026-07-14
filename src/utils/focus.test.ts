// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { scheduleTodoFocus } from "./focus";

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("scheduleTodoFocus", () => {
  it("focuses and reveals the task after React moves it", () => {
    const scrollIntoView = vi.fn();
    const row = document.createElement("div");
    const checkbox = document.createElement("input");
    row.dataset.todoId = "task-1";
    row.scrollIntoView = scrollIntoView;
    checkbox.type = "checkbox";
    checkbox.className = "task-checkbox";
    row.append(checkbox);
    document.body.append(row);
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });

    expect(scheduleTodoFocus("task-1")).toBe(1);
    expect(checkbox).toHaveFocus();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" });
  });

  it("is safe when the requested task no longer exists", () => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 2;
    });

    expect(() => scheduleTodoFocus("missing")).not.toThrow();
  });
});
