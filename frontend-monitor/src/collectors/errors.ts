import type { PerformanceMonitor } from '../monitor';

function describe(reason: unknown): { name: string; message: string } {
  if (reason instanceof Error) return { name: reason.name, message: reason.message };
  return { name: 'NonError', message: typeof reason === 'string' ? reason : 'Unknown rejection reason' };
}

/** Runtime errors, unhandled rejections and resource load errors. No stack frames, source, or form values. */
export function collectErrors(monitor: PerformanceMonitor): () => void {
  const onError = (e: ErrorEvent | Event) => {
    if (e instanceof ErrorEvent) {
      monitor.record('error', {
        kind: 'runtime',
        name: e.error instanceof Error ? e.error.name : 'Error',
        message: String(e.message).slice(0, 500),
        line: e.lineno,
        column: e.colno,
      });
      return;
    }
    const target = e.target as (HTMLElement & { src?: string; href?: string }) | null;
    if (target && target !== (window as unknown) && target.tagName) {
      monitor.record('error', {
        kind: 'resource-load',
        tag: target.tagName.toLowerCase(),
        url: monitor.redact(target.src ?? target.href ?? ''),
      });
    }
  };
  const onRejection = (e: PromiseRejectionEvent) => {
    const { name, message } = describe(e.reason);
    const chunk = /Loading (CSS )?chunk|dynamically imported module/i.test(message);
    monitor.record('error', { kind: chunk ? 'chunk-load' : 'unhandled-rejection', name, message: message.slice(0, 500) });
  };
  window.addEventListener('error', onError, true);
  window.addEventListener('unhandledrejection', onRejection);
  return () => {
    window.removeEventListener('error', onError, true);
    window.removeEventListener('unhandledrejection', onRejection);
  };
}
