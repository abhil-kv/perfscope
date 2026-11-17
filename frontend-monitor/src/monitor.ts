import { EventBuffer } from './buffer';
import { resolveConfig } from './config';
import { isRouteExcluded, redactUrl } from './privacy';
import { LocalTransport } from './transport';
import type {
  FrameworkInfo,
  MetricValue,
  PerformanceEvent,
  PerformanceEventType,
  PerformanceMonitorConfig,
  ResolvedConfig,
  Transport,
} from './types';
import { collectErrors } from './collectors/errors';
import { collectLongTasks } from './collectors/long-tasks';
import { collectMemory } from './collectors/memory';
import { collectNavigation } from './collectors/navigation';
import { collectNetwork } from './collectors/network';
import { collectResources } from './collectors/resources';
import { collectWebVitals } from './collectors/web-vitals';

export type Cleanup = () => void;
export type Collector = (monitor: PerformanceMonitor) => Cleanup | void;

let counter = 0;
function newId(): string {
  counter = (counter + 1) % 1_000_000;
  return `${Date.now().toString(36)}-${counter.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Framework-independent monitoring core. Adapters call `record` for component events. */
export class PerformanceMonitor {
  readonly config: ResolvedConfig;
  readonly sessionId = newId();
  private readonly buffer: EventBuffer;
  private transport: Transport | null = null;
  private cleanups: Cleanup[] = [];
  private flushTimer: ReturnType<typeof setInterval> | undefined;
  private framework: FrameworkInfo | undefined;
  private currentRoute: string | undefined;
  private started = false;
  private onVisibility = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') this.flush();
  };

  constructor(config: PerformanceMonitorConfig = {}, framework?: FrameworkInfo) {
    this.config = resolveConfig(config);
    this.buffer = new EventBuffer(this.config.bufferSize);
    this.framework = framework;
  }

  get isRunning(): boolean {
    return this.started;
  }

  get droppedCount(): number {
    return this.buffer.dropped;
  }

  setFramework(framework: FrameworkInfo): void {
    this.framework = framework;
  }

  /** Starts collectors. Safe to call repeatedly and safe on the server (no-op). */
  start(): this {
    if (this.started || !this.config.enabled || typeof window === 'undefined') return this;
    if (this.isExcludedRoute(this.getRoute())) return this;
    this.started = true;
    try {
      this.transport =
        this.config.transport === 'custom'
          ? this.config.customTransport!
          : this.config.dashboard
            ? new LocalTransport(this.config.dashboardPath, this.config.debug)
            : null;
      const c = this.config;
      const collectors: Array<[boolean, Collector]> = [
        [c.webVitals, collectWebVitals],
        [c.networkTracking, collectNetwork],
        [c.navigationTracking, collectNavigation],
        [c.errorTracking, collectErrors],
        [c.longTaskTracking, collectLongTasks],
        [c.memoryTracking, collectMemory],
        [c.networkTracking, collectResources],
      ];
      for (const [on, collector] of collectors) {
        if (!on) continue;
        try {
          const cleanup = collector(this);
          if (cleanup) this.cleanups.push(cleanup);
        } catch (err) {
          this.debug('collector failed to start', err);
        }
      }
      this.flushTimer = setInterval(() => this.flush(), this.config.flushInterval);
      document.addEventListener('visibilitychange', this.onVisibility);
      window.addEventListener('pagehide', this.onVisibility);
    } catch (err) {
      this.debug('start failed', err);
    }
    return this;
  }

  /** Stops all collectors, flushes remaining events and releases resources. */
  stop(): void {
    if (!this.started) return;
    this.started = false;
    for (const cleanup of this.cleanups.splice(0)) {
      try {
        cleanup();
      } catch (err) {
        this.debug('cleanup failed', err);
      }
    }
    clearInterval(this.flushTimer);
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('pagehide', this.onVisibility);
    this.flush();
    this.transport?.close();
    this.transport = null;
  }

  getRoute(): string {
    return this.currentRoute ?? (typeof location !== 'undefined' ? location.pathname : '/');
  }

  /** Router adapters call this on SPA transitions. */
  setRoute(route: string): void {
    this.currentRoute = route;
  }

  isExcludedRoute(route: string): boolean {
    return isRouteExcluded(route, this.config.excludeRoutes);
  }

  redact(url: string): string {
    return redactUrl(url, this.config.redactQueryParams);
  }

  /** Normalizes, filters and buffers an event. Never throws. */
  record(
    type: PerformanceEventType,
    metrics: Record<string, MetricValue | undefined>,
    overrides: { timestamp?: number } = {},
  ): void {
    if (!this.started) return;
    try {
      const route = this.getRoute();
      if (this.isExcludedRoute(route)) return;
      if (type !== 'error' && this.config.samplingRate < 1 && Math.random() >= this.config.samplingRate) {
        return;
      }
      const clean: Record<string, MetricValue> = {};
      for (const [k, v] of Object.entries(metrics)) {
        if (v !== undefined) clean[k] = typeof v === 'number' && !Number.isFinite(v) ? null : v;
      }
      const event: PerformanceEvent = {
        id: newId(),
        type,
        timestamp: overrides.timestamp ?? Date.now(),
        application: { ...this.config.application, environment: this.config.environment },
        sessionId: this.sessionId,
        framework: this.framework,
        page: { url: this.redact(location.href), route },
        metrics: clean,
      };
      this.buffer.push(event);
    } catch (err) {
      this.debug('record failed', err);
    }
  }

  flush(): void {
    if (!this.transport || !this.transport.isReady()) return;
    try {
      while (this.buffer.size > 0) this.transport.send(this.buffer.drain(100));
    } catch (err) {
      this.debug('flush failed', err);
    }
  }

  debug(message: string, detail?: unknown): void {
    if (this.config.debug) console.warn(`[frontend-monitor] ${message}`, detail ?? '', `dropped=${this.buffer.dropped}`);
  }
}

/** Creates and starts a monitor. */
export function createMonitor(config?: PerformanceMonitorConfig, framework?: FrameworkInfo): PerformanceMonitor {
  return new PerformanceMonitor(config, framework).start();
}
