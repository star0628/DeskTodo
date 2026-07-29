import type { TodoTimeBlock } from "../../domain/todoTypes";
import type { CalendarEvent } from "./calendarTypes";

export function calendarEventToTodoTimeBlock(
  event: CalendarEvent
): TodoTimeBlock {
  return event.time.kind === "allDay"
    ? {
        kind: "allDay",
        startOn: event.time.startOn,
        endExclusiveOn: event.time.endExclusiveOn
      }
    : {
        kind: "timed",
        startsAt: event.time.startsAt,
        endsAt: event.time.endsAt
      };
}
