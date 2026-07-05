import { AppState } from "../domain/todoTypes";

export type LoadStatus = "ok" | "missing" | "invalid" | "error";

export interface LoadAppStateResult {
  state: AppState;
  status: LoadStatus;
}

export interface AppStateRepository {
  load(): Promise<LoadAppStateResult>;
  save(state: AppState): Promise<void>;
}
