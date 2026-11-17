import type { PerformanceMonitor } from '../monitor';

/**
 * Initial navigation timing plus back/forward (popstate/hashchange) and BFCache restores.
 * History methods are NOT patched; router adapters call `monitor.recordNavigation` instead.
 */
export function collectNavigation(monitor: PerformanceMonitor): () => void {
  const reportInitial = () => {
    const [nav] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
    if (!nav) return;
    monitor.record('navigation', {
      kind: 'initial',
      duration: nav.duration,
      domContentLoaded: nav.domContentLoadedEventEnd,
      loadEvent: nav.loadEventEnd,
      transferSize: nav.transferSize,
      navigationType: nav.type,
    });
  };

  if (document.readyState === 'complete') setTimeout(reportInitial, 0);
  else window.addEventListener('load', () => setTimeout(reportInitial, 0), { once: true });

  const onPop = () => {
    monitor.setRoute(location.pathname);
    monitor.record('navigation', { kind: 'history', route: location.pathname });
  };
  const onShow = (e: PageTransitionEvent) => {
    if (e.persisted) monitor.record('navigation', { kind: 'bfcache-restore' });
  };
  window.addEventListener('popstate', onPop);
  window.addEventListener('hashchange', onPop);
  window.addEventListener('pageshow', onShow);

  return () => {
    window.removeEventListener('popstate', onPop);
    window.removeEventListener('hashchange', onPop);
    window.removeEventListener('pageshow', onShow);
  };
}
