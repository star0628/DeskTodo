import { Check } from "lucide-react";
import { DailyCompletionEntry } from "../domain/dailyViewSelectors";

interface DailyHistoryListProps {
  entries: DailyCompletionEntry[];
}

export function DailyHistoryList({ entries }: DailyHistoryListProps) {
  if (entries.length === 0) {
    return (
      <section className="empty-state">
        <p>这一天还没有完成记录。</p>
      </section>
    );
  }

  return (
    <section className="history-list" aria-label="当日完成记录">
      {entries.map((entry) => (
        <article className="history-item" key={entry.id} data-todo-id={entry.id} tabIndex={-1}>
          <span className="history-check" aria-hidden="true">
            <Check />
          </span>
          <div className="history-content">
            {entry.parentTitle && <span className="history-parent">{entry.parentTitle}</span>}
            <span className="history-title">{entry.title}</span>
          </div>
          <time dateTime={entry.completedAt}>{formatCompletionTime(entry.completedAt)}</time>
        </article>
      ))}
    </section>
  );
}

function formatCompletionTime(timestamp: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(timestamp));
}
