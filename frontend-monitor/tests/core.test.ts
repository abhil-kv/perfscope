// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EventBuffer } from '../src/buffer';
import { ConfigError, resolveConfig } from '../src/config';
import { isRouteExcluded, redactUrl } from '../src/privacy';
import { parseBatch } from '../src/protocol';
import { PerformanceMonitor } from '../src/monitor';
import type { PerformanceEvent, Transport } from '../src/types';

const ev = (type: PerformanceEvent['type'] = 'network', id = 'a'): PerformanceEvent => ({
  id,
  type,
  timestamp: 1,
  application: {},
  page: { url: 'http://localhost/' },
  metrics: { duration: 1 },
});

describe('config', () => {
  it('applies defaults and excludes the dashboard route', () => {
    const c = resolveConfig();
    expect(c.excludeRoutes).toContain('/performance');
    expect(c.transport).toBe('local');
  });
  it('does not enable expensive collectors in production', () => {
    const c = resolveConfig({ environment: 'production' });
    expect(c.componentTracking).toBe(false);
    expect(c.networkTracking).toBe(false);
  });
  it('validates values', () => {
    expect(() => resolveConfig({ samplingRate: 2 })).toThrow(ConfigError);
    expect(() => resolveConfig({ bufferSize: 0 })).toThrow(ConfigError);
    expect(() => resolveConfig({ transport: 'custom' })).toThrow(ConfigError);
    expect(() => resolveConfig({ transport: 'remote' })).toThrow(ConfigError);
  });
});

describe('buffer', () => {
  it('drops new low-priority events when full and counts them', () => {
    const b = new EventBuffer(2);
    b.push(ev());
    b.push(ev());
    expect(b.push(ev())).toBe(false);
    expect(b.dropped).toBe(1);
  });
  it('keeps errors by evicting older non-errors', () => {
    const b = new EventBuffer(1);
    b.push(ev('network'));
    expect(b.push(ev('error', 'e'))).toBe(true);
    expect(b.drain()[0]?.id).toBe('e');
  });
});

describe('privacy', () => {
  it('redacts sensitive params and the hash', () => {
    const u = redactUrl('http://x.test/a?token=abc&ok=1#frag', ['token']);
    expect(u).toContain('token=REDACTED');
    expect(u).toContain('ok=1');
    expect(u).not.toContain('frag');
  });
  it('matches excluded routes by prefix', () => {
    expect(isRouteExcluded('/performance/ws', ['/performance'])).toBe(true);
    expect(isRouteExcluded('/performances', ['/performance'])).toBe(false);
  });
});

describe('protocol', () => {
  it('accepts valid batches and rejects malformed ones', () => {
    expect(parseBatch(JSON.stringify({ kind: 'batch', events: [ev()] }))?.events).toHaveLength(1);
    expect(parseBatch('not json')).toBeNull();
    expect(parseBatch(JSON.stringify({ kind: 'batch', events: [{ id: 1 }] }))).toBeNull();
    expect(parseBatch(JSON.stringify({ kind: 'batch', events: [{ ...ev(), metrics: { a: {} } }] }))).toBeNull();
  });
});

describe('monitor', () => {
  const makeTransport = () => {
    const sent: PerformanceEvent[] = [];
    const t: Transport = { isReady: () => true, send: (e) => void sent.push(...e), close: () => undefined };
    return { sent, t };
  };
  const base = { transport: 'custom', webVitals: false, navigationTracking: false, errorTracking: false, networkTracking: false, longTaskTracking: false, memoryTracking: false } as const;

  it('records, redacts, flushes and cleans up', () => {
    const { sent, t } = makeTransport();
    const m = new PerformanceMonitor({ ...base, customTransport: t }).start();
    m.record('component-render', { componentName: 'A', duration: 1, missing: undefined, bad: NaN });
    m.stop();
    expect(sent).toHaveLength(1);
    expect(sent[0]?.metrics).toEqual({ componentName: 'A', duration: 1, bad: null });
    expect(m.isRunning).toBe(false);
    m.record('component-render', { componentName: 'B' });
    expect(m.droppedCount).toBe(0);
  });

  it('is a no-op when disabled', () => {
    const { sent, t } = makeTransport();
    const m = new PerformanceMonitor({ ...base, customTransport: t, enabled: false }).start();
    m.record('error', { message: 'x' });
    m.stop();
    expect(sent).toHaveLength(0);
  });

  it('restores fetch on stop when network tracking is on', () => {
    const { t } = makeTransport();
    const original = window.fetch;
    const m = new PerformanceMonitor({ ...base, customTransport: t, networkTracking: true }).start();
    expect(window.fetch).not.toBe(original);
    m.stop();
    expect(window.fetch).toBe(original);
  });
});
