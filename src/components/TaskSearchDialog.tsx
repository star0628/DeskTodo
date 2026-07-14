import { RefObject, useEffect, useMemo, useRef, useState } from "react";
import { Check, Clock3, Search, Star, X } from "lucide-react";
import { searchTasks, TaskSearchFilter, TaskSearchResult } from "../domain/taskSearch";
import { AppState, LocalDateKey } from "../domain/todoTypes";
import { DialogHeader } from "./DialogHeader";

interface TaskSearchDialogProps {
  open: boolean;
  state: AppState;
  today: LocalDateKey;
  onNavigate: (date: LocalDateKey, targetId: string) => void;
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
}

export function TaskSearchDialog({
  open,
  state,
  today,
  onNavigate,
  onClose,
  returnFocusRef
}: TaskSearchDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const shouldRestoreFocusRef = useRef(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<TaskSearchFilter>("all");
  const results = useMemo(
    () => searchTasks(state, query, today, filter),
    [filter, query, state, today]
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function navigate(result: TaskSearchResult) {
    const date = result.completedOn ?? today;
    onNavigate(date, result.status === "completed" ? result.id : result.taskId);
    onClose();
  }

  function closeDialog() {
    shouldRestoreFocusRef.current = true;
    onClose();
  }

  function restoreTriggerFocus() {
    if (!shouldRestoreFocusRef.current) return;
    shouldRestoreFocusRef.current = false;
    window.setTimeout(() => returnFocusRef?.current?.focus({ preventScroll: true }), 0);
  }

  return (
    <dialog
      ref={dialogRef}
      className="task-search-dialog dialog-surface dialog-sheet"
      aria-labelledby="task-search-title"
      onClose={restoreTriggerFocus}
      onCancel={(event) => {
        event.preventDefault();
        closeDialog();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) closeDialog();
      }}
    >
      <div className="task-search-panel">
        <DialogHeader
          titleId="task-search-title"
          title="搜索任务"
          closeLabel="关闭搜索"
          onClose={closeDialog}
        />

        <label className="task-search-input">
          <Search aria-hidden="true" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索任务和子任务"
            aria-label="搜索任务和子任务"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="清空搜索">
              <X aria-hidden="true" />
            </button>
          )}
        </label>

        <div className="task-search-filters" aria-label="搜索范围">
          <FilterButton label="全部" value="all" current={filter} onChange={setFilter} />
          <FilterButton label="未完成" value="open" current={filter} onChange={setFilter} />
          <FilterButton label="已完成" value="completed" current={filter} onChange={setFilter} />
        </div>

        <section className="task-search-results" aria-live="polite">
          {!query.trim() ? (
            <p className="task-search-empty">输入关键词开始搜索。</p>
          ) : results.length === 0 ? (
            <p className="task-search-empty">没有找到匹配任务。</p>
          ) : (
            results.map((result) => (
              <button
                key={result.id}
                type="button"
                className="task-search-result"
                onClick={() => navigate(result)}
              >
                <span className="task-search-result-icon" aria-hidden="true">
                  {result.status === "completed" ? <Check /> : <Clock3 />}
                </span>
                <span className="task-search-result-copy">
                  {result.parentTitle && <small>{result.parentTitle}</small>}
                  <strong>{result.title}</strong>
                </span>
                <span className="task-search-result-meta">
                  {result.important && <Star aria-label="重要任务" fill="currentColor" />}
                  {formatResultStatus(result)}
                </span>
              </button>
            ))
          )}
        </section>
      </div>
    </dialog>
  );
}

interface FilterButtonProps {
  label: string;
  value: TaskSearchFilter;
  current: TaskSearchFilter;
  onChange: (filter: TaskSearchFilter) => void;
}

function FilterButton({ label, value, current, onChange }: FilterButtonProps) {
  return (
    <button
      type="button"
      aria-pressed={current === value}
      onClick={() => onChange(value)}
    >
      {label}
    </button>
  );
}

function formatResultStatus(result: TaskSearchResult): string {
  if (result.completedOn) return formatDate(result.completedOn);
  if (result.status === "scheduled" && result.scheduledFor) {
    return `计划 ${formatDate(result.scheduledFor)}`;
  }
  return "未完成";
}

function formatDate(value: LocalDateKey): string {
  const [, month, day] = value.split("-").map(Number);
  return `${month}月${day}日`;
}
