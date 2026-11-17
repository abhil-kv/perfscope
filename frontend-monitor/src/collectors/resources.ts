import type { PerformanceMonitor } from '../monitor';

/** Resource Timing entries (scripts, styles, images, fonts). Fetch/XHR entries are reported by the network collector. */
export function collectResources(monitor: PerformanceMonitor): () => void {
  if (typeof PerformanceObserver === 'undefined') return () => undefined;
  const obs = new PerformanceObserver((list) => {
    for (const e of list.getEntries() as PerformanceResourceTiming[]) {
      if (e.initiatorType === 'fetch' || e.initiatorType === 'xmlhttprequest') continue;
      if (new URL(e.name, location.href).pathname.startsWith(monitor.config.dashboardPath)) continue;
      monitor.record('resource', {
        url: monitor.redact(e.name),
        initiatorType: e.initiatorType,
        duration: e.duration,
        transferSize: e.transferSize,
        encodedBodySize: e.encodedBodySize,
      });
    }
  });
  try {
    obs.observe({ type: 'resource', buffered: true });
  } catch {
    return () => undefined;
  }
  return () => obs.disconnect();
}
