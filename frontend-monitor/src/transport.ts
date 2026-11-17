import type { PerformanceEvent, Transport } from './types';
import type { BatchMessage } from './protocol';

/** WebSocket transport to the dev-server plugin, with reconnect and backoff. */
export class LocalTransport implements Transport {
  private ws: WebSocket | null = null;
  private closed = false;
  private attempt = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly path: string, private readonly debug = false) {
    this.connect();
  }

  isReady(): boolean {
    return this.ws !== null && this.ws.readyState === 1;
  }

  send(events: PerformanceEvent[]): void {
    if (!this.isReady() || events.length === 0) return;
    const message: BatchMessage = { kind: 'batch', events };
    try {
      this.ws!.send(JSON.stringify(message));
    } catch (err) {
      if (this.debug) console.warn('[frontend-monitor] send failed', err);
    }
  }

  close(): void {
    this.closed = true;
    clearTimeout(this.timer);
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
    this.ws = null;
  }

  private connect(): void {
    if (this.closed || typeof WebSocket === 'undefined' || typeof location === 'undefined') return;
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
    try {
      const ws = new WebSocket(`${scheme}://${location.host}${this.path}/ws?role=app`);
      this.ws = ws;
      ws.onopen = () => {
        this.attempt = 0;
      };
      ws.onclose = () => {
        if (this.ws === ws) this.ws = null;
        this.scheduleReconnect();
      };
      ws.onerror = () => {
        /* onclose follows */
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.closed) return;
    const delay = Math.min(30_000, 500 * 2 ** this.attempt++);
    this.timer = setTimeout(() => this.connect(), delay);
  }
}
