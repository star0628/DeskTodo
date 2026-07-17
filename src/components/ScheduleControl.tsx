import { useEffect, useId, useMemo, useRef, useState } from "react";
import { CalendarClock } from "lucide-react";
import { DayPicker } from "@daypicker/react";
import { zhCN } from "@daypicker/react/locale";
import {
  createDeadlinePattern,
  deadlineToLocalParts,
  getDeadlineDisplay,
  localDeadlineToIso
} from "../domain/deadline";
import {
  getRecurrenceLabel,
  getWeekdayShortLabel,
  recurrenceRulesEqual,
  WEEKDAY_ORDER
} from "../domain/recurrence";
import {
  DeadlineDisplayMode,
  LocalDateKey,
  RecurrenceRule,
  Weekday
} from "../domain/todoTypes";
import {
  addLocalDays,
  formatLocalDateLabel,
  localDateKeyToDate,
  toLocalDateKey
} from "../utils/date";
import { DialogHeader } from "./DialogHeader";

interface ScheduleControlProps {
  scheduledFor: LocalDateKey | null;
  deadlineAt: string | null;
  deadlineDisplayMode: DeadlineDisplayMode;
  rule: RecurrenceRule | null;
  today: LocalDateKey;
  disabled?: boolean;
  onChange: (value: {
    scheduledFor: LocalDateKey | null;
    deadlineAt: string | null;
    deadlineDisplayMode: DeadlineDisplayMode;
    rule: RecurrenceRule | null;
  }) => void;
}

type ScheduleTab = "planned" | "deadline" | "recurrence";
type DraftKind = "none" | RecurrenceRule["kind"];

