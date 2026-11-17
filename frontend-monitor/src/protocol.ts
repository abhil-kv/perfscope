import { EVENT_TYPES, type PerformanceEvent } from './types';

export const MAX_BATCH_EVENTS = 500;
export const MAX_MESSAGE_BYTES = 1024 * 1024;

/** Message sent by monitored apps to the dev server. */
export interface BatchMessage {
  kind: 'batch';
  events: PerformanceEvent[];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function isValidEvent(v: unknown): v is PerformanceEvent {
  if (!isRecord(v)) return false;
  if (typeof v.id !== 'string' || v.id.length > 100) return false;
  if (typeof v.type !== 'string' || !EVENT_TYPES.includes(v.type as never)) return false;
  if (typeof v.timestamp !== 'number' || !Number.isFinite(v.timestamp)) return false;
  if (!isRecord(v.page) || typeof v.page.url !== 'string' || v.page.url.length > 2048) return false;
  if (!isRecord(v.application)) return false;
  if (!isRecord(v.metrics)) return false;
  for (const value of Object.values(v.metrics)) {
    const t = typeof value;
    if (value !== null && t !== 'string' && t !== 'number' && t !== 'boolean') return false;
    if (t === 'string' && (value as string).length > 2000) return false;
  }
  return true;
}

/** Parses and validates a raw WebSocket payload. Returns null if it is invalid. */
export function parseBatch(raw: string): BatchMessage | null {
  if (raw.length > MAX_MESSAGE_BYTES) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(data) || data.kind !== 'batch' || !Array.isArray(data.events)) return null;
  if (data.events.length > MAX_BATCH_EVENTS) return null;
  if (!data.events.every(isValidEvent)) return null;
  return { kind: 'batch', events: data.events as PerformanceEvent[] };
}
