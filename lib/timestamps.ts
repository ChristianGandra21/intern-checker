export function nullableTimestamp(value: unknown): string | null {
  if (typeof value !== "string" && !(value instanceof Date)) return null;
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(value.trim());
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

export function timestampOrNow(value: unknown) {
  return nullableTimestamp(value) || new Date().toISOString();
}
