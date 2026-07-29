import { isTauriRuntime } from "../../persistence";
import type { CalendarStateRepository } from "./calendarStateRepository";
import { localCalendarStore } from "./localCalendarStore";
import { tauriCalendarStore } from "./tauriCalendarStore";

export { fallbackCalendarState, isCalendarState, parseCalendarState } from "./calendarStateSchema";
export type {
  CalendarLoadStatus,
  CalendarStateRepository,
  LoadCalendarStateResult
} from "./calendarStateRepository";

export const calendarStateRepository: CalendarStateRepository = isTauriRuntime()
  ? tauriCalendarStore
  : localCalendarStore;

