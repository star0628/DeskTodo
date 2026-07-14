import { useCallback, useEffect, useState } from "react";
import { getDeadlineRefreshDelay } from "../domain/deadline";

export function useDeadlineClock(deadlineValues: readonly string[]): number {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const deadlineKey = deadlineValues.join("\u0000");

  const refresh = useCallback(() => setNowMs(Date.now()), []);

  useEffect(() => {
    const deadlines = deadlineKey ? deadlineKey.split("\u0000") : [];
    let timer: ReturnType<typeof setTimeout> | undefined;

    function schedule() {
      if (timer !== undefined) clearTimeout(timer);
      if (document.visibilityState === "hidden" || deadlines.length === 0) return;
      const current = Date.now();
      timer = setTimeout(() => {
        setNowMs(Date.now());
        schedule();
      }, getDeadlineRefreshDelay(deadlines, current));
    }

    function refreshAndSchedule() {
      refresh();
      schedule();
    }

    refreshAndSchedule();
    window.addEventListener("focus", refreshAndSchedule);
    document.addEventListener("visibilitychange", refreshAndSchedule);

    return () => {
      if (timer !== undefined) clearTimeout(timer);
      window.removeEventListener("focus", refreshAndSchedule);
      document.removeEventListener("visibilitychange", refreshAndSchedule);
    };
  }, [deadlineKey, refresh]);

  return nowMs;
}
