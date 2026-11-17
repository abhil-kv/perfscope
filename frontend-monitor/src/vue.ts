import { version, type App, type ComponentPublicInstance } from 'vue';
import { PerformanceMonitor } from './monitor';
import type { PerformanceMonitorConfig } from './types';

/** Minimal shape of Vue Router needed for route tracking. */
export interface RouterLike {
  afterEach(guard: (to: { path: string }) => void): () => void;
}

export interface VueMonitorOptions extends PerformanceMonitorConfig {
  router?: RouterLike;
}

function nameOf(vm: ComponentPublicInstance): string {
  const o = vm.$options as { name?: string; __name?: string };
  return o.name || o.__name || 'Anonymous';
}

/** Vue plugin. Install with `app.use(createPerformanceMonitor(config))`. */
export function createPerformanceMonitor(options: VueMonitorOptions = {}) {
  const { router, ...config } = options;
  const monitor = new PerformanceMonitor(config, { name: 'vue', version });

  return {
    monitor,
    install(app: App) {
      monitor.start();
      const unhook: Array<() => void> = [];

      if (monitor.config.environment !== 'production') app.config.performance = true;

      if (router) {
        monitor.setRoute(location.pathname);
        unhook.push(
          router.afterEach((to) => {
            monitor.setRoute(to.path);
            monitor.record('navigation', { kind: 'route-change', route: to.path });
          }),
        );
      }

      if (monitor.config.errorTracking) {
        const previous = app.config.errorHandler;
        app.config.errorHandler = (err, instance, info) => {
          monitor.record('error', {
            kind: 'vue',
            name: err instanceof Error ? err.name : 'NonError',
            message: (err instanceof Error ? err.message : String(err)).slice(0, 500),
            info,
          });
          if (previous) previous(err, instance, info);
          else console.error(err);
        };
      }

      if (monitor.config.componentTracking) {
        const starts = new WeakMap<object, { t: number; phase: 'mount' | 'update' }>();
        const begin = (phase: 'mount' | 'update') =>
          function (this: ComponentPublicInstance) {
            starts.set(this, { t: performance.now(), phase });
          };
        const end = (phase: 'mount' | 'update') =>
          function (this: ComponentPublicInstance) {
            const s = starts.get(this);
            monitor.record('component-render', {
              componentName: nameOf(this),
              phase,
              duration: s ? performance.now() - s.t : null,
            });
          };
        app.mixin({
          beforeMount: begin('mount'),
          mounted: end('mount'),
          beforeUpdate: begin('update'),
          updated: end('update'),
          unmounted(this: ComponentPublicInstance) {
            monitor.record('component-render', { componentName: nameOf(this), phase: 'unmount', duration: null });
          },
        });
      }

      const originalUnmount = app.unmount.bind(app);
      app.unmount = () => {
        unhook.forEach((fn) => fn());
        monitor.stop();
        originalUnmount();
      };
    },
  };
}

export type { PerformanceMonitorConfig };
