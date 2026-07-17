interface EmptyStateProps {
  message?: string;
}

export function EmptyState({
  message = "今天还没有任务。先写下一件最重要的小事。"
}: EmptyStateProps) {
  return (
    <section className="empty-state">
      <p>{message}</p>
    </section>
  );
}
