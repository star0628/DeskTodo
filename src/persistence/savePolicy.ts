import { TodoAction } from "../domain/todoReducer";
import { AppState } from "../domain/todoTypes";
import { LoadStatus } from "./appStateRepository";

interface ShouldSaveTodoMutationInput {
  hasHydrated: boolean;
  loadStatus: LoadStatus;
  previousState: AppState;
  nextState: AppState;
  action: TodoAction;
}

export function shouldSaveTodoMutation({
  hasHydrated,
  loadStatus,
  previousState,
  nextState,
  action
}: ShouldSaveTodoMutationInput): boolean {
  if (!hasHydrated) return false;
  if (nextState === previousState) return false;
  if (action.type === "hydrateState") return false;

  if (loadStatus === "ok" || loadStatus === "missing") {
    return true;
  }

  return isTodoContentMutation(action);
}

function isTodoContentMutation(action: TodoAction): boolean {
  switch (action.type) {
    case "addTask":
    case "editTask":
    case "toggleTask":
    case "deleteTask":
    case "addSubtask":
    case "editSubtask":
    case "toggleSubtask":
    case "deleteSubtask":
      return true;
    default:
      return false;
  }
}
