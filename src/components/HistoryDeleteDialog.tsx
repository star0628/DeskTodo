import { RefObject, useEffect, useId, useRef } from "react";
import { HistoryDeletionPlan } from "../domain/historyDeletion";
import { DialogHeader } from "./DialogHeader";

interface HistoryDeleteDialogProps {
  open: boolean;
  plan: HistoryDeletionPlan | null;
  onConfirm: () => void;
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
}

export function HistoryDeleteDialog({
  open,
  plan,
  onConfirm,
  onClose,
  returnFocusRef
}: HistoryDeleteDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const shouldRestoreFocusRef = useRef(false);
  const titleId = `history-delete-title-${useId()}`;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      window.setTimeout(() => cancelRef.current?.focus(), 0);
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function closeDialog() {
    shouldRestoreFocusRef.current = true;
    onClose();
  }

  function confirmDelete() {
    shouldRestoreFocusRef.current = false;
    onConfirm();
  }

  function restoreTriggerFocus() {
    if (!shouldRestoreFocusRef.current) return;
    shouldRestoreFocusRef.current = false;
    window.setTimeout(() => returnFocusRef?.current?.focus({ preventScroll: true }), 0);
  }

  return (
    <dialog
      ref={dialogRef}
      className="history-delete-dialog dialog-surface dialog-compact"
      aria-labelledby={titleId}
      onClose={restoreTriggerFocus}
      onCancel={(event) => {
        event.preventDefault();
        closeDialog();
      }}
    >
      <div className="history-delete-panel">
        <DialogHeader
          titleId={titleId}
          title="删除完成记录"
          closeLabel="关闭历史删除确认"
          onClose={closeDialog}
        />
        <div className="history-delete-content">
          <p>将删除 {plan?.deletedEntryCount ?? 0} 条完成记录。</p>
          {(plan?.otherDateCount ?? 0) > 0 && (
            <p className="history-delete-warning">
              其中 {plan?.otherDateCount} 条属于其他日期。
            </p>
          )}
          <p className="history-delete-hint">
            记录将从日期历史和搜索中移除，可在 8 秒内撤销。
          </p>
          <div className="history-delete-actions">
            <button
              ref={cancelRef}
              type="button"
              className="secondary-button"
              onClick={closeDialog}
            >
              取消
            </button>
            <button
              type="button"
              className="danger-button"
              disabled={!plan}
              onClick={confirmDelete}
            >
              删除
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
}
