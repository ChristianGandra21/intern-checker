import { timingSafeEqual } from "node:crypto";

export function validIngestKey(received: string | null) {
  const expected = process.env.INGEST_API_KEY;
  if (!expected || !received) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}
