// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type {
  CalendarEvent,
  CalendarSource
} from "../calendar/domain/calendarTypes";
import { localDeadlineToIso } from "../domain/deadline";
import { CalendarAgenda } from "./CalendarAgenda";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});

afterEach(cleanup);

const SOURCE: CalendarSource = {
  id: "source-1",
  name: "工作",
  color: "#4da3ff",
  region: "global",
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
};

function item(index: number): CalendarEvent {
  return {
    id: `event-${index}`,
    sourceId: "source-1",
    uid: `event-${index}`,
    recurrenceId: null,
    title: `日程 ${index}`,
    location: index === 1 ? "会议室" : "",
    description: index === 1 ? "只读详情" : "",
    time: {
      kind: "allDay",
      startOn: "2026-07-29",
      endExclusiveOn: "2026-07-30"
    }
  };
}

describe("CalendarAgenda", () => {
  it("renders at most two compact rows and opens the full read-only list", async () => {
    const user = userEvent.setup();
    render(
      <CalendarAgenda
        date="2026-07-29"
        today="2026-07-29"
        events={[item(1), item(2), item(3)]}
        sources={[SOURCE]}
        collapsed={false}
        importedEventRefs={new Set()}
        onCollapsedChange={vi.fn()}
        onAddEvent={vi.fn()}
      />
    );

    const agenda = screen.getByRole("region", { name: "Apple 日历，共3项" });
    expect(agenda).toBeInTheDocument();
    expect(screen.getByText("另有 1 项")).toBeInTheDocument();
    expect(within(agenda).queryByText("日程 3")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Apple 日历/ }));

    const dialog = screen.getByRole("dialog", { name: "Apple 日历" });
    expect(within(dialog).getByText("日程 3")).toBeInTheDocument();
    expect(within(dialog).getByText("会议室")).toBeInTheDocument();
    expect(within(dialog).queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("renders nothing when the selected date has no calendar events", () => {
    const { container } = render(
      <CalendarAgenda
        date="2026-07-29"
        today="2026-07-29"
        events={[]}
        sources={[SOURCE]}
        collapsed={false}
        importedEventRefs={new Set()}
        onCollapsedChange={vi.fn()}
        onAddEvent={vi.fn()}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("collapses the compact rows while keeping the full-list entry point", async () => {
    const user = userEvent.setup();
    const onCollapsedChange = vi.fn();
    render(
      <CalendarAgenda
        date="2026-07-29"
        today="2026-07-29"
        events={[item(1), item(2)]}
        sources={[SOURCE]}
        collapsed
        importedEventRefs={new Set()}
        onCollapsedChange={onCollapsedChange}
        onAddEvent={vi.fn()}
      />
    );

    expect(
      within(screen.getByRole("region", { name: "Apple 日历，共2项" })).queryByText(
        "日程 1"
      )
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Apple 日历/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "展开 Apple 日历摘要" }));
    expect(onCollapsedChange).toHaveBeenCalledWith(false);
  });

  it("prefills an editable Todo copy from the compact-row plus button", async () => {
    const user = userEvent.setup();
    const onAddEvent = vi.fn();
    render(
      <CalendarAgenda
        date="2026-07-29"
        today="2026-07-29"
        events={[item(1)]}
        sources={[SOURCE]}
        collapsed={false}
        importedEventRefs={new Set()}
        onCollapsedChange={vi.fn()}
        onAddEvent={onAddEvent}
      />
    );

    await user.click(
      screen.getByRole("button", { name: "将“日程 1”添加到 Day Todo" })
    );
    const dialog = screen.getByRole("dialog", { name: "添加到 Day Todo" });
    const titleInput = within(dialog).getByLabelText("任务名称");
    expect(titleInput).toHaveValue("日程 1");
    await user.clear(titleInput);
    await user.type(titleInput, "节日日程");
    await user.click(within(dialog).getByRole("button", { name: "添加" }));

    expect(onAddEvent).toHaveBeenCalledWith({
      title: "节日日程",
      scheduledFor: "2026-07-29",
      timeBlock: {
        kind: "allDay",
        startOn: "2026-07-29",
        endExclusiveOn: "2026-07-30"
      },
      calendarEventRef: "event-1"
    });
  });

  it("marks an already imported event and disables duplicate addition", () => {
    render(
      <CalendarAgenda
        date="2026-07-29"
        today="2026-07-29"
        events={[item(1)]}
        sources={[SOURCE]}
        collapsed={false}
        importedEventRefs={new Set(["event-1"])}
        onCollapsedChange={vi.fn()}
        onAddEvent={vi.fn()}
      />
    );

    expect(
      screen.getByRole("button", { name: "“日程 1”已添加到 Day Todo" })
    ).toBeDisabled();
  });

  it("edits a timed Apple event with the shared in-app calendar", async () => {
    const user = userEvent.setup();
    const onAddEvent = vi.fn();
    const timedEvent: CalendarEvent = {
      ...item(1),
      id: "timed-event",
      title: "晚间会议",
      time: {
        kind: "timed",
        startsAt: localDeadlineToIso("2026-07-29", "19:00")!,
        endsAt: localDeadlineToIso("2026-07-29", "20:00")!,
        timeZone: "Asia/Shanghai"
      }
    };
    const { container } = render(
      <CalendarAgenda
        date="2026-07-29"
        today="2026-07-29"
        events={[timedEvent]}
        sources={[SOURCE]}
        collapsed={false}
        importedEventRefs={new Set()}
        onCollapsedChange={vi.fn()}
        onAddEvent={onAddEvent}
      />
    );

    await user.click(
      screen.getByRole("button", { name: "将“晚间会议”添加到 Day Todo" })
    );
    const dialog = screen.getByRole("dialog", { name: "添加到 Day Todo" });
    expect(container.querySelector('input[type="datetime-local"]')).toBeNull();
    expect(within(dialog).getByLabelText("开始时间")).toHaveValue("19:00");
    await user.click(within(dialog).getByRole("radio", { name: /结束/ }));
    fireEvent.change(within(dialog).getByLabelText("结束时间"), {
      target: { value: "20:30" }
    });
    await user.click(within(dialog).getByRole("button", { name: "添加" }));

    expect(onAddEvent).toHaveBeenCalledWith({
      title: "晚间会议",
      scheduledFor: "2026-07-29",
      timeBlock: {
        kind: "timed",
        startsAt: localDeadlineToIso("2026-07-29", "19:00"),
        endsAt: localDeadlineToIso("2026-07-29", "20:30")
      },
      calendarEventRef: "timed-event"
    });
  });
});
