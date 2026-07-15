import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Trash2 } from "lucide-react";
import { DailyCompletionEntry } from "../domain/dailyViewSelectors";
import {
  HistoryDeleteTarget,
  HistoryDeletionPlan
} from "../domain/historyDeletion";
import { HistoryDeleteDialog } from "./HistoryDeleteDialog";

interface DailyHistoryListProps {
  entries: DailyCompletionEntry[];
  onCreateDeletePlan: (
    targets: readonly HistoryDeleteTarget[]
  ) => HistoryDeletionPlan | null;
  onConfirmDelete: (plan: HistoryDeletionPlan) => void;
}

export function DailyHistoryList({
  entries,
  onCreateDeletePlan,
  onConfirmDelete
}: DailyHistoryListProps) {
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const [pendingPlan, setPendingPlan] = useState<HistoryDeletionPlan | null>(null);
  const deleteTriggerRef = useRef<HTMLButtonElement>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);

  const deletableEntries = useMemo(
    () => entries.filter((entry) => entry.canDelete),
    [entries]
  );
  const selectedParentIds = useMemo(
    () =>
      new Set(
        entries.flatMap((entry) =>
          selectedKeys.has(entry.key) && entry.target.kind === "task"
            ? [entry.target.taskId]
            : []
        )
      ),
    [entries, selectedKeys]
  );
  const selectedEntries = useMemo(
    () =>
      entries.filter(
        (entry) =>
          selectedKeys.has(entry.key) ||
          (entry.target.kind === "subtask" && selectedParentIds.has(entry.target.parentId))
      ),
    [entries, selectedKeys, selectedParentIds]
  );
  const independentlySelectableEntries = useMemo(() => {
    const parentIds = new Set(
      deletableEntries.flatMap((entry) =>
        entry.target.kind === "task" ? [entry.target.taskId] : []
      )
    );
    return deletableEntries.filter(
      (entry) =>
        entry.target.kind !== "subtask" || !parentIds.has(entry.target.parentId)
    );
  }, [deletableEntries]);
  const allSelected =
    independentlySelectableEntries.length > 0 &&
    independentlySelectableEntries.every((entry) => selectedKeys.has(entry.key));
  const partlySelected = selectedKeys.size > 0 && !allSelected;

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = partlySelected;
  }, [partlySelected]);

  useEffect(() => {
    setSelectedKeys((current) => {
      const currentKeys = new Set(entries.map((entry) => entry.key));
      const next = new Set([...current].filter((key) => currentKeys.has(key)));
      return next.size === current.size && [...current].every((key) => next.has(key))
        ? current
        : next;
    });
  }, [entries]);

  useEffect(() => {
    if (!isSelecting || pendingPlan) return;
    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      exitSelectionMode();
    }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isSelecting, pendingPlan]);

  function exitSelectionMode() {
    setIsSelecting(false);
    setSelectedKeys(new Set());
  }

  function toggleEntry(entry: DailyCompletionEntry) {
    if (!entry.canDelete) return;
    if (
      entry.target.kind === "subtask" &&
      selectedParentIds.has(entry.target.parentId)
    ) {
      return;
    }

    setSelectedKeys((current) => {
      const next = new Set(current);
      if (next.has(entry.key)) {
        next.delete(entry.key);
        return next;
      }

      if (entry.target.kind === "task") {
        for (const candidate of entries) {
          if (
            candidate.target.kind === "subtask" &&
            candidate.target.parentId === entry.target.taskId
          ) {
            next.delete(candidate.key);
          }
        }
      }
      next.add(entry.key);
      return next;
    });
  }

  function toggleAll() {
    setSelectedKeys(
      allSelected
        ? new Set()
        : new Set(independentlySelectableEntries.map((entry) => entry.key))
    );
  }

  function requestDelete() {
    const selectedTargets = entries
      .filter((entry) => selectedKeys.has(entry.key))
      .map((entry) => entry.target);
    const plan = onCreateDeletePlan(selectedTargets);
    if (plan) setPendingPlan(plan);
  }

  function confirmDelete() {
    if (!pendingPlan) return;
    onConfirmDelete(pendingPlan);
    setPendingPlan(null);
    exitSelectionMode();
  }

  if (entries.length === 0) {
    return (
      <section className="empty-state">
        <p>这一天还没有完成记录。</p>
      </section>
    );
  }

  return (
    <section className="history-view" aria-label="当日完成记录">
      <header className="history-toolbar">
        {isSelecting ? (
          <>
            <button type="button" className="history-text-button" onClick={exitSelectionMode}>
              取消
            </button>
            <span className="history-selection-summary" aria-live="polite">
              已选 {selectedEntries.length} 条
            </span>
            <label className="history-select-all">
              <input
                ref={selectAllRef}
                type="checkbox"
                checked={allSelected}
                disabled={independentlySelectableEntries.length === 0}
                onChange={toggleAll}
              />
              <span>全选</span>
            </label>
          </>
        ) : (
          <>
            <span className="history-toolbar-label">完成记录 {entries.length}</span>
            <button
              type="button"
              className="history-text-button"
              disabled={deletableEntries.length === 0}
              onClick={() => setIsSelecting(true)}
            >
              选择
            </button>
          </>
        )}
      </header>

      <div className="history-list">
        {entries.map((entry) => {
          const coveredByParent =
            entry.target.kind === "subtask" &&
            selectedParentIds.has(entry.target.parentId);
          const checked = selectedKeys.has(entry.key) || coveredByParent;
          const targetId =
            entry.target.kind === "task"
              ? entry.target.taskId
              : entry.target.kind === "archive"
                ? entry.target.recordId
                : entry.target.childId;

          return (
            <article
              className={`history-item${isSelecting ? " history-item-selecting" : ""}${
                checked ? " history-item-selected" : ""
              }`}
              key={entry.key}
              data-todo-id={targetId}
              tabIndex={-1}
              onClick={(event) => {
                if (!isSelecting || event.target instanceof HTMLInputElement) return;
                toggleEntry(entry);
              }}
            >
              {isSelecting ? (
                <input
                  className="history-selection-checkbox"
                  type="checkbox"
                  checked={checked}
                  disabled={!entry.canDelete || coveredByParent}
                  aria-label={`选择“${entry.title}”`}
                  onChange={() => toggleEntry(entry)}
                />
              ) : (
                <span className="history-check" aria-hidden="true">
                  <Check />
                </span>
              )}
              <div className="history-content">
                {entry.parentTitle && <span className="history-parent">{entry.parentTitle}</span>}
                <span className="history-title">{entry.title}</span>
                {isSelecting && !entry.canDelete && entry.blockedReason && (
                  <span className="history-blocked-reason">{entry.blockedReason}</span>
                )}
              </div>
              <time dateTime={entry.completedAt}>{formatCompletionTime(entry.completedAt)}</time>
            </article>
          );
        })}
      </div>

      {isSelecting && (
        <footer className="history-selection-bar">
          <span>{selectedEntries.length > 0 ? `将处理 ${selectedEntries.length} 条` : "选择完成记录"}</span>
          <button
            ref={deleteTriggerRef}
            type="button"
            className="history-delete-button"
            disabled={selectedKeys.size === 0}
            onClick={requestDelete}
          >
            <Trash2 aria-hidden="true" />
            删除
          </button>
        </footer>
      )}

      <HistoryDeleteDialog
        open={pendingPlan !== null}
        plan={pendingPlan}
        onConfirm={confirmDelete}
        onClose={() => setPendingPlan(null)}
        returnFocusRef={deleteTriggerRef}
      />
    </section>
  );
}

function formatCompletionTime(timestamp: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(timestamp));
}
