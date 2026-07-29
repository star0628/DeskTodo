import { useEffect, useRef } from "react";
import { CalendarDays, Check, MapPin, Plus } from "lucide-react";
import type { LocalDateKey } from "../domain/todoTypes";
import type {
  CalendarEvent,
  CalendarSource
} from "../calendar/domain/calendarTypes";
import { formatLocalDateLabel } from "../utils/date";
import { DialogHeader } from "./DialogHeader";

interface CalendarEventsDialogProps {
  open: boolean;
  date: LocalDateKey;
  today: LocalDateKey;
  events: CalendarEvent[];
  sources: CalendarSource[];
  importedEventRefs: ReadonlySet<string>;
  canAdd: boolean;
  onAddEvent: (event: CalendarEvent) => void;
  onClose: () => void;
}

export function CalendarEventsDialog({
  open,
  date,
  today,
  events,
  sources,
  importedEventRefs,
  canAdd,
  onAddEvent,
  onClose
}: CalendarEventsDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const sourceById = new Map(sources.map((source) => [source.id, source]));

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function requestClose() {
    const dialog = dialogRef.current;
    if (dialog?.open) dialog.close();
    else onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      className="calendar-events-dialog dialog-surface dialog-sheet"
      aria-labelledby="calendar-events-title"
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <div className="calendar-events-panel">
        <DialogHeader
          titleId="calendar-events-title"
          title="Apple 日历"
          subtitle={formatLocalDateLabel(date, today)}
          closeLabel="关闭日程"
          onClose={requestClose}
        />
        <div className="calendar-events-list">
          {events.map((event) => {
            const source = sourceById.get(event.sourceId);
            const imported = importedEventRefs.has(event.id);
            return (
              <article key={event.id} className="calendar-event-detail">
                <span
                  className="calendar-event-accent"
                  style={{ backgroundColor: source?.color }}
                  aria-hidden="true"
                />
                <div className="calendar-event-detail-copy">
                  <div className="calendar-event-detail-heading">
                    <CalendarDays aria-hidden="true" />
                    <strong>{event.title}</strong>
                    <button
                      type="button"
                      className="calendar-event-detail-add icon-button"
                      disabled={!canAdd || imported}
                      aria-label={
                        imported
                          ? `“${event.title}”已添加到 Day Todo`
                          : canAdd
                            ? `将“${event.title}”添加到 Day Todo`
                            : "过去日期不能添加到 Day Todo"
                      }
                      title={imported ? "已添加" : "添加到 Day Todo"}
                      onClick={() => onAddEvent(event)}
                    >
                      {imported ? (
                        <Check aria-hidden="true" />
                      ) : (
                        <Plus aria-hidden="true" />
                      )}
                    </button>
                  </div>
                  <p>{formatCalendarEventTime(event, date)}</p>
                  {event.location && (
                    <p className="calendar-event-location">
                      <MapPin aria-hidden="true" />
                      {event.location}
                    </p>
                  )}
                  {event.description && (
                    <p className="calendar-event-description">{event.description}</p>
                  )}
                  <small>{source?.name ?? "Apple 日历"}</small>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </dialog>
  );
}

export function formatCalendarEventTime(
  event: CalendarEvent,
  selectedDate: LocalDateKey
): string {
  if (event.time.kind === "allDay") return "全天";
  const start = new Date(event.time.startsAt);
  const end = new Date(event.time.endsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "时间未知";
  const formatter = new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
  if (start.getTime() === end.getTime()) return formatter.format(start);
  const selectedStart = new Date(
    Number(selectedDate.slice(0, 4)),
    Number(selectedDate.slice(5, 7)) - 1,
    Number(selectedDate.slice(8, 10))
  );
  const selectedEnd = new Date(selectedStart);
  selectedEnd.setDate(selectedEnd.getDate() + 1);
  if (start < selectedStart && end > selectedEnd) return "持续全天";
  if (start < selectedStart) return `至 ${formatter.format(end)}`;
  if (end > selectedEnd) return `${formatter.format(start)} 起`;
  return `${formatter.format(start)}–${formatter.format(end)}`;
}
