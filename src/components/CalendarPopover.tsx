import { useEffect, useMemo, useRef } from "react";
import { DayPicker, type Modifiers } from "@daypicker/react";
import { zhCN } from "@daypicker/react/locale";
import "@daypicker/react/style.css";
import { LocalDateKey } from "../domain/todoTypes";
import { localDateKeyToDate, toLocalDateKey } from "../utils/date";

interface CalendarPopoverProps {
  open: boolean;
  selectedDate: LocalDateKey;
  today: LocalDateKey;
  completionCounts: ReadonlyMap<LocalDateKey, number>;
  onSelect: (date: LocalDateKey) => void;
  onClose: () => void;
}

export function CalendarPopover({
  open,
  selectedDate,
  today,
  completionCounts,
  onSelect,
  onClose
}: CalendarPopoverProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const completedDates = useMemo(
    () => Array.from(completionCounts.keys(), localDateKeyToDate),
    [completionCounts]
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function requestClose() {
    const dialog = dialogRef.current;
    if (dialog?.open) {
      dialog.close();
    } else {
      onClose();
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="calendar-dialog dialog-surface dialog-popover"
      aria-label="选择工作日期"
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        requestClose();
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <DayPicker
        mode="single"
        required
        locale={zhCN}
        weekStartsOn={1}
        selected={localDateKeyToDate(selectedDate)}
        defaultMonth={localDateKeyToDate(selectedDate)}
        endMonth={localDateKeyToDate(today)}
        disabled={{ after: localDateKeyToDate(today) }}
        showOutsideDays
        autoFocus
        modifiers={{ hasCompletions: completedDates }}
        modifiersClassNames={{ hasCompletions: "calendar-day-has-completions" }}
        formatters={{
          formatCaption: (date) => `${date.getFullYear()}年${date.getMonth() + 1}月`,
          formatWeekdayName: (date) => "日一二三四五六"[date.getDay()]
        }}
        labels={{
          labelDayButton: (date, modifiers) =>
            formatCalendarDayLabel(date, modifiers, completionCounts.get(toLocalDateKey(date)) ?? 0)
        }}
        onSelect={(date) => {
          if (!date || date > localDateKeyToDate(today)) return;
          onSelect(toLocalDateKey(date));
          requestClose();
        }}
      />
    </dialog>
  );
}

export function formatCalendarDayLabel(
  date: Date,
  modifiers: Modifiers,
  completionCount: number
): string {
  const dateLabel = new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long"
  }).format(date);
  const parts = [modifiers.today ? `今天，${dateLabel}` : dateLabel];
  if (modifiers.selected) parts.push("已选择");
  if (completionCount > 0) parts.push(`完成${completionCount}项`);
  return parts.join("，");
}
