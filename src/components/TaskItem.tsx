import { KeyboardEvent, useRef, useState } from "react";
import { TodoAction } from "../domain/todoReducer";
import { getParentSubtaskProgress } from "../domain/todoSelectors";
import { TodoId, TodoItem as TodoItemType } from "../domain/todoTypes";

interface TaskItemProps {
  task: TodoItemType;
  dispatch: (action: TodoAction) => void;
}

interface SubtaskProps {
  parentId: TodoId;
  task: TodoItemType;
  dispatch: (action: TodoAction) => void;
}

export function TaskItem({ task, dispatch }: TaskItemProps) {
  const [isAddingSubtask, setIsAddingSubtask] = useState(false);
  const progress = getParentSubtaskProgress(task);

  return (
    <article className="task-card">
      <TaskRow
        task={task}
        level="parent"
        rightSlot={
          <>
            {progress.total > 0 && (
              <span className="subtask-progress">
                {progress.done} / {progress.total}
              </span>
            )}
            <button type="button" className="icon-button" onClick={() => setIsAddingSubtask(true)} aria-label="添加子任务">
              +
            </button>
            <button
              type="button"
              className="icon-button danger"
              onClick={() => dispatch({ type: "deleteTask", id: task.id })}
              aria-label="删除任务"
            >
              ×
            </button>
          </>
        }
        onToggle={() => dispatch({ type: "toggleTask", id: task.id })}
        onEdit={(title) => dispatch({ type: "editTask", id: task.id, title })}
      />

      {(task.children.length > 0 || isAddingSubtask) && (
        <div className="subtask-list">
          {task.children.map((child) => (
            <Subtask key={child.id} parentId={task.id} task={child} dispatch={dispatch} />
          ))}
          {isAddingSubtask && (
            <InlineCreateInput
              placeholder="添加子任务，Enter 创建"
              onCancel={() => setIsAddingSubtask(false)}
              onCreate={(title) => {
                dispatch({ type: "addSubtask", parentId: task.id, title });
                setIsAddingSubtask(false);
              }}
            />
          )}
        </div>
      )}
    </article>
  );
}

function Subtask({ parentId, task, dispatch }: SubtaskProps) {
  return (
    <TaskRow
      task={task}
      level="child"
      rightSlot={
        <button
          type="button"
          className="icon-button danger"
          onClick={() => dispatch({ type: "deleteSubtask", parentId, childId: task.id })}
          aria-label="删除子任务"
        >
          ×
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
}

function TaskRow({ task, level, rightSlot, onToggle, onEdit }: TaskRowProps) {
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
    <div className={`task-row ${level}`}>
      <input
        type="checkbox"
        checked={task.done}
        onChange={onToggle}
        className="task-checkbox"
        aria-label={task.done ? "标记为未完成" : "标记为完成"}
      />
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
          title="双击编辑"
        >
          {task.title}
        </button>
      )}
      <div className="task-actions">{rightSlot}</div>
    </div>
  );
}

interface InlineCreateInputProps {
  placeholder: string;
  onCreate: (title: string) => void;
  onCancel: () => void;
}

function InlineCreateInput({ placeholder, onCreate, onCancel }: InlineCreateInputProps) {
  const [value, setValue] = useState("");

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") onCancel();
    if (event.key === "Enter") {
      const title = value.trim();
      if (!title) return;
      onCreate(title);
      setValue("");
    }
  }

  return (
    <input
      className="subtask-create-input"
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      autoFocus
    />
  );
}
