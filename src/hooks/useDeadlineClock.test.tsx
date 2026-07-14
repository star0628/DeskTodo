// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDeadlineClock } from "./useDeadlineClock";

afterEach(() => {
  vi.useRealTimers();
});

describe("useDeadlineClock", () => {
  it("does not keep a timer alive when no active deadlines exist", () => {
    vi.useFakeTimers();
    renderHook(() => useDeadlineClock([]));
    expect(vi.getTimerCount()).toBe(0);
  });

  it("ticks every second inside the final thirty minutes", () => {
    vi.useFakeTimers();
    const start = new Date(2026, 6, 14, 21, 40, 0).getTime();
    vi.setSystemTime(start);
    const deadline = new Date(start + 20 * 60_000).toISOString();
    const { result } = renderHook(() => useDeadlineClock([deadline]));

    expect(result.current).toBe(start);
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(result.current).toBe(start + 1_000);
  });

  it("recalculates immediately when the window regains focus", () => {
    vi.useFakeTimers();
    const start = new Date(2026, 6, 14, 20, 0, 0).getTime();
    vi.setSystemTime(start);
    const deadline = new Date(start + 2 * 60 * 60_000).toISOString();
    const { result } = renderHook(() => useDeadlineClock([deadline]));

    vi.setSystemTime(start + 90 * 60_000);
    act(() => window.dispatchEvent(new Event("focus")));
    expect(result.current).toBe(start + 90 * 60_000);
  });
});
