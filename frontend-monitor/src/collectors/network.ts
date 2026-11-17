import type { PerformanceMonitor } from '../monitor';

/**
 * Opt-in Fetch/XHR instrumentation. Never reads or clones bodies, headers or credentials;
 * the original response, errors and timing semantics are preserved.
 */
export function collectNetwork(monitor: PerformanceMonitor): () => void {
  const cleanups: Array<() => void> = [];

  const report = (method: string, rawUrl: string, start: number, status: number | null, failed: boolean) => {
    let path = rawUrl;
    try {
      path = new URL(rawUrl, location.href).pathname;
    } catch {
      /* keep raw */
    }
    if (path.startsWith(monitor.config.dashboardPath)) return;
    monitor.record('network', {
      method,
      url: monitor.redact(rawUrl),
      duration: performance.now() - start,
      status,
      failed,
      initiator: 'fetch-xhr',
    });
  };

  if (typeof window.fetch === 'function') {
    const original = window.fetch;
    const wrapped: typeof fetch = function (this: unknown, input, init) {
      const start = performance.now();
      const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
      const url = input instanceof Request ? input.url : String(input);
      const result = original.call(this ?? window, input, init);
      result.then(
        (res) => report(method, url, start, res.status, !res.ok),
        () => report(method, url, start, null, true),
      );
      return result;
    };
    window.fetch = wrapped;
    cleanups.push(() => {
      if (window.fetch === wrapped) window.fetch = original;
    });
  }

  if (typeof XMLHttpRequest !== 'undefined') {
    const proto = XMLHttpRequest.prototype;
    const origOpen = proto.open;
    const origSend = proto.send;
    const meta = new WeakMap<XMLHttpRequest, { method: string; url: string }>();

    proto.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
      meta.set(this, { method: method.toUpperCase(), url: String(url) });
      return (origOpen as (...a: unknown[]) => void).call(this, method, url, ...rest);
    } as typeof proto.open;

    proto.send = function (this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
      const info = meta.get(this);
      if (info) {
        const start = performance.now();
        this.addEventListener(
          'loadend',
          () => {
            const ok = this.status >= 200 && this.status < 400;
            report(info.method, info.url, start, this.status || null, !ok);
          },
          { once: true },
        );
      }
      return origSend.call(this, body);
    };

    cleanups.push(() => {
      proto.open = origOpen;
      proto.send = origSend;
    });
  }

  return () => cleanups.forEach((fn) => fn());
}
