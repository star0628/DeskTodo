import { useEffect, useId, useMemo, useState } from "react";
import { DayPicker } from "@daypicker/react";
import { zhCN } from "@daypicker/react/locale";
import type { LocalDateKey } from "../domain/todoTypes";
import { localDateKeyToDate, toLocalDateKey } from "../utils/date";

type TimeBlockEditorKind = "allDay" | "timed";
type TimeBlockEndpoint = "start" | "end";

interface TimeBlockEditorProps {
  kind: TimeBlockEditorKind;
  startDate: LocalDateKey;
  endDate: LocalDateKey;
  startTime: string;
  endTime: string;
  onStartDateChange: (value: LocalDateKey) => void;
  onEndDateChange: (value: LocalDateKey) => void;
  onStartTimeChange: (value: string) => void;
  onEndTimeChange: (value: string) => void;
}

export function TimeBlockEditor({
  kind,
  startDate,
  endDate,
  startTime,
  endTime,
  onStartDateChange,
  onEndDateChange,
  onStartTimeChange,
  onEndTimeChange
}: TimeBlockEditorProps) {
  const instanceId = useId();
  const endpointRadioName = `time-block-endpoint-${instanceId}`;
  const [activeEndpoint, setActiveEndpoint] =
    useState<TimeBlockEndpoint>("start");
  const activeDate = activeEndpoint === "start" ? startDate : endDate;
  const [calendarMonth, setCalendarMonth] = useState(() =>
    localDateKeyToDate(activeDate)
  );

  useEffect(() => {
    setCalendarMonth(localDateKeyToDate(activeDate));
  }, [activeDate, activeEndpoint]);

  const calendarModifiers = useMemo(() => {
    const rangeStart = localDateKeyToDate(startDate);
    const rangeEnd = localDateKeyToDate(endDate);
    return {
      timeBlockStart: rangeStart,
      timeBlockEnd: rangeEnd,
      ...(startDate < endDate
        ? { timeBlockMiddle: { after: rangeStart, before: rangeEnd } }
        : {})
    };
  }, [endDate, startDate]);

  const activeTime = activeEndpoint === "start" ? startTime : endTime;
  const activeTimeLabel = activeEndpoint === "start" ? "开始时间" : "结束时间";

  function selectDate(date: Date | undefined) {
    if (!date) return;
    const dateKey = toLocalDateKey(date);
    if (activeEndpoint === "start") onStartDateChange(dateKey);
    else onEndDateChange(dateKey);
    setCalendarMonth(date);
  }

  function changeTime(value: string) {
    if (activeEndpoint === "start") onStartTimeChange(value);
    else onEndTimeChange(value);
  }

  return (
    <div className="schedule-time-editor">
      <fieldset className="deadline-display-field time-block-endpoint-field">
        <legend>编辑端点</legend>
        <div className="time-block-endpoint-options">
          <label>
            <input
              type="radio"
              name={endpointRadioName}
              checked={activeEndpoint === "start"}
              onChange={() => setActiveEndpoint("start")}
            />
            <span>
              <strong>开始</strong>
              <small>{formatEndpointValue(startDate, kind, startTime)}</small>
            </span>
          </label>
          <label>
            <input
              type="radio"
              name={endpointRadioName}
              checked={activeEndpoint === "end"}
              onChange={() => setActiveEndpoint("end")}
            />
            <span>
              <strong>结束</strong>
              <small>{formatEndpointValue(endDate, kind, endTime)}</small>
            </span>
          </label>
        </div>
      </fieldset>

      <div
        className="schedule-calendar schedule-time-calendar"
        aria-label={`选择${activeEndpoint === "start" ? "开始" : "结束"}日期`}
      >
        <DayPicker
          mode="single"
          required
          locale={zhCN}
          weekStartsOn={1}
          selected={localDateKeyToDate(activeDate)}
          month={calendarMonth}
          onMonthChange={setCalendarMonth}
          showOutsideDays
          fixedWeeks
          modifiers={calendarModifiers}
          modifiersClassNames={{
            timeBlockStart: "time-block-range-start",
            timeBlockMiddle: "time-block-range-middle",
            timeBlockEnd: "time-block-range-end"
          }}
          formatters={{
            formatCaption: (date) =>
              `${date.getFullYear()}年${date.getMonth() + 1}月`,
            formatWeekdayName: (date) => "日一二三四五六"[date.getDay()]
          }}
          onSelect={selectDate}
        />
      </div>

      {kind === "timed" && (
        <label className="deadline-time-field time-block-active-time-field">
          <span>{activeTimeLabel}</span>
          <input
            type="time"
            step="60"
            aria-label={activeTimeLabel}
            value={activeTime}
            onChange={(event) => changeTime(event.target.value)}
          />
        </label>
      )}
    </div>
  );
}

function formatEndpointValue(
  dateKey: LocalDateKey,
  kind: TimeBlockEditorKind,
  time: string
): string {
  const [, month, day] = dateKey.split("-");
  const dateLabel = `${Number(month)}月${Number(day)}日`;
  return kind === "timed" ? `${dateLabel} · ${time}` : dateLabel;
}
