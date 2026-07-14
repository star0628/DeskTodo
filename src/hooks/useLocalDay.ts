import { useCallback, useEffect, useState } from "react";
import { LocalDateKey } from "../domain/todoTypes";
import { millisecondsUntilNextLocalDay, toLocalDateKey } from "../utils/date";

export function useLocalDay(): LocalDateKey {
  const [today, setToday] = useState<LocalDateKey>(() => toLocalDateKey());

  const refresh = useCallback(() => {
    setToday((current) => {
      const next = toLocalDateKey();
      return current === next ? current : next;
    });
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const scheduleMidnightRefresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        refresh();
        scheduleMidnightRefresh();
      }, millisecondsUntilNextLocalDay());
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refresh();
        scheduleMidnightRefresh();
      }
    };

    const handleFocus = () => {
      refresh();
      scheduleMidnightRefresh();
    };

    scheduleMidnightRefresh();
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refresh]);

  return today;
}
