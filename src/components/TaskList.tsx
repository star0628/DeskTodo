import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { RecurringDeleteBehavior, TodoAction } from "../domain/todoReducer";
import {
  LocalDateKey,
  RecurrenceSeries,
  TodoItem as TodoItemType
} from "../domain/todoTypes";
import { useDeadlineClock } from "../hooks/useDeadlineClock";
import { TaskItem } from "./TaskItem";

interface TaskListProps {
  activeTasks: TodoItemType[];
  completedTasks: TodoItemType[];
  today: LocalDateKey;
  recurrenceById?: ReadonlyMap<string, RecurrenceSeries>;
  dispatch: (action: TodoAction) => void;
  onDeleteTask: (task: TodoItemType, behavior?: RecurringDeleteBehavior) => void;
  onDeleteSubtask: (parentId: string, task: TodoItemType) => void;
  progressByTaskId?: ReadonlyMap<string, { done: number; total: number }>;
  collapseCompletedByDefault?: boolean;
}

export function TaskList({
  activeTasks,
  completedTasks,
  today,
  recurrenceById,
  dispatch,
  onDeleteTask,
  onDeleteSubtask,
  progressByTaskId,
  collapseCompletedByDefault = false
}: TaskListProps) {
  const [isCompletedExpanded, setIsCompletedExpanded] = useState(!collapseCompletedByDefault);
  const activeDeadlineValues = useMemo(
    () => activeTasks.flatMap((task) => (task.deadlineAt ? [task.deadlineAt] : [])),
    [activeTasks]
  );
  const nowMs = useDeadlineClock(activeDeadlineValues);

  useEffect(() => {
    setIsCompletedExpanded(!collapseCompletedByDefault);
  }, [collapseCompletedByDefault]);

  function renderTask(task: TodoItemType) {
    return (
      <TaskItem
        key={task.id}
        task={task}
        today={today}
        nowMs={nowMs}
        recurrenceRule={
          task.recurrenceSeriesId
            ? recurrenceById?.get(task.recurrenceSeriesId)?.rule
            : undefined
        }
        dispatch={dispatch}
        onDeleteTask={onDeleteTask}
        onDeleteSubtask={onDeleteSubtask}
        progress={progressByTaskId?.get(task.id)}
      />
    );
  }

  return (
    <section className="task-list" aria-label="任务列表">
      {activeTasks.map(renderTask)}
      {completedTasks.length > 0 && (
        <section className="completed-task-section" aria-label="已完成任务">
          <button
            type="button"
            className="completed-task-toggle"
            aria-expanded={isCompletedExpanded}
            aria-controls="completed-task-list"
            onClick={() => setIsCompletedExpanded((current) => !current)}
          >
            {isCompletedExpanded ? (
              <ChevronDown aria-hidden="true" />
            ) : (
              <ChevronRight aria-hidden="true" />
            )}
            已完成 {completedTasks.length}
          </button>
          {isCompletedExpanded && (
            <div id="completed-task-list" className="completed-task-list">
              {completedTasks.map(renderTask)}
            </div>
          )}
        </section>
      )}
    </section>
  );
}
