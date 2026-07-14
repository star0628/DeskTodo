import { Clock3 } from "lucide-react";
import { getDeadlineDisplay, getDeadlineVisibleLabel } from "../domain/deadline";
import { DeadlineDisplayMode } from "../domain/todoTypes";

interface DeadlineMetaProps {
  deadlineAt: string;
  displayMode: DeadlineDisplayMode;
  nowMs: number;
  done: boolean;
}

export function DeadlineMeta({ deadlineAt, displayMode, nowMs, done }: DeadlineMetaProps) {
  const display = getDeadlineDisplay(deadlineAt, nowMs, done);
  if (!display) return null;

  const accessibleLabel = display.countdownLabel
    ? `截止 ${display.dateLabel}，${display.countdownLabel}`
    : `截止 ${display.dateLabel}`;
  const visibleLabel = getDeadlineVisibleLabel(display, displayMode);

  return (
    <span
      className={`deadline-meta deadline-${display.urgency}`}
      aria-label={accessibleLabel}
      title={accessibleLabel}
    >
      <Clock3 aria-hidden="true" />
      <strong className="deadline-label">{visibleLabel}</strong>
    </span>
  );
}
