import {
  Profiler,
  createElement,
  useContext,
  useEffect,
  useMemo,
  version,
  createContext,
  type ProfilerOnRenderCallback,
  type ReactNode,
} from 'react';
import { PerformanceMonitor as Monitor, createMonitor } from './monitor';
import type { PerformanceMonitorConfig } from './types';

const MonitorContext = createContext<Monitor | null>(null);

export interface PerformanceMonitorProps {
  config?: PerformanceMonitorConfig;
  children?: ReactNode;
}

/** Hook returning the active monitor, or null outside a `PerformanceMonitor`. */
export function useMonitor(): Monitor | null {
  return useContext(MonitorContext);
}

/**
 * Provider that starts monitoring and profiles everything below it with the React Profiler.
 * Production React builds expose little or no Profiler timing unless a profiling build is used.
 */
export function PerformanceMonitor({ config, children }: PerformanceMonitorProps) {
  const monitor = useMemo(() => new Monitor(config, { name: 'react', version }), []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    monitor.start();
    return () => monitor.stop();
  }, [monitor]);

  const tracking = monitor.config.componentTracking && monitor.config.enabled;
  const body = tracking ? createElement(MonitoredBoundary, { id: 'App' }, children) : children;
  return createElement(MonitorContext.Provider, { value: monitor }, body);
}

function MonitoredBoundary({ id, children }: { id: string; children?: ReactNode }) {
  const monitor = useContext(MonitorContext);
  const onRender: ProfilerOnRenderCallback = (name, phase, actualDuration, baseDuration, startTime, commitTime) => {
    monitor?.record('component-render', {
      componentName: name,
      phase,
      duration: actualDuration,
      baseDuration,
      startTime,
      commitTime,
    });
  };
  return createElement(Profiler, { id, onRender }, children);
}

/** Profile a specific subtree under its own name. */
export function Monitored({ id, children }: { id: string; children?: ReactNode }) {
  return createElement(MonitoredBoundary, { id }, children);
}

export { createMonitor };
export type { PerformanceMonitorConfig };
