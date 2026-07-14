import { KeyboardEvent, RefObject, useCallback, useEffect, useRef, useState } from "react";
import { Plus, Star, Trash2 } from "lucide-react";
import { RecurringDeleteBehavior, TodoAction } from "../domain/todoReducer";
import { getParentSubtaskProgress } from "../domain/todoSelectors";
import {
  LocalDateKey,
  RecurrenceRule,
  TodoId,
  TodoItem as TodoItemType
} from "../domain/todoTypes";
import { scheduleTodoFocus } from "../utils/focus";
import { DeadlineMeta } from "./DeadlineMeta";
import { RecurringDeleteDialog } from "./RecurringDeleteDialog";
import { ScheduleControl } from "./ScheduleControl";

interface TaskItemProps {
  task: TodoItemType;
  today: LocalDateKey;
  nowMs: number;
  recurrenceRule?: RecurrenceRule;
  dispatch: (action: TodoAction) => void;
  progress?: { done: number; total: number };
  onDeleteTask: (task: TodoItemType, behavior?: RecurringDeleteBehavior) => void;
  onDeleteSubtask: (parentId: TodoId, task: TodoItemType) => void;
}

interface SubtaskProps {
  parentId: TodoId;
  task: TodoItemType;
  dispatch: (action: TodoAction) => void;
  onDelete: (parentId: TodoId, task: TodoItemType) => void;
}

export function TaskItem({
  task,
  today,
  nowMs,
  recurrenceRule,
  dispatch,
  progress: progressOverride,
  onDeleteTask,
  onDeleteSubtask
}: TaskItemProps) {
  const [isAddingSubtask, setIsAddingSubtask] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const addSubtaskButtonRef = useRef<HTMLButtonElement>(null);
  const deleteTaskButtonRef = useRef<HTMLButtonElement>(null);
  const progress = progressOverride ?? getParentSubtaskProgress(task);

  function deleteTask(behavior?: RecurringDeleteBehavior) {
    onDeleteTask(task, behavior);
    setIsDeleteDialogOpen(false);
  }

  function finishAddingSubtask(reason: InlineCreateFinishReason) {
    setIsAddingSubtask(false);
    if (reason === "enter" || reason === "escape") {
      window.setTimeout(() => addSubtaskButtonRef.current?.focus(), 0);
    }
  }

  return (
    <article className="task-card">
      <TaskRow
        task={task}
        level="parent"
        rightSlot={
          <>
            <span
              className="subtask-progress"
              aria-hidden={progress.total === 0 ? "true" : undefined}
              aria-label={
                progress.total > 0
                  ? `子任务完成 ${progress.done}，共 ${progress.total} 项`
                  : undefined
              }
            >
              {progress.total > 0 ? `${progress.done} / ${progress.total}` : null}
            </span>
            <button
              type="button"
              className={`icon-button important-button${task.important ? " active" : ""}`}
              aria-label={task.important ? "取消重要任务" : "标记为重要任务"}
              aria-pressed={task.important}
              title={task.important ? "取消重要" : "标记重要"}
              onClick={() =>
                dispatch({ type: "setTaskImportant", id: task.id, important: !task.important })
              }
            >
              <Star aria-hidden="true" fill={task.important ? "currentColor" : "none"} />
            </button>
            <ScheduleControl
              deadlineAt={task.deadlineAt}
              deadlineDisplayMode={task.deadlineDisplayMode}
              rule={recurrenceRule ?? null}
              today={today}
              baseDate={task.scheduledFor ?? today}
              disabled={task.done && !task.deadlineAt && !recurrenceRule}
              onChange={({ deadlineAt, deadlineDisplayMode, rule }) =>
                dispatch({
                  type: "setTaskSchedule",
                  id: task.id,
                  deadlineAt,
                  deadlineDisplayMode,
                  rule,
                  today
                })
              }
            />
            <button
              ref={addSubtaskButtonRef}
              type="button"
              className="icon-button add-subtask-button"
              onPointerDown={(event) => {
                if (isAddingSubtask) event.preventDefault();
              }}
              onClick={() => setIsAddingSubtask(true)}
              aria-label="添加子任务"
            >
              <Plus aria-hidden="true" />
            </button>
            <button
              ref={deleteTaskButtonRef}
              type="button"
              className="icon-button danger delete-task-button"
              onClick={() =>
                recurrenceRule ? setIsDeleteDialogOpen(true) : deleteTask()
              }
              aria-label="删除任务"
            >
              <Trash2 aria-hidden="true" />
            </button>
          </>
        }
        onToggle={() => dispatch({ type: "toggleTask", id: task.id })}
        onEdit={(title) => dispatch({ type: "editTask", id: task.id, title })}
        nowMs={nowMs}
      />

      {(task.children.length > 0 || isAddingSubtask) && (
        <div className="subtask-list">
          {task.children.map((child) => (
            <Subtask
              key={child.id}
              parentId={task.id}
              task={child}
              dispatch={dispatch}
              onDelete={onDeleteSubtask}
            />
          ))}
          {isAddingSubtask && (
            <InlineCreateInput
              placeholder="添加子任务，Enter 创建"
              outsideIgnoreRef={addSubtaskButtonRef}
              onCancel={finishAddingSubtask}
              onCreate={(title, reason) => {
                dispatch({ type: "addSubtask", parentId: task.id, title });
                finishAddingSubtask(reason);
              }}
            />
          )}
        </div>
      )}
      <RecurringDeleteDialog
        open={isDeleteDialogOpen}
        title={task.title}
        onConfirm={deleteTask}
        onClose={() => setIsDeleteDialogOpen(false)}
        returnFocusRef={deleteTaskButtonRef}
      />
    </article>
  );
}

