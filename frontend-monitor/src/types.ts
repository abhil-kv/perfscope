export type PerformanceEventType =
  | 'web-vital'
  | 'component-render'
  | 'network'
  | 'navigation'
  | 'long-task'
  | 'long-animation-frame'
  | 'memory'
  | 'error'
  | 'resource';

export const EVENT_TYPES: readonly PerformanceEventType[] = [
  'web-vital',
  'component-render',
  'network',
  'navigation',
  'long-task',
  'long-animation-frame',
  'memory',
  'error',
  'resource',
];

export type MetricValue = string | number | boolean | null;

export interface PerformanceEvent {
  id: string;
  type: PerformanceEventType;
  timestamp: number;
  application: { name?: string; version?: string; environment?: string };
  sessionId?: string;
  framework?: { name: 'react' | 'preact' | 'vue'; version?: string };
  page: { url: string; route?: string };
  metrics: Record<string, MetricValue>;
}

/** A pluggable destination for event batches. */
export interface Transport {
  /** True when a batch can be delivered right now. */
  isReady(): boolean;
  send(events: PerformanceEvent[]): void;
  close(): void;
}

export interface PerformanceMonitorConfig {
  enabled?: boolean;

  dashboard?: boolean;
  dashboardPath?: string;

  componentTracking?: boolean;
  /** Fetch/XHR instrumentation. Opt-in. */
  networkTracking?: boolean;
  memoryTracking?: boolean;
  webVitals?: boolean;
  navigationTracking?: boolean;
  errorTracking?: boolean;
  longTaskTracking?: boolean;

  /** 0..1. Applies to every event type except errors. */
  samplingRate?: number;
  bufferSize?: number;
  /** Milliseconds between batch flushes. */
  flushInterval?: number;

  environment?: 'development' | 'production' | 'test';
  debug?: boolean;

  excludeRoutes?: string[];
  redactQueryParams?: string[];

  /** `remote` is planned and not implemented yet. */
  transport?: 'local' | 'custom' | 'remote';
  /** Required when `transport` is `custom`. */
  customTransport?: Transport;

  application?: { name?: string; version?: string };
}

export type ResolvedConfig = Required<
  Omit<PerformanceMonitorConfig, 'customTransport' | 'application'>
> & {
  customTransport?: Transport;
  application: { name?: string; version?: string };
};

export type FrameworkInfo = { name: 'react' | 'preact' | 'vue'; version?: string };
