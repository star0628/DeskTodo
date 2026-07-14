export function scheduleTodoFocus(todoId: string): number {
  return window.requestAnimationFrame(() => {
    const row = Array.from(document.querySelectorAll<HTMLElement>("[data-todo-id]"))
      .find((element) => element.dataset.todoId === todoId);
    const checkbox = row?.querySelector<HTMLInputElement>(".task-checkbox");

    checkbox?.focus({ preventScroll: true });
    row?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  });
}

export function scheduleTodoReveal(todoId: string): number {
  return window.requestAnimationFrame(() => {
    const row = Array.from(document.querySelectorAll<HTMLElement>("[data-todo-id]"))
      .find((element) => element.dataset.todoId === todoId);
    if (!row) return;

    const focusTarget = row.querySelector<HTMLInputElement>(".task-checkbox") ?? row;
    focusTarget.focus({ preventScroll: true });
    row.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    row.classList.add("search-target");
    window.setTimeout(() => row.classList.remove("search-target"), 1200);
  });
}
