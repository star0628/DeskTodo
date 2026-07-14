import { RefObject, useEffect, useId, useRef } from "react";
import { RecurringDeleteBehavior } from "../domain/todoReducer";
import { DialogHeader } from "./DialogHeader";

interface RecurringDeleteDialogProps {
  open: boolean;
  title: string;
  onConfirm: (behavior: RecurringDeleteBehavior) => void;
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
}

export function RecurringDeleteDialog({
  open,
  title,
  onConfirm,
  onClose,
  returnFocusRef
}: RecurringDeleteDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const shouldRestoreFocusRef = useRef(false);
  const titleId = `recurring-delete-title-${useId()}`;

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

  function restoreTriggerFocus() {
    if (!shouldRestoreFocusRef.current) return;
    shouldRestoreFocusRef.current = false;
    window.setTimeout(() => returnFocusRef?.current?.focus({ preventScroll: true }), 0);
  }

  return (
    <dialog
      ref={dialogRef}
      className="recurring-delete-dialog dialog-surface dialog-compact"
      aria-labelledby={titleId}
      onClose={restoreTriggerFocus}
      onCancel={(event) => {
        event.preventDefault();
        closeDialog();
      }}
    >
      <div className="recurring-delete-panel">
        <DialogHeader
          titleId={titleId}
          title="删除重复任务"
          closeLabel="关闭删除确认"
          onClose={closeDialog}
        />
        <div className="recurring-delete-content">
          <p title={title}>{title}</p>
          <button type="button" onClick={() => onConfirm("skip")}>仅删除本次</button>
          <button type="button" className="danger-button" onClick={() => onConfirm("stop")}>停止重复并删除</button>
          <button ref={cancelRef} type="button" className="secondary-button" onClick={closeDialog}>取消</button>
        </div>
      </div>
    </dialog>
  );
}
