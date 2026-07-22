declare global {
  interface Window {
    __DESKTODO_FLUSH_STATE__?: () => Promise<void>;
    __DESKTODO_REQUEST_QUIT__?: () => Promise<void>;
  }
}

export {};
