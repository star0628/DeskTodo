export function shouldFocusQuickAdd(
  event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey" | "target">,
  canAddTask: boolean,
  hasOpenDialog: boolean
): boolean {
  if (!canAddTask || hasOpenDialog) return false;
  if (event.key.toLowerCase() !== "n" || !event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) {
    return false;
  }

  const target = event.target;
  return !(
    target instanceof Element &&
    (target.matches("input, textarea, select") || target.closest("[contenteditable='true']"))
  );
}

export function shouldUndoDelete(
  event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey" | "target">,
  canUndo: boolean
): boolean {
  if (!canUndo || event.key.toLowerCase() !== "z" || !event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) {
    return false;
  }

  const target = event.target;
  return !(
    target instanceof Element &&
    (target.matches("input, textarea, select") || target.closest("[contenteditable='true']"))
  );
}
