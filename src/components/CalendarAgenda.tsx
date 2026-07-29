import { useState } from "react";
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Plus
} from "lucide-react";
import type { LocalDateKey } from "../domain/todoTypes";
import type {
  CalendarEvent,
  CalendarSource
} from "../calendar/domain/calendarTypes";
import {
  CalendarEventsDialog,
  formatCalendarEventTime
} from "./CalendarEventsDialog";
import {
  CalendarEventToTodoDialog,
  type CalendarTodoDraft
} from "./CalendarEventToTodoDialog";

interface CalendarAgendaProps {
  date: LocalDateKey;
  today: LocalDateKey;
  events: CalendarEvent[];
  sources: CalendarSource[];
  collapsed: boolean;
  importedEventRefs: ReadonlySet<string>;
  onCollapsedChange: (collapsed: boolean) => void;
  onAddEvent: (draft: CalendarTodoDraft) => void;
}

export function CalendarAgenda({
  date,
  today,
  events,
  sources,
  collapsed,
  importedEventRefs,
  onCollapsedChange,
  onAddEvent
}: CalendarAgendaProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [importEvent, setImportEvent] = useState<CalendarEvent | null>(null);
  if (events.length === 0) return null;
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const visibleEvents = events.slice(0, 2);

  return (
    <>
      <section
        className={`calendar-agenda${collapsed ? " is-collapsed" : ""}`}
        aria-label={`Apple 日历，共${events.length}项`}
      >
        <div className="calendar-agenda-heading">
          <button
            type="button"
            className="calendar-agenda-heading-main"
            onClick={() => setIsOpen(true)}
          >
            <span>
              <CalendarDays aria-hidden="true" />
              Apple 日历
            </span>
            <span>
              {collapsed || events.length <= visibleEvents.length
                ? `${events.length} 项`
                : `另有 ${events.length - visibleEvents.length} 项`}
              <ChevronRight aria-hidden="true" />
            </span>
          </button>
          <button
            type="button"
            className="calendar-agenda-collapse"
            aria-expanded={!collapsed}
            aria-controls="calendar-agenda-events"
            aria-label={collapsed ? "展开 Apple 日历摘要" : "折叠 Apple 日历摘要"}
            title={collapsed ? "展开摘要" : "折叠摘要"}
            onClick={() => onCollapsedChange(!collapsed)}
          >
            {collapsed ? (
              <ChevronDown aria-hidden="true" />
            ) : (
              <ChevronUp aria-hidden="true" />
            )}
          </button>
        </div>
        {!collapsed && (
          <div id="calendar-agenda-events" className="calendar-agenda-events">
            {visibleEvents.map((event) => {
              const imported = importedEventRefs.has(event.id);
              const canAdd = date >= today && !imported;
              return (
                <div key={event.id} className="calendar-agenda-event">
                  <button
                    type="button"
                    className="calendar-agenda-event-main"
                    onClick={() => setIsOpen(true)}
                  >
                    <span
                      className="calendar-event-dot"
                      style={{ backgroundColor: sourceById.get(event.sourceId)?.color }}
                      aria-hidden="true"
                    />
                    <strong>{event.title}</strong>
                    <small>{formatCalendarEventTime(event, date)}</small>
                  </button>
                  <button
                    type="button"
                    className="calendar-event-add icon-button"
                    disabled={!canAdd}
                    aria-label={
                      imported
                        ? `“${event.title}”已添加到 Day Todo`
                        : date < today
                          ? "过去日期不能添加到 Day Todo"
                          : `将“${event.title}”添加到 Day Todo`
                    }
                    title={
                      imported
                        ? "已添加"
                        : date < today
                          ? "过去日期不可添加"
                          : "添加到 Day Todo"
                    }
                    onClick={() => setImportEvent(event)}
                  >
                    {imported ? (
                      <Check aria-hidden="true" />
                    ) : (
                      <Plus aria-hidden="true" />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>
      <CalendarEventsDialog
        open={isOpen}
        date={date}
        today={today}
        events={events}
        sources={sources}
        importedEventRefs={importedEventRefs}
        canAdd={date >= today}
        onAddEvent={(event) => {
          setIsOpen(false);
          setImportEvent(event);
        }}
        onClose={() => setIsOpen(false)}
      />
      <CalendarEventToTodoDialog
        event={importEvent}
        selectedDate={date}
        today={today}
        onAdd={onAddEvent}
        onClose={() => setImportEvent(null)}
      />
    </>
  );
}
