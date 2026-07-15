import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  closestCenter,
  CollisionDetection,
  DndContext,
  DragEndEvent,
  MouseSensor,
  useSensor,
  useSensors
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { arrayMove, SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { RecurringDeleteBehavior, TodoAction } from "../domain/todoReducer";
import {
  LocalDateKey,
  RecurrenceSeries,
  TodoItem as TodoItemType
} from "../domain/todoTypes";
import { useDeadlineClock } from "../hooks/useDeadlineClock";
import { TaskItem } from "./TaskItem";
import {
  createParentSortGroups,
  createTaskSortData,
  TaskSortData
} from "./taskSorting";

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
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { delay: 220, tolerance: 5 }
    })
  );
  const activeSortGroups = useMemo(
    () => createParentSortGroups(activeTasks, "active"),
    [activeTasks]
  );
  const completedSortGroups = useMemo(
    () => createParentSortGroups(completedTasks, "completed"),
    [completedTasks]
  );

  useEffect(() => {
    setIsCompletedExpanded(!collapseCompletedByDefault);
  }, [collapseCompletedByDefault]);

  function renderTask(task: TodoItemType, sortData: TaskSortData) {
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
        sortData={sortData}
      />
    );
  }

  function handleDragEnd(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id) return;

    const activeData = event.active.data.current as TaskSortData | undefined;
    const overData = event.over.data.current as TaskSortData | undefined;
    if (!activeData || !overData || activeData.containerId !== overData.containerId) return;

    const oldIndex = activeData.orderedIds.indexOf(activeData.itemId);
    const newIndex = activeData.orderedIds.indexOf(overData.itemId);
    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;

    const orderedIds = arrayMove([...activeData.orderedIds], oldIndex, newIndex);
    dispatch(
      activeData.kind === "parent"
        ? { type: "reorderTasks", orderedIds }
        : {
            type: "reorderSubtasks",
            parentId: activeData.parentId ?? "",
            orderedIds
          }
    );
  }

  function renderSortGroups(groups: ReturnType<typeof createParentSortGroups>) {
    return groups.map((group) => (
      <SortableContext
        key={group.containerId}
        id={group.containerId}
        items={group.sortableIds}
        strategy={verticalListSortingStrategy}
      >
        {group.tasks.map((task) => renderTask(task, createTaskSortData(group, task.id)))}
      </SortableContext>
    ));
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={sameContainerClosestCenter}
      modifiers={[restrictToVerticalAxis]}
      onDragEnd={handleDragEnd}
    >
      <section className="task-list" aria-label="任务列表">
        {renderSortGroups(activeSortGroups)}
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
                {renderSortGroups(completedSortGroups)}
              </div>
            )}
          </section>
        )}
      </section>
    </DndContext>
  );
}

const sameContainerClosestCenter: CollisionDetection = (args) => {
  const activeData = args.active.data.current as TaskSortData | undefined;
  if (!activeData) return [];

  return closestCenter({
    ...args,
    droppableContainers: args.droppableContainers.filter((container) => {
      const data = container.data.current as TaskSortData | undefined;
      return data?.containerId === activeData.containerId;
    })
  });
};
