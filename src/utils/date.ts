export function getIsoTimestamp(): string {
  return new Date().toISOString();
}

export function formatTodayLabel(date = new Date()): string {
  return `今天 ${date.getMonth() + 1}月${date.getDate()}日`;
}