function Subtask({ parentId, task, dispatch, onDelete }: SubtaskProps) {
  return (
    <TaskRow
      task={task}
      level="child"
      rightSlot={
        <button
          type="button"
          className="icon-button danger delete-subtask-button"
          onClick={() => onDelete(parentId, task)}
          aria-label="删除子任务"
        >
          <Trash2 aria-hidden="true" />
        </button>
      }
      onToggle={() => dispatch({ type: "toggleSubtask", parentId, childId: task.id })}
      onEdit={(title) => dispatch({ type: "editSubtask", parentId, childId: task.id, title })}
    />
  );
}

interface TaskRowProps {
  task: TodoItemType;
  level: "parent" | "child";
  rightSlot: React.ReactNode;
  onToggle: () => void;
  onEdit: (title: string) => void;
  nowMs?: number;
}

function TaskRow({ task, level, rightSlot, onToggle, onEdit, nowMs }: TaskRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(task.title);
  const isCommittingRef = useRef(false);

  function saveEdit() {
    if (isCommittingRef.current) return;
    isCommittingRef.current = true;

    const title = draftTitle.trim();
    if (title && title !== task.title) {
      onEdit(title);
      setDraftTitle(title);
    } else {
      setDraftTitle(task.title);
    }

    setIsEditing(false);
  }

  function cancelEdit() {
    isCommittingRef.current = true;
    setDraftTitle(task.title);
    setIsEditing(false);
  }

  function handleEditKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      saveEdit();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      cancelEdit();
    }
  }

  function startEdit() {
    isCommittingRef.current = false;
    setDraftTitle(task.title);
    setIsEditing(true);
  }

  return (
    <div className={`task-row ${level}`} data-todo-id={task.id}>
      <label className="task-checkbox-hit">
        <input
          type="checkbox"
          checked={task.done}
          onChange={() => {
            onToggle();
            scheduleTodoFocus(task.id);
          }}
          className="task-checkbox"
          aria-label={task.done ? "标记为未完成" : "标记为完成"}
        />
      </label>
      <div className="task-copy">
        {isEditing ? (
          <input
            className="inline-edit-input"
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            onKeyDown={handleEditKeyDown}
            onBlur={() => {
              if (isEditing) saveEdit();
            }}
            autoFocus
          />
        ) : (
          <button
            type="button"
            className={`task-title ${task.done ? "done" : ""}`}
            onDoubleClick={startEdit}
            title={`${task.title}（双击编辑）`}
          >
            {task.title}
          </button>
        )}
        {level === "parent" && task.deadlineAt && nowMs !== undefined && (
          <DeadlineMeta
            deadlineAt={task.deadlineAt}
            displayMode={task.deadlineDisplayMode}
            nowMs={nowMs}
            done={task.done}
          />
        )}
      </div>
      <div className={`task-actions task-actions-${level}`}>{rightSlot}</div>
    </div>
  );
}

interface InlineCreateInputProps {
  placeholder: string;
  outsideIgnoreRef: RefObject<HTMLElement>;
  onCreate: (title: string, reason: InlineCreateFinishReason) => void;
  onCancel: (reason: InlineCreateFinishReason) => void;
}

type InlineCreateFinishReason = "enter" | "escape" | "blur" | "outside";

function InlineCreateInput({
  placeholder,
  outsideIgnoreRef,
  onCreate,
  onCancel
}: InlineCreateInputProps) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const valueRef = useRef("");
  const isFinalizedRef = useRef(false);
  const isComposingRef = useRef(false);

  const finalizeDraft = useCallback(
    (reason: InlineCreateFinishReason, cancel = false) => {
      if (isFinalizedRef.current) return;

      const title = inputRef.current?.value.trim() ?? valueRef.current.trim();
      if (reason === "enter" && !title) return;

      isFinalizedRef.current = true;
      if (!cancel && title) {
        onCreate(title, reason);
        return;
      }

      onCancel(reason);
    },
    [onCancel, onCreate]
  );

  useEffect(() => {
    function handleOutsidePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (inputRef.current?.contains(target)) return;
      if (outsideIgnoreRef.current?.contains(target)) return;
      finalizeDraft("outside");
    }

    document.addEventListener("pointerdown", handleOutsidePointerDown, true);
    return () => document.removeEventListener("pointerdown", handleOutsidePointerDown, true);
  }, [finalizeDraft, outsideIgnoreRef]);

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing || isComposingRef.current || event.keyCode === 229) {
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      finalizeDraft("escape", true);
    }
    if (event.key === "Enter") {
      event.preventDefault();
      finalizeDraft("enter");
    }
  }

  return (
    <input
      ref={inputRef}
      className="subtask-create-input"
      value={value}
      onChange={(event) => {
        valueRef.current = event.target.value;
        setValue(event.target.value);
      }}
      onKeyDown={handleKeyDown}
      onBlur={() => finalizeDraft("blur")}
      onCompositionStart={() => {
        isComposingRef.current = true;
      }}
      onCompositionEnd={(event) => {
        isComposingRef.current = false;
        valueRef.current = event.currentTarget.value;
      }}
      placeholder={placeholder}
      aria-label="子任务标题"
      autoFocus
    />
  );
}
