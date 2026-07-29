import type { CalendarState } from "../domain/calendarTypes";

export type CalendarLoadStatus = "ok" | "missing" | "migrated" | "invalid" | "error";

export interface LoadCalendarStateResult {
  state: CalendarState;
  status: CalendarLoadStatus;
}

export interface CalendarStateRepository {
  load(): Promise<LoadCalendarStateResult>;
  save(state: CalendarState): Promise<void>;
}
