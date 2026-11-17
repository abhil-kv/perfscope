import type { PerformanceMonitor } from '../monitor';

/** Core Web Vitals via the official `web-vitals` library. */
export function collectWebVitals(monitor: PerformanceMonitor): () => void {
  let active = true;
  import('web-vitals')
    .then((wv) => {
      if (!active) return;
      const report = (m: { name: string; value: number; rating: string; delta: number; id: string }) =>
        monitor.record('web-vital', {
          name: m.name,
          value: m.value,
          rating: m.rating,
          delta: m.delta,
          metricId: m.id,
        });
      wv.onLCP(report);
      wv.onINP(report);
      wv.onCLS(report);
      wv.onFCP(report);
      wv.onTTFB(report);
    })
    .catch((err) => monitor.debug('web-vitals unavailable', err));
  return () => {
    active = false;
  };
}
