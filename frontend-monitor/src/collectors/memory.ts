import type { PerformanceMonitor } from '../monitor';

interface ChromeMemory {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

const INTERVAL_MS = 10_000;

/** Heap sampling via the non-standard `performance.memory` (Chromium). Approximate by nature. */
export function collectMemory(monitor: PerformanceMonitor): () => void {
  const sample = () => {
    const mem = (performance as Performance & { memory?: ChromeMemory }).memory;
    if (!mem) return false;
    monitor.record('memory', {
      usedJSHeapSize: mem.usedJSHeapSize,
      totalJSHeapSize: mem.totalJSHeapSize,
      jsHeapSizeLimit: mem.jsHeapSizeLimit,
    });
    return true;
  };
  if (!sample()) return () => undefined; // unsupported: report nothing rather than zeros
  const timer = setInterval(sample, INTERVAL_MS);
  return () => clearInterval(timer);
}
