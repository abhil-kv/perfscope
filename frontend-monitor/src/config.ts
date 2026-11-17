import type { PerformanceMonitorConfig, ResolvedConfig } from './types';

export const DEFAULT_REDACTED_PARAMS = [
  'token',
  'session',
  'email',
  'password',
  'key',
  'auth',
  'code',
  'secret',
];

export class ConfigError extends Error {
  constructor(message: string) {
    super(`[frontend-monitor] ${message}`);
    this.name = 'ConfigError';
  }
}

/**
 * Applies defaults and validates the config.
 * Expensive instrumentation is off by default in production.
 */
export function resolveConfig(input: PerformanceMonitorConfig = {}): ResolvedConfig {
  const environment = input.environment ?? 'development';
  const dev = environment !== 'production';
  const dashboardPath = normalizePath(input.dashboardPath ?? '/performance');

  const config: ResolvedConfig = {
    enabled: input.enabled ?? true,
    dashboard: input.dashboard ?? true,
    dashboardPath,
    componentTracking: input.componentTracking ?? dev,
    networkTracking: input.networkTracking ?? dev,
    memoryTracking: input.memoryTracking ?? dev,
    webVitals: input.webVitals ?? true,
    navigationTracking: input.navigationTracking ?? true,
    errorTracking: input.errorTracking ?? true,
    longTaskTracking: input.longTaskTracking ?? dev,
    samplingRate: input.samplingRate ?? 1,
    bufferSize: input.bufferSize ?? 500,
    flushInterval: input.flushInterval ?? 1000,
    environment,
    debug: input.debug ?? false,
    excludeRoutes: Array.from(new Set([dashboardPath, ...(input.excludeRoutes ?? [])])),
    redactQueryParams: input.redactQueryParams ?? DEFAULT_REDACTED_PARAMS,
    transport: input.transport ?? 'local',
    customTransport: input.customTransport,
    application: { ...input.application },
  };

  if (!(config.samplingRate >= 0 && config.samplingRate <= 1)) {
    throw new ConfigError('samplingRate must be a number between 0 and 1.');
  }
  if (!Number.isInteger(config.bufferSize) || config.bufferSize < 1) {
    throw new ConfigError('bufferSize must be a positive integer.');
  }
  if (!(config.flushInterval >= 50)) {
    throw new ConfigError('flushInterval must be at least 50 ms.');
  }
  if (!['development', 'production', 'test'].includes(config.environment)) {
    throw new ConfigError('environment must be "development", "production" or "test".');
  }
  if (config.transport === 'remote') {
    throw new ConfigError('transport "remote" is planned and not implemented yet.');
  }
  if (config.transport === 'custom' && !config.customTransport) {
    throw new ConfigError('transport "custom" requires a customTransport.');
  }
  return config;
}

export function normalizePath(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return p.length > 1 ? p.replace(/\/+$/, '') : p;
}
