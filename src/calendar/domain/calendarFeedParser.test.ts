import { describe, expect, it } from "vitest";
import { CalendarParseError, parseCalendarFeed } from "./calendarFeedParser";

function calendar(...components: string[]) {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//DeskTodo Tests//EN",
    "X-WR-CALNAME:测试日历",
    ...components,
    "END:VCALENDAR",
    ""
  ].join("\r\n");
}

function event(...lines: string[]) {
  return ["BEGIN:VEVENT", ...lines, "END:VEVENT"].join("\r\n");
}

const RANGE = {
  sourceId: "source-1",
  rangeStart: "2026-07-01",
  rangeEndExclusive: "2026-08-10"
} as const;

describe("calendarFeedParser", () => {
  it("parses timed, all-day, folded and escaped Apple-compatible fields", () => {
    const feed = calendar(
      event(
        "UID:all-day",
        "DTSTART;VALUE=DATE:20260729",
        "DTEND;VALUE=DATE:20260731",
        "SUMMARY:出差",
        "LOCATION:上海"
      ),
      event(
        "UID:meeting",
        "DTSTART:20260729T010000Z",
        "DTEND:20260729T020000Z",
        "SUMMARY:项目\\, 周会",
        "DESCRIPTION:第一行\\n第二行",
        "LOCATION:会议",
        " 室"
      )
    );

    const result = parseCalendarFeed(feed, RANGE);

    expect(result.suggestedName).toBe("测试日历");
    expect(result.events).toHaveLength(2);
    expect(result.events[0]).toMatchObject({
      uid: "all-day",
      title: "出差",
      time: {
        kind: "allDay",
        startOn: "2026-07-29",
        endExclusiveOn: "2026-07-31"
      }
    });
    expect(result.events[1]).toMatchObject({
      uid: "meeting",
      title: "项目, 周会",
      description: "第一行\n第二行",
      location: "会议室",
      time: { kind: "timed" }
    });
  });

  it("uses an embedded VTIMEZONE instead of the Windows local zone", () => {
    const feed = calendar(
      [
        "BEGIN:VTIMEZONE",
        "TZID:Asia/Shanghai",
        "BEGIN:STANDARD",
        "DTSTART:19700101T000000",
        "TZOFFSETFROM:+0800",
        "TZOFFSETTO:+0800",
        "TZNAME:CST",
        "END:STANDARD",
        "END:VTIMEZONE"
      ].join("\r\n"),
      event(
        "UID:zoned",
        "DTSTART;TZID=Asia/Shanghai:20260729T090000",
        "DTEND;TZID=Asia/Shanghai:20260729T100000",
        "SUMMARY:带时区日程"
      )
    );

    const result = parseCalendarFeed(feed, RANGE);

    expect(result.events[0]).toMatchObject({
      time: {
        kind: "timed",
        startsAt: "2026-07-29T01:00:00.000Z",
        endsAt: "2026-07-29T02:00:00.000Z",
        timeZone: "Asia/Shanghai"
      }
    });
  });

  it("expands recurrence, applies EXDATE, and uses an exception instance", () => {
    const feed = calendar(
      event(
        "UID:daily",
        "DTSTART:20260728T010000Z",
        "DTEND:20260728T020000Z",
        "RRULE:FREQ=DAILY;COUNT=4",
        "EXDATE:20260729T010000Z",
        "SUMMARY:晨会"
      ),
      event(
        "UID:daily",
        "RECURRENCE-ID:20260730T010000Z",
        "DTSTART:20260730T030000Z",
        "DTEND:20260730T040000Z",
        "SUMMARY:改期晨会"
      )
    );

    const result = parseCalendarFeed(feed, RANGE);

    expect(result.events.map((item) => item.title)).toEqual([
      "晨会",
      "改期晨会",
      "晨会"
    ]);
    expect(result.events.map((item) => item.recurrenceId)).toEqual([
      "20260728T010000Z",
      "20260730T010000Z",
      "20260731T010000Z"
    ]);
  });

  it("omits cancelled masters and cancelled exception instances", () => {
    const feed = calendar(
      event(
        "UID:cancelled-master",
        "DTSTART;VALUE=DATE:20260729",
        "STATUS:CANCELLED",
        "SUMMARY:取消日程"
      ),
      event(
        "UID:series",
        "DTSTART;VALUE=DATE:20260729",
        "RRULE:FREQ=DAILY;COUNT=2",
        "SUMMARY:系列日程"
      ),
      event(
        "UID:series",
        "RECURRENCE-ID;VALUE=DATE:20260730",
        "DTSTART;VALUE=DATE:20260730",
        "STATUS:CANCELLED",
        "SUMMARY:取消实例"
      )
    );

    const result = parseCalendarFeed(feed, RANGE);

    expect(result.events).toHaveLength(1);
    expect(result.events[0].uid).toBe("series");
    expect(result.events[0].time).toMatchObject({ startOn: "2026-07-29" });
  });

  it("builds source-scoped stable IDs for duplicate UIDs", () => {
    const feed = calendar(
      event(
        "UID:shared-uid",
        "DTSTART;VALUE=DATE:20260729",
        "SUMMARY:共享 UID"
      )
    );

    const first = parseCalendarFeed(feed, RANGE).events[0];
    const again = parseCalendarFeed(feed, RANGE).events[0];
    const other = parseCalendarFeed(feed, { ...RANGE, sourceId: "source-2" }).events[0];

    expect(first.id).toBe(again.id);
    expect(first.id).not.toBe(other.id);
  });

  it("returns a sanitized parser error for malformed input", () => {
    expect(() => parseCalendarFeed("not a calendar", RANGE)).toThrow(
      CalendarParseError
    );
    try {
      parseCalendarFeed("not a calendar", RANGE);
    } catch (error) {
      expect(error).toMatchObject({
        code: "calendar_format_invalid",
        message: "无法解析 Apple 日历内容。"
      });
      expect(String(error)).not.toContain("not a calendar");
    }
  });
});
