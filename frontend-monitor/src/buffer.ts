import type { PerformanceEvent } from './types';

/**
 * Bounded FIFO buffer. When full, an incoming non-error event is dropped;
 * an incoming error evicts the oldest non-error event instead.
 */
export class EventBuffer {
  private items: PerformanceEvent[] = [];
  dropped = 0;

  constructor(private readonly capacity: number) {}

  get size(): number {
    return this.items.length;
  }

  push(event: PerformanceEvent): boolean {
    if (this.items.length < this.capacity) {
      this.items.push(event);
      return true;
    }
    if (event.type === 'error') {
      const idx = this.items.findIndex((e) => e.type !== 'error');
      if (idx >= 0) {
        this.items.splice(idx, 1);
        this.items.push(event);
        this.dropped++;
        return true;
      }
    }
    this.dropped++;
    return false;
  }

  drain(max = Infinity): PerformanceEvent[] {
    return this.items.splice(0, Math.min(max, this.items.length));
  }
}