export function ScheduleControl({
  scheduledFor,
  deadlineAt,
  deadlineDisplayMode,
  rule,
  today,
  disabled = false,
  onChange
}: ScheduleControlProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const instanceId = useId();
  const titleId = `schedule-title-${instanceId}`;
  const radioName = `schedule-recurrence-kind-${instanceId}`;
  const displayModeRadioName = `schedule-deadline-display-${instanceId}`;
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ScheduleTab>("planned");
  const [draftScheduledFor, setDraftScheduledFor] =
    useState<LocalDateKey | null>(scheduledFor);
  const [plannedCalendarMonth, setPlannedCalendarMonth] = useState(() =>
    localDateKeyToDate(scheduledFor ?? today)
  );
  const [hasDeadline, setHasDeadline] = useState(deadlineAt !== null);
  const initialDeadline = getInitialDeadline(deadlineAt, today);
  const [deadlineDate, setDeadlineDate] = useState<LocalDateKey>(initialDeadline.date);
  const [deadlineTime, setDeadlineTime] = useState(initialDeadline.time);
  const [draftDisplayMode, setDraftDisplayMode] =
    useState<DeadlineDisplayMode>(deadlineDisplayMode);
  const [calendarMonth, setCalendarMonth] = useState(() =>
    localDateKeyToDate(initialDeadline.date)
  );
  const [draftKind, setDraftKind] = useState<DraftKind>(rule?.kind ?? "none");
  const [weekdays, setWeekdays] = useState<Weekday[]>(
    rule?.kind === "weekly" ? rule.weekdays : [localDateKeyToDate(today).getDay() as Weekday]
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) dialog.showModal();
    if (!isOpen && dialog.open) dialog.close();
  }, [isOpen]);

  const draftRule = useMemo<RecurrenceRule | null>(() => {
    if (draftKind === "none") return null;
    if (draftKind === "daily" || draftKind === "weekdays") return { kind: draftKind };
    return { kind: "weekly", weekdays };
  }, [draftKind, weekdays]);

  const draftDeadlineAt = hasDeadline
    ? localDeadlineToIso(deadlineDate, deadlineTime)
    : null;
  const error = getScheduleError(
    draftDeadlineAt,
    hasDeadline,
    draftRule,
    draftScheduledFor,
    today
  );
  const hasSchedule = scheduledFor !== null || deadlineAt !== null || rule !== null;
  const label = getScheduleLabel(scheduledFor, deadlineAt, rule, today);
  const isPlannedDateLocked = rule !== null;

  function openDialog() {
    const initial = getInitialDeadline(deadlineAt, today);
    setActiveTab(
      scheduledFor !== null ? "planned" : deadlineAt !== null || rule === null ? "deadline" : "recurrence"
    );
    setDraftScheduledFor(scheduledFor);
    setPlannedCalendarMonth(localDateKeyToDate(scheduledFor ?? today));
    setHasDeadline(deadlineAt !== null);
    setDeadlineDate(initial.date);
    setDeadlineTime(initial.time);
    setDraftDisplayMode(deadlineDisplayMode);
    setCalendarMonth(localDateKeyToDate(initial.date));
    setDraftKind(rule?.kind ?? "none");
    setWeekdays(
      rule?.kind === "weekly"
        ? rule.weekdays
        : [localDateKeyToDate(today).getDay() as Weekday]
    );
    setIsOpen(true);
  }

  function closeDialog() {
    setIsOpen(false);
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  }

  function saveSchedule() {
    if (error) return;
    const nextDeadlineAt = hasDeadline ? draftDeadlineAt : null;
    if (nextDeadlineAt === null && hasDeadline) return;
    if (
      draftScheduledFor !== scheduledFor ||
      nextDeadlineAt !== deadlineAt ||
      draftDisplayMode !== deadlineDisplayMode ||
      !recurrenceValuesEqual(rule, draftRule)
    ) {
      onChange({
        scheduledFor: draftScheduledFor,
        deadlineAt: nextDeadlineAt,
        deadlineDisplayMode: draftDisplayMode,
        rule: draftRule
      });
    }
    closeDialog();
  }

  function toggleWeekday(weekday: Weekday) {
    setWeekdays((current) =>
      current.includes(weekday)
        ? current.filter((item) => item !== weekday)
        : WEEKDAY_ORDER.filter((item) => current.includes(item) || item === weekday)
    );
  }

  function applyPreset(date: LocalDateKey, time: string) {
    setHasDeadline(true);
    setDeadlineDate(date);
    setDeadlineTime(time);
    setCalendarMonth(localDateKeyToDate(date));
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`icon-button schedule-trigger recurrence-trigger${hasSchedule ? " active" : ""}`}
        aria-label={`设置计划日期、截止时间或重复，当前${label}`}
        aria-pressed={hasSchedule}
        title={hasSchedule ? label : "设置计划日期、截止时间或重复"}
        disabled={disabled}
        onClick={openDialog}
      >
        <CalendarClock aria-hidden="true" />
      </button>

      <dialog
        ref={dialogRef}
        className="schedule-dialog dialog-surface dialog-compact"
        aria-labelledby={titleId}
        onCancel={(event) => {
          event.preventDefault();
          closeDialog();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeDialog();
        }}
      >
        <div className="schedule-panel">
          <DialogHeader
            titleId={titleId}
            title="时间安排"
            subtitle="计划日期、截止时间与重复规则"
            closeLabel="关闭时间安排"
            onClose={closeDialog}
          />

          <div className="schedule-tabs" role="tablist" aria-label="时间安排类型">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "planned"}
              onClick={() => setActiveTab("planned")}
            >
              计划日期
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "deadline"}
              onClick={() => setActiveTab("deadline")}
            >
              截止时间
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "recurrence"}
              onClick={() => setActiveTab("recurrence")}
            >
              重复
            </button>
          </div>

          <div className="schedule-content">
            {activeTab === "planned" ? (
              <section className="schedule-tab-panel" role="tabpanel" aria-label="计划日期">
                <div className="planned-date-summary">
                  <span>当前计划</span>
                  <strong>
                    {draftScheduledFor
                      ? formatLocalDateLabel(draftScheduledFor, today)
                      : "无指定日期"}
                  </strong>
                </div>

                {isPlannedDateLocked && (
                  <p className="schedule-planned-note">
                    重复任务的计划日期由重复规则生成。若要改期，请先关闭重复。
                  </p>
                )}

                <div className="deadline-presets" aria-label="常用计划日期">
                  <button
                    type="button"
                    disabled={isPlannedDateLocked}
                    onClick={() => setDraftScheduledFor(null)}
                  >
                    无日期
                  </button>
                  <button
                    type="button"
                    disabled={isPlannedDateLocked}
                    onClick={() => {
                      setDraftScheduledFor(today);
                      setPlannedCalendarMonth(localDateKeyToDate(today));
                    }}
                  >
                    今天
                  </button>
                  <button
                    type="button"
                    disabled={isPlannedDateLocked}
                    onClick={() => {
                      const tomorrow = addLocalDays(today, 1);
                      setDraftScheduledFor(tomorrow);
                      setPlannedCalendarMonth(localDateKeyToDate(tomorrow));
                    }}
                  >
                    明天
                  </button>
                </div>

                <div className="schedule-calendar">
                  <DayPicker
                    mode="single"
                    locale={zhCN}
                    weekStartsOn={1}
                    selected={
                      draftScheduledFor ? localDateKeyToDate(draftScheduledFor) : undefined
                    }
                    month={plannedCalendarMonth}
                    onMonthChange={setPlannedCalendarMonth}
                    disabled={
                      isPlannedDateLocked
                        ? true
                        : { before: localDateKeyToDate(today) }
                    }
                    showOutsideDays
                    fixedWeeks
                    formatters={{
                      formatCaption: (date) =>
                        `${date.getFullYear()}年${date.getMonth() + 1}月`,
                      formatWeekdayName: (date) => "日一二三四五六"[date.getDay()]
                    }}
                    onSelect={(date) => {
                      if (!date || isPlannedDateLocked) return;
                      setDraftScheduledFor(toLocalDateKey(date));
                      setPlannedCalendarMonth(date);
                    }}
                  />
                </div>
              </section>
            ) : activeTab === "deadline" ? (
              <section className="schedule-tab-panel" role="tabpanel" aria-label="截止时间">
                <label className="schedule-deadline-toggle">
                  <span>
                    <strong>设置截止时间</strong>
                    <small>最后 30 分钟显示秒倒计时</small>
                  </span>
                  <input
                    type="checkbox"
                    role="switch"
                    checked={hasDeadline}
                    onChange={(event) => setHasDeadline(event.target.checked)}
                  />
                </label>

                {hasDeadline && (
                  <>
                    <fieldset className="deadline-display-field">
                      <legend>任务行显示</legend>
                      <div className="deadline-display-options">
                        <label>
                          <input
                            type="radio"
                            name={displayModeRadioName}
                            value="countdown"
                            checked={draftDisplayMode === "countdown"}
                            onChange={() => setDraftDisplayMode("countdown")}
                          />
                          <span>倒计时</span>
                        </label>
                        <label>
                          <input
                            type="radio"
                            name={displayModeRadioName}
                            value="dateTime"
                            checked={draftDisplayMode === "dateTime"}
                            onChange={() => setDraftDisplayMode("dateTime")}
                          />
                          <span>截止时间</span>
                        </label>
                      </div>
                      <small>
                        {draftDisplayMode === "countdown"
                          ? "显示剩余时间，最后 30 分钟精确到秒"
                          : "显示今天、明天或具体截止日期"}
                      </small>
                    </fieldset>

                    <div className="deadline-presets" aria-label="常用截止时间">
                      <button type="button" onClick={() => applyPreset(today, "18:00")}>
                        今天 18:00
                      </button>
                      <button type="button" onClick={() => applyPreset(today, "22:00")}>
                        今天 22:00
                      </button>
                      <button
                        type="button"
                        onClick={() => applyPreset(addLocalDays(today, 1), "09:00")}
                      >
                        明天 09:00
                      </button>
                    </div>

                    <div className="schedule-calendar">
                      <DayPicker
                        mode="single"
                        required
                        locale={zhCN}
                        weekStartsOn={1}
                        selected={localDateKeyToDate(deadlineDate)}
                        month={calendarMonth}
                        onMonthChange={setCalendarMonth}
                        showOutsideDays
                        formatters={{
                          formatCaption: (date) =>
                            `${date.getFullYear()}年${date.getMonth() + 1}月`,
                          formatWeekdayName: (date) => "日一二三四五六"[date.getDay()]
                        }}
                        onSelect={(date) => {
                          if (date) {
                            setDeadlineDate(toLocalDateKey(date));
                            setCalendarMonth(date);
                          }
                        }}
                      />
                    </div>

                    <label className="deadline-time-field">
                      <span>时间</span>
                      <input
                        type="time"
                        step="60"
                        value={deadlineTime}
                        onChange={(event) => setDeadlineTime(event.target.value)}
                      />
                    </label>
                  </>
                )}
              </section>
            ) : (
              <section className="schedule-tab-panel" role="tabpanel" aria-label="重复规则">
                <fieldset className="recurrence-options">
                  <legend className="sr-only">重复频率</legend>
                  <RecurrenceOption
                    name={radioName}
                    label="不重复"
                    checked={draftKind === "none"}
                    onChange={() => setDraftKind("none")}
                  />
                  <RecurrenceOption
                    name={radioName}
                    label="每天"
                    checked={draftKind === "daily"}
                    onChange={() => setDraftKind("daily")}
                  />
                  <RecurrenceOption
                    name={radioName}
                    label="工作日"
                    detail="周一至周五"
                    checked={draftKind === "weekdays"}
                    onChange={() => setDraftKind("weekdays")}
                  />
                  <RecurrenceOption
                    name={radioName}
                    label="每周指定日期"
                    checked={draftKind === "weekly"}
                    onChange={() => setDraftKind("weekly")}
                  />
                </fieldset>

                {draftKind === "weekly" && (
                  <div className="weekday-picker" aria-label="选择每周重复日期">
                    {WEEKDAY_ORDER.map((weekday) => (
                      <button
                        key={weekday}
                        type="button"
                        aria-pressed={weekdays.includes(weekday)}
                        onClick={() => toggleWeekday(weekday)}
                      >
                        {getWeekdayShortLabel(weekday)}
                      </button>
                    ))}
                  </div>
                )}
              </section>
            )}

            {error && <p className="schedule-error">{error}</p>}
            <footer className="recurrence-footer schedule-footer">
              <button type="button" className="secondary-button" onClick={closeDialog}>
                取消
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={Boolean(error)}
                onClick={saveSchedule}
              >
                完成
              </button>
            </footer>
          </div>
        </div>
      </dialog>
    </>
  );
}

