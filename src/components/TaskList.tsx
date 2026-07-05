import { TodoAction } from "../domain/todoReducer";
import { TodoItem as TodoItemType } from "../domain/todoTypes";
import { TaskItem } from "./TaskItem";

interface TaskListProps {
  tasks: TodoItemType[];
  dispatch: (action: TodoAction) => void;
}

export function TaskList({ tasks, dispatch }: TaskListProps) {
  return (
    <section className="task-list" aria-label="任务列表">
      {tasks.map((task) => (
        <TaskItem key={task.id} task={task} dispatch={dispatch} />
      ))}
    </section>
  );
}
