import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import type { Plugin, ViteDevServer } from 'vite';
import { dashboardHtml } from './dashboard';
import { MAX_MESSAGE_BYTES, parseBatch } from './protocol';
import { normalizePath } from './config';
import type { PerformanceEvent } from './types';

export interface PerformanceMonitorPluginOptions {
  /** Dashboard URL path. Default `/performance`. */
  dashboardPath?: string;
  /** Number of recent events replayed to a newly opened dashboard. Default 5000. */
  historySize?: number;
  /** Maximum simultaneous WebSocket connections. Default 50. */
  maxConnections?: number;
  /**
   * Also allow non-loopback hosts (e.g. when Vite is started with `--host`).
   * Default false: connections from non-loopback remote addresses are rejected.
   */
  allowRemote?: boolean;
}

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/** Vite dev-server plugin: serves the dashboard and relays telemetry over a local WebSocket. Dev only. */
export function performanceMonitorPlugin(options: PerformanceMonitorPluginOptions = {}): Plugin {
  const path = normalizePath(options.dashboardPath ?? '/performance');
  const wsPath = `${path}/ws`;
  const historySize = options.historySize ?? 5000;
  const maxConnections = options.maxConnections ?? 50;

  return {
    name: 'frontend-monitor',
    apply: 'serve', // never part of production builds
    configureServer(server: ViteDevServer) {
      const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });
      const apps = new Set<WebSocket>();
      const dashboards = new Set<WebSocket>();
      let history: PerformanceEvent[] = [];

      server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
        const url = (req.url ?? '').split('?')[0];
        if (req.method !== 'GET' || (url !== path && url !== `${path}/`)) return next();
        if (!isAllowed(req.socket.remoteAddress, options.allowRemote)) {
          res.statusCode = 403;
          res.end('Forbidden');
          return;
        }
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Referrer-Policy', 'no-referrer');
        res.end(dashboardHtml(path));
      });

      const onUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer) => {
        const parsed = new URL(req.url ?? '', 'http://localhost');
        if (parsed.pathname !== wsPath) return; // leave Vite HMR and others alone
        const origin = req.headers.origin;
        const sameOrigin = !origin || safeHost(origin) === req.headers.host;
        if (
          !sameOrigin ||
          !isAllowed(req.socket.remoteAddress, options.allowRemote) ||
          apps.size + dashboards.size >= maxConnections
        ) {
          socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
          socket.destroy();
          return;
        }
        const role = parsed.searchParams.get('role') === 'dashboard' ? 'dashboard' : 'app';
        wss.handleUpgrade(req, socket, head, (ws) => {
          (role === 'dashboard' ? dashboards : apps).add(ws);
          ws.on('close', () => (role === 'dashboard' ? dashboards : apps).delete(ws));
          ws.on('error', () => ws.terminate());

          if (role === 'dashboard') {
            ws.send(JSON.stringify({ kind: 'history', events: history }));
            ws.on('message', (data) => {
              if (data.toString() === '{"kind":"clear"}') {
                history = [];
                for (const d of dashboards) d.send(JSON.stringify({ kind: 'clear' }));
              }
            });
            return;
          }
          ws.on('message', (data) => {
            const batch = parseBatch(data.toString());
            if (!batch) return ws.close(1008, 'invalid message');
            history = history.concat(batch.events).slice(-historySize);
            const out = JSON.stringify(batch);
            for (const d of dashboards) if (d.readyState === 1) d.send(out);
          });
        });
      };

      server.httpServer?.on('upgrade', onUpgrade);
      server.httpServer?.on('close', () => {
        for (const ws of [...apps, ...dashboards]) ws.terminate();
        wss.close();
      });
    },
  };
}

function isAllowed(address: string | undefined, allowRemote?: boolean): boolean {
  return allowRemote === true || (address !== undefined && LOOPBACK.has(address));
}

function safeHost(origin: string): string | null {
  try {
    return new URL(origin).host;
  } catch {
    return null;
  }
}
