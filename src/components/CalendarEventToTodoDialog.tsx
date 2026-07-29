import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { CalendarEvent } from "../calendar/domain/calendarTypes";
import { calendarEventToTodoTimeBlock } from "../calendar/domain/calendarTodoImport";
import {
  isValidTodoTimeBlock,
  todoTimeBlockIntersectsDate
} from "../domain/timeBlock";
import type { LocalDateKey, TodoTimeBlock } from "../domain/todoTypes";
import {
  addLocalDays,
  formatLocalDateLabel,
  isLocalDateKey,
  toLocalDateKey
} from "../utils/date";
import { localDeadlineToIso } from "../domain/deadline";
import { DialogHeader } from "./DialogHeader";
import { TimeBlockEditor } from "./TimeBlockEditor";

export interface CalendarTodoDraft {
  title: string;
  scheduledFor: LocalDateKey;
  timeBlock: TodoTimeBlock;
  calendarEventRef: string;
}

interface CalendarEventToTodoDialogProps {
  event: CalendarEvent | null;
  selectedDate: LocalDateKey;
  today: LocalDateKey;
  onAdd: (draft: CalendarTodoDraft) => void;
  onClose: () => void;
}

export function CalendarEventToTodoDialog({
  event,
  selectedDate,
  today,
  onAdd,
  onClose
}: CalendarEventToTodoDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = `calendar-todo-title-${useId()}`;
  const [title, setTitle] = useState("");
  const [scheduledFor, setScheduledFor] = useState<LocalDateKey>(selectedDate);
  const [allDayStart, setAllDayStart] = useState<LocalDateKey>(selectedDate);
  const [allDayEnd, setAllDayEnd] = useState<LocalDateKey>(selectedDate);
  const [timedStart, setTimedStart] = useState("");
  const [timedEnd, setTimedEnd] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (event && !dialog.open) dialog.showModal();
    if (!event && dialog.open) dialog.close();
  }, [event]);

  useEffect(() => {
    if (!event) return;
    const block = calendarEventToTodoTimeBlock(event);
    setTitle(event.title);
    setScheduledFor(selectedDate);
    if (block.kind === "allDay") {
      setAllDayStart(block.startOn);
      setAllDayEnd(addLocalDays(block.endExclusiveOn, -1));
    } else {
      setTimedStart(toDateTimeLocalInput(block.startsAt));
      setTimedEnd(toDateTimeLocalInput(block.endsAt));
    }
  }, [event, selectedDate]);

  const timeBlock = useMemo<TodoTimeBlock | null>(() => {
    if (!event) return null;
    if (event.time.kind === "allDay") {
      if (!isLocalDateKey(allDayStart) || !isLocalDateKey(allDayEnd)) return null;
      return {
        kind: "allDay",
        startOn: allDayStart,
        endExclusiveOn: addLocalDays(allDayEnd, 1)
      };
    }
    const startsAt = dateTimeLocalInputToIso(timedStart);
    const endsAt = dateTimeLocalInputToIso(timedEnd);
    return startsAt && endsAt ? { kind: "timed", startsAt, endsAt } : null;
  }, [allDayEnd, allDayStart, event, timedEnd, timedStart]);
  const timedStartParts = dateTimeLocalInputParts(timedStart) ?? {
    date: selectedDate,
    time: "09:00"
  };
  const timedEndParts = dateTimeLocalInputParts(timedEnd) ?? {
    date: selectedDate,
    time: "10:00"
  };

  const error = getDraftError(title, scheduledFor, timeBlock, today);

  function requestClose() {
    const dialog = dialogRef.current;
    if (dialog?.open) dialog.close();
    else onClose();
  }

  function submit() {
    if (!event || !timeBlock || error) return;
    onAdd({
      title: title.trim(),
      scheduledFor,
      timeBlock,
      calendarEventRef: event.id
    });
    requestClose();
  }

  return (
    <dialog
      ref={dialogRef}
      className="calendar-todo-dialog dialog-surface dialog-compact"
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(clickEvent) => {
        clickEvent.preventDefault();
        requestClose();
      }}
      onClick={(clickEvent) => {
        if (clickEvent.target === clickEvent.currentTarget) requestClose();
      }}
    >
      <div className="calendar-todo-panel">
        <DialogHeader
          titleId={titleId}
          title="添加到 Day Todo"
          subtitle={formatLocalDateLabel(selectedDate, today)}
          closeLabel="关闭添加日程"
          onClose={requestClose}
        />
        {event && (
          <div className="calendar-todo-form">
            <label>
              <span>任务名称</span>
              <input
                value={title}
                maxLength={200}
                autoFocus
                onChange={(changeEvent) => setTitle(changeEvent.target.value)}
              />
            </label>
            <label>
              <span>Day Todo 日期</span>
              <input
                type="date"
                min={today}
                value={scheduledFor}
                onChange={(changeEvent) =>
                  setScheduledFor(changeEvent.target.value as LocalDateKey)
                }
              />
            </label>
            <TimeBlockEditor
              kind={event.time.kind}
              startDate={
                event.time.kind === "allDay" ? allDayStart : timedStartParts.date
              }
              endDate={
                event.time.kind === "allDay" ? allDayEnd : timedEndParts.date
              }
              startTime={timedStartParts.time}
              endTime={timedEndParts.time}
              onStartDateChange={(date) => {
                if (event.time.kind === "allDay") {
                  setAllDayStart(date);
                } else {
                  setTimedStart(`${date}T${timedStartParts.time}`);
                }
              }}
              onEndDateChange={(date) => {
                if (event.time.kind === "allDay") {
                  setAllDayEnd(date);
                } else {
                  setTimedEnd(`${date}T${timedEndParts.time}`);
                }
              }}
              onStartTimeChange={(time) =>
                setTimedStart(`${timedStartParts.date}T${time}`)
              }
              onEndTimeChange={(time) =>
                setTimedEnd(`${timedEndParts.date}T${time}`)
              }
            />
            <p className="calendar-todo-note">
              这是独立副本；后续同步 Apple 日历不会覆盖 Todo 中的修改。
            </p>
            {error && (
              <p className="schedule-error" role="alert">
                {error}
              </p>
            )}
            <footer className="recurrence-footer schedule-footer">
              <button type="button" className="secondary-button" onClick={requestClose}>
                取消
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={Boolean(error)}
                onClick={submit}
              >
                添加
              </button>
            </footer>
          </div>
        )}
      </div>
    </dialog>
  );
}

function getDraftError(
  title: string,
  scheduledFor: string,
  timeBlock: TodoTimeBlock | null,
  today: LocalDateKey
): string | null {
  if (!title.trim()) return "请输入任务名称。";
  if (!isLocalDateKey(scheduledFor) || scheduledFor < today) {
    return "Day Todo 日期不能早于今天。";
  }
  if (!timeBlock || !isValidTodoTimeBlock(timeBlock)) {
    return "请输入有效的开始和结束时间。";
  }
  if (!todoTimeBlockIntersectsDate(timeBlock, scheduledFor)) {
    return "Day Todo 日期需要落在该日程的时间范围内。";
  }
  return null;
}

function toDateTimeLocalInput(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${toLocalDateKey(date)}T${twoDigits(date.getHours())}:${twoDigits(
    date.getMinutes()
  )}`;
}

function dateTimeLocalInputToIso(value: string): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(value);
  return match ? localDeadlineToIso(match[1], match[2]) : null;
}

function dateTimeLocalInputParts(
  value: string
): { date: LocalDateKey; time: string } | null {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(value);
  return match ? { date: match[1] as LocalDateKey, time: match[2] } : null;
}

function twoDigits(value: number): string {
  return String(value).padStart(2, "0");
}
