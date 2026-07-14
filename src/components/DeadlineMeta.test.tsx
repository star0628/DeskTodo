// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DeadlineMeta } from "./DeadlineMeta";

afterEach(cleanup);

describe("DeadlineMeta", () => {
  it("shows seconds only inside the final thirty minutes", () => {
    const now = new Date(2026, 6, 14, 21, 30, 0).getTime();
    const deadline = new Date(now + 29 * 60_000 + 59_000).toISOString();
    render(
      <DeadlineMeta deadlineAt={deadline} displayMode="countdown" nowMs={now} done={false} />
    );

    expect(screen.getByLabelText(/剩 29:59/)).toHaveClass("deadline-critical");
  });

  it("keeps completed deadlines static", () => {
    const now = new Date(2026, 6, 14, 21, 30, 0).getTime();
    const deadline = new Date(now + 5_000).toISOString();
    render(
      <DeadlineMeta deadlineAt={deadline} displayMode="countdown" nowMs={now} done />
    );

    const meta = screen.getByLabelText(/^截止/);
    expect(meta).toHaveClass("deadline-completed");
    expect(meta).not.toHaveTextContent("剩");
  });

  it("shows only the relative deadline label in countdown mode", () => {
    const now = new Date(2026, 6, 14, 12, 0, 0).getTime();
    const deadline = new Date(2026, 6, 14, 22, 0, 0).toISOString();
    render(
      <DeadlineMeta deadlineAt={deadline} displayMode="countdown" nowMs={now} done={false} />
    );

    const meta = screen.getByLabelText(/截止 今天 22:00，剩 10小时/);
    expect(meta).toHaveTextContent("剩 10小时");
    expect(meta).not.toHaveTextContent("今天 22:00");
  });

  it("shows today, tomorrow, and an overdue marker in date-time mode", () => {
    const now = new Date(2026, 6, 14, 12, 0, 0).getTime();
    const { rerender } = render(
      <DeadlineMeta
        deadlineAt={new Date(2026, 6, 14, 22, 0, 0).toISOString()}
        displayMode="dateTime"
        nowMs={now}
        done={false}
      />
    );

    expect(screen.getByText("今天 22:00")).toBeInTheDocument();
    rerender(
      <DeadlineMeta
        deadlineAt={new Date(2026, 6, 15, 22, 0, 0).toISOString()}
        displayMode="dateTime"
        nowMs={now}
        done={false}
      />
    );
    expect(screen.getByText("明天 22:00")).toBeInTheDocument();
    rerender(
      <DeadlineMeta
        deadlineAt={new Date(2026, 6, 14, 10, 0, 0).toISOString()}
        displayMode="dateTime"
        nowMs={now}
        done={false}
      />
    );
    expect(screen.getByText("已逾期 · 今天 10:00")).toBeInTheDocument();
  });
});
