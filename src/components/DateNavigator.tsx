import { Ref, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { LocalDateKey } from "../domain/todoTypes";
import { addLocalDays, formatLocalDateLabel } from "../utils/date";
import { CalendarPopover } from "./CalendarPopover";

interface DateNavigatorProps {
  selectedDate: LocalDateKey;
  today: LocalDateKey;
  completionCounts?: ReadonlyMap<LocalDateKey, number>;
  scheduledCounts?: ReadonlyMap<LocalDateKey, number>;
  onChange: (date: LocalDateKey) => void;
  onOpenSearch?: () => void;
  searchTriggerRef?: Ref<HTMLButtonElement>;
}

const EMPTY_COMPLETION_COUNTS = new Map<LocalDateKey, number>();
const EMPTY_SCHEDULED_COUNTS = new Map<LocalDateKey, number>();

export function DateNavigator({
  selectedDate,
  today,
  completionCounts = EMPTY_COMPLETION_COUNTS,
  scheduledCounts = EMPTY_SCHEDULED_COUNTS,
  onChange,
  onOpenSearch,
  searchTriggerRef
}: DateNavigatorProps) {
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const isToday = selectedDate === today;
  const dateLabel = formatLocalDateLabel(selectedDate, today);

  function closeCalendar() {
    setIsCalendarOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <>
      <nav
        className={`date-navigator${isToday ? " is-today" : ""}${onOpenSearch ? " has-search" : ""}`}
        aria-label="切换工作日期"
      >
        <button
          type="button"
          className="date-arrow date-arrow-previous"
          onClick={() => onChange(addLocalDays(selectedDate, -1))}
          aria-label="前一天"
          title="前一天"
        >
          <ChevronLeft aria-hidden="true" />
        </button>

        <button
          ref={triggerRef}
          type="button"
          className="date-picker-trigger"
          onClick={() => setIsCalendarOpen(true)}
          aria-label={`选择日期，当前为${dateLabel}`}
          aria-haspopup="dialog"
          aria-expanded={isCalendarOpen}
          title="打开日历"
        >
          {dateLabel}
        </button>

        <button
          type="button"
          className="date-arrow date-arrow-next"
          onClick={() => onChange(addLocalDays(selectedDate, 1))}
          aria-label="后一天"
          title="后一天"
        >
          <ChevronRight aria-hidden="true" />
        </button>

        {!isToday && (
          <button
            ref={searchTriggerRef}
            type="button"
            className="today-button"
            onClick={() => onChange(today)}
          >
            今天
          </button>
        )}

        {onOpenSearch && (
          <button
            type="button"
            className="date-search-button"
            onClick={onOpenSearch}
            aria-label="搜索任务"
            title="搜索任务"
          >
            <Search aria-hidden="true" />
          </button>
        )}
      </nav>

      <CalendarPopover
        open={isCalendarOpen}
        selectedDate={selectedDate}
        today={today}
        completionCounts={completionCounts}
        scheduledCounts={scheduledCounts}
        onSelect={onChange}
        onClose={closeCalendar}
      />
    </>
  );
}
