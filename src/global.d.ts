import { AppState } from "./domain/todoTypes";

declare global {
  interface Window {
    __DESKTODO_FLUSH_STATE__?: () => Promise<void>;
    __DESKTODO_REQUEST_QUIT__?: () => Promise<void>;
    __DESKTODO_LAST_STATE__?: AppState;
  }
}

export {};
