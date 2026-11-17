import type { PerformanceMonitor } from '../monitor';

function supports(type: string): boolean {
  return typeof PerformanceObserver !== 'undefined' && (PerformanceObserver.supportedEntryTypes ?? []).includes(type);
}

/** Long Tasks and Long Animation Frames, where the browser supports them. */
export function collectLongTasks(monitor: PerformanceMonitor): () => void {
  const observers: PerformanceObserver[] = [];

  if (supports('longtask')) {
    const obs = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        monitor.record('long-task', { duration: entry.duration, startTime: entry.startTime });
      }
    });
    obs.observe({ type: 'longtask', buffered: true });
    observers.push(obs);
  }

  if (supports('long-animation-frame')) {
    const obs = new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as Array<PerformanceEntry & { blockingDuration?: number }>) {
        monitor.record('long-animation-frame', {
          duration: entry.duration,
          startTime: entry.startTime,
          blockingDuration: entry.blockingDuration,
        });
      }
    });
    obs.observe({ type: 'long-animation-frame', buffered: true });
    observers.push(obs);
  }

  return () => observers.forEach((o) => o.disconnect());
}