interface RecurrenceOptionProps {
  name: string;
  label: string;
  detail?: string;
  checked: boolean;
  onChange: () => void;
}

function RecurrenceOption({ name, label, detail, checked, onChange }: RecurrenceOptionProps) {
  return (
    <label className="recurrence-option">
      <input type="radio" name={name} checked={checked} onChange={onChange} />
      <span>
        <strong>{label}</strong>
        {detail && <small>{detail}</small>}
      </span>
    </label>
  );
}

function getInitialDeadline(
  deadlineAt: string | null,
  today: LocalDateKey
): { date: LocalDateKey; time: string } {
  return (deadlineAt ? deadlineToLocalParts(deadlineAt) : null) ?? {
    date: today,
    time: "22:00"
  };
}

function getScheduleError(
  deadlineAt: string | null,
  hasDeadline: boolean,
  rule: RecurrenceRule | null,
  scheduledFor: LocalDateKey | null,
  today: LocalDateKey
): string | null {
  if (scheduledFor !== null && scheduledFor < today) {
    return "计划日期不能早于今天。";
  }
  if (hasDeadline && deadlineAt === null) return "请选择有效的日期和时间。";
  if (rule?.kind === "weekly" && rule.weekdays.length === 0) {
    return "每周重复至少选择一天。";
  }
  if (rule && deadlineAt && !createDeadlinePattern(deadlineAt, scheduledFor ?? today)) {
    return "重复任务的截止时间需在本次任务之后 366 天内。";
  }
  return null;
}

function recurrenceValuesEqual(
  left: RecurrenceRule | null,
  right: RecurrenceRule | null
): boolean {
  if (left === null || right === null) return left === right;
  return recurrenceRulesEqual(left, right);
}

function getScheduleLabel(
  scheduledFor: LocalDateKey | null,
  deadlineAt: string | null,
  rule: RecurrenceRule | null,
  today: LocalDateKey
): string {
  const parts: string[] = [];
  if (scheduledFor) {
    parts.push(`计划 ${formatLocalDateLabel(scheduledFor, today)}`);
  }
  if (deadlineAt) {
    const display = getDeadlineDisplay(deadlineAt, Date.now(), false);
    if (display) parts.push(`截止 ${display.dateLabel}`);
  }
  if (rule) parts.push(`重复 ${getRecurrenceLabel(rule)}`);
  return parts.length > 0 ? parts.join("，") : "未设置";
}
