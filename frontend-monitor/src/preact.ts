import { options, createContext, h, type ComponentChildren, type VNode } from 'preact';
import { useContext, useEffect, useMemo } from 'preact/hooks';
import { PerformanceMonitor as Monitor } from './monitor';
import type { PerformanceMonitorConfig } from './types';

type AnyOptions = Record<string, ((...args: any[]) => unknown) | undefined>;
type AnyVNode = VNode & { type: unknown; __b?: unknown };

const MonitorContext = createContext<Monitor | null>(null);
export function useMonitor(): Monitor | null {
  return useContext(MonitorContext);
}

/**
 * Version-specific Preact instrumentation, isolated here on purpose.
 * Uses the public `diffed` and `unmount` option hooks plus the internal before-diff hook (`__b`)
 * for timing. If `__b` is not called by a future Preact version, duration is reported as null (unavailable).
 */
const active = new Set<Monitor>();
let installed = false;
const starts = new WeakMap<object, number>();
const mounted = new WeakSet<object>();
const instanceOf = (vnode: AnyVNode): object => ((vnode as unknown as { __c?: object }).__c ?? vnode);

function nameOf(vnode: AnyVNode): string | null {
  const t = vnode.type as unknown;
  if (typeof t !== 'function') return null;
  const fn = t as { displayName?: string; name?: string };
  return fn.displayName || fn.name || 'Anonymous';
}

function install(): void {
  if (installed) return;
  installed = true;
  const opts = options as unknown as AnyOptions;
  const prevBefore = opts.__b;
  const prevDiffed = opts.diffed;
  const prevUnmount = opts.unmount;

  opts.__b = (vnode: AnyVNode) => {
    if (nameOf(vnode)) starts.set(vnode, performance.now());
    prevBefore?.(vnode);
  };
  opts.diffed = (vnode: AnyVNode) => {
    const name = nameOf(vnode);
    if (name && active.size > 0) {
      const start = starts.get(vnode);
      const duration = start === undefined ? null : performance.now() - start;
      const inst = instanceOf(vnode);
      const isMount = !mounted.has(inst);
      mounted.add(inst);
      for (const m of active) {
        if (m.config.componentTracking) {
          m.record('component-render', { componentName: name, phase: isMount ? 'mount' : 'update', duration });
        }
      }
    }
    prevDiffed?.(vnode);
  };
  opts.unmount = (vnode: AnyVNode) => {
    const name = nameOf(vnode);
    if (name) for (const m of active) if (m.config.componentTracking) m.record('component-render', { componentName: name, phase: 'unmount', duration: null });
    prevUnmount?.(vnode);
  };
}

export interface PerformanceMonitorProps {
  config?: PerformanceMonitorConfig;
  children?: ComponentChildren;
}

export function PerformanceMonitor({ config, children }: PerformanceMonitorProps) {
  const monitor = useMemo(() => new Monitor(config, { name: 'preact' }), []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    monitor.start();
    if (monitor.config.componentTracking) {
      install();
      active.add(monitor);
    }
    return () => {
      active.delete(monitor);
      monitor.stop();
    };
  }, [monitor]);

  return h(MonitorContext.Provider, { value: monitor }, children);
}

export type { PerformanceMonitorConfig };
