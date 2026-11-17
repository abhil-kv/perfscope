# Frontend Performance Monitor

A lightweight, open-source performance monitoring toolkit for **React, Preact, and Vue.js** applications.

Install a package, wrap your app, start your dev server, and open a live dashboard in a second browser tab, with no external service or account required.

```bash
npm install perfscope
```

```text
http://localhost:5173/performance
```

> **Project status:** This README describes the proposed product and implementation specification. Package names, APIs, integrations, and features are illustrative until implemented and published. Do not assume the example commands work before the corresponding packages are released. Items marked **(Planned)** are not part of the MVP.

---

## Table of contents

1. [What you get](#1-what-you-get)
2. [Quick start (5 steps)](#2-quick-start-5-steps)
3. [Step-by-step setup per framework](#3-step-by-step-setup-per-framework)
   - [React](#31-react)
   - [Preact](#32-preact)
   - [Vue](#33-vue)
4. [Dev-server integration (Vite)](#4-dev-server-integration-vite)
5. [Using the dashboard](#5-using-the-dashboard)
6. [Component tree and optimization suggestions (Planned)](#6-component-tree-and-optimization-suggestions-planned)
7. [What is monitored](#7-what-is-monitored)
8. [Configuration reference](#8-configuration-reference)
9. [Telemetry event schema](#9-telemetry-event-schema)
10. [Architecture](#10-architecture)
11. [Monorepo structure](#11-monorepo-structure)
12. [Performance overhead](#12-performance-overhead)
13. [Privacy and security](#13-privacy-and-security)
14. [Browser compatibility](#14-browser-compatibility)
15. [Troubleshooting](#15-troubleshooting)
16. [Contributing: develop locally](#16-contributing-develop-locally)
17. [Testing strategy](#17-testing-strategy)
18. [Publishing to npm (maintainers)](#18-publishing-to-npm-maintainers)
19. [Roadmap](#19-roadmap)
20. [MVP acceptance criteria](#20-mvp-acceptance-criteria)
21. [Existing projects to study](#21-existing-projects-to-study)
22. [License](#22-license)

---

## 1. What you get

The toolkit helps you answer:

- Is the application loading quickly?
- Are user interactions responsive?
- Which components render slowly or unusually often?
- Which API requests are slow or failing?
- Is JavaScript blocking the main thread?
- Is memory usage growing over time?
- Which routes perform worst?
- Did a recent change introduce a regression?

### Product principles

1. **Install and use:** standard monitoring needs minimal setup.
2. **Framework independent:** React, Preact, and Vue share one core engine and event model.
3. **Local-first:** works without a SaaS account or hosted backend.
4. **Actionable:** attribution and context, not isolated numbers.
5. **Low overhead:** monitoring must not become a source of slowdown.
6. **Privacy by default:** no sensitive data collected unnecessarily.
7. **Progressive enhancement:** unsupported browser APIs degrade gracefully.
8. **Extensible:** custom metrics, transports, and backends.

### Feature overview

| Area | Capabilities | Priority |
|---|---|---:|
| Core Web Vitals | LCP, INP, CLS, FCP, TTFB | P0 |
| Component profiling | Render count and duration, mount/update tracking | P0 |
| Network monitoring | Fetch/XHR duration, status, failures | P0 |
| Navigation | Initial load and SPA route transitions | P0 |
| Error monitoring | Runtime errors and unhandled rejections | P0 |
| Local dashboard | `/performance`, live updates, filters | P0 |
| Long tasks | Main-thread blocking | P1 |
| Long animation frames | Slow-frame attribution where supported | P1 |
| Memory trends | Heap measurements where supported | P1 |
| Component tree + suggestions | Tree view, per-node metrics, best-practice hints | P1 (Planned) |
| Regression analysis | Release comparisons and alerts | P2 |
| Production telemetry | Configurable remote transport | P2 |

P0 means required for the first usable MVP.

---

## 2. Quick start (5 steps)

```text
Developer
   |  1. npm install
   v
Install package
   |  2. Wrap app / register plugin
   v
   |  3. Add Vite plugin
   v
Start dev server  (4. npm run dev)
   |
   +--------------------------+
   v                          v
App tab                  Dashboard tab (5. open /performance)
   |  interactions            ^
   v                          |
Collectors -> buffer -> local WebSocket
```

**Step 1: Install**

```bash
npm install perfscope
```

**Step 2: Wrap your app** (React shown; see [section 3](#3-step-by-step-setup-per-framework) for Preact and Vue)

```tsx
import { PerformanceMonitor } from 'perfscope/react';
import App from './App';

export default function Root() {
  return (
    <PerformanceMonitor>
      <App />
    </PerformanceMonitor>
  );
}
```

**Step 3: Add the Vite plugin**

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { performanceMonitorPlugin } from 'perfscope/vite';

export default defineConfig({
  plugins: [performanceMonitorPlugin({ dashboardPath: '/performance' })],
});
```

**Step 4: Start the dev server**

```bash
npm run dev
```

**Step 5: Open the dashboard in a second tab**

```text
http://localhost:5173/performance
```

Interact with your app in the first tab. Events appear in the dashboard in near real time, with no refresh needed.

> The provider alone cannot create a server-served route. The `/performance` page is supplied by the dev-server plugin (or a standalone dashboard server). See [section 4](#4-dev-server-integration-vite).

---

## 3. Step-by-step setup per framework

All adapters use the same core engine and event schema. An adapter owns only framework-specific instrumentation. Web Vitals, network, memory, and transport live in the core.

| Capability | React | Preact | Vue |
|---|---|---|---|
| Web Vitals | Core | Core | Core |
| Network | Core | Core | Core |
| Memory | Core | Core | Core |
| JavaScript errors | Core + adapter | Core + adapter | Core + adapter |
| Component profiling | React adapter | Preact adapter | Vue adapter |
| Lifecycle tracking | React adapter | Preact adapter | Vue adapter |
| Routing | Optional router adapter | Optional/custom adapter | Vue Router adapter |

### 3.1 React

1. Install the package: `npm install perfscope`
2. Open your entry file (for example `main.tsx`).
3. Wrap your root component:

```tsx
import { createRoot } from 'react-dom/client';
import { PerformanceMonitor } from 'perfscope/react';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <PerformanceMonitor
    config={{
      enabled: true,
      componentTracking: true,
      networkTracking: true,
      memoryTracking: true,
      webVitals: true,
      navigationTracking: true,
      errorTracking: true,
    }}
  >
    <App />
  </PerformanceMonitor>
);
```

4. Add the [Vite plugin](#4-dev-server-integration-vite).
5. Run the app and open `/performance`.

**How component profiling works:** the adapter uses the React `Profiler` API and normalizes each callback into a `component-render` event:

```tsx
import { Profiler } from 'react';

function onRender(
  id: string,
  phase: 'mount' | 'update' | 'nested-update',
  actualDuration: number,
  baseDuration: number,
  startTime: number,
  commitTime: number
) {
  // Normalize and send to the monitoring core.
}

export function MonitoredDashboard() {
  return (
    <Profiler id="Dashboard" onRender={onRender}>
      <Dashboard />
    </Profiler>
  );
}
```

**Limitations:**
- Profiler detail depends on the React build. Production builds may expose little or no timing unless a profiling build is used. Production profiling limits are documented, and development-level detail is never promised in production.
- React Strict Mode double-invokes renders in development, so counts can look doubled. The adapter should be tested against this and document it.

### 3.2 Preact

1. Install the package: `npm install perfscope`
2. Wrap your root:

```tsx
import { render } from 'preact';
import { PerformanceMonitor } from 'perfscope/preact';
import App from './App';

render(
  <PerformanceMonitor
    config={{
      enabled: true,
      componentTracking: true,
      networkTracking: true,
      webVitals: true,
    }}
  >
    <App />
  </PerformanceMonitor>,
  document.getElementById('app')!
);
```

3. Add the Vite plugin and open `/performance`.

**Implementation notes:** Preact is not assumed to be compatible with the React Profiler API. The adapter investigates lifecycle and hook instrumentation, Preact DevTools integration points, and render/diff instrumentation only where stable. Undocumented internals are isolated behind a version-specific adapter.

### 3.3 Vue

1. Install the package: `npm install perfscope`
2. Register the plugin before mounting:

```ts
import { createApp } from 'vue';
import { createPerformanceMonitor } from 'perfscope/vue';
import App from './App.vue';

const app = createApp(App);

app.use(
  createPerformanceMonitor({
    enabled: true,
    componentTracking: true,
    networkTracking: true,
    webVitals: true,
    navigationTracking: true,
  })
);

app.mount('#app');
```

3. Add the Vite plugin and open `/performance`.

**Instrumentation points:** `app.config.performance`, component lifecycle hooks, `onRenderTracked`, `onRenderTriggered`, and Vue DevTools integration points. The reactivity debug hooks are development diagnostics, not a universal production profiler.

---

## 4. Dev-server integration (Vite)

A browser-side package cannot register a server route on its own. The Vite plugin does the following:

1. Serves the dashboard at `/performance`.
2. Accepts monitoring events over a local WebSocket (`/performance/ws`).
3. Broadcasts events to connected dashboard tabs.
4. Leaves the monitored app's routing intact.
5. Validates message shape and enforces payload limits.
6. Binds to loopback by default and does not expose an unauthenticated telemetry endpoint publicly.

### Setup steps

1. Install as a dev dependency if you only want it in development:

```bash
npm install -D perfscope
```

2. Edit `vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import { performanceMonitorPlugin } from 'perfscope/vite';

export default defineConfig({
  plugins: [
    performanceMonitorPlugin({
      dashboardPath: '/performance',
    }),
  ],
});
```

3. Start the server with `npm run dev`.
4. Open `http://localhost:5173/performance` (adjust the port to yours).

### Endpoints

```text
GET       /performance
WebSocket /performance/ws
```

### Other dev servers

Webpack and others get equivalent adapters in later releases. For unsupported servers, use a standalone local dashboard server or a custom transport.

### Dashboard isolation

The dashboard is served as a separate page and excluded from instrumentation, so its own activity never pollutes your app's metrics.

---

## 5. Using the dashboard

Open the dashboard in a **separate tab**, then interact with the app in the other tab.

```text
<application-origin>/performance
```

### Sections

| Section | What it shows |
|---|---|
| **Overview** | Core Web Vitals, loading metrics, slow interactions, total and failed requests, JS errors, memory observations |
| **Components** | Render counts, average and total observed duration, slowest and most frequently updated components, event timeline |
| **Network** | Request timeline, slowest endpoints, failures, resource duration and size |
| **Browser performance** | Long Tasks, Long Animation Frames, main-thread blocking, memory trend, resource timing |
| **Navigation** | Route transitions, route-level measurements, history, route comparison |
| **Errors** | Runtime errors, unhandled rejections, failed requests, frequency and context |
| **Settings** | Toggle collectors, sampling, buffer and flush, clear data, export JSON, exclusions and privacy rules |

### Typical workflow

1. **Reproduce a slow scenario** in the app tab (open a page, click a button, scroll a list).
2. **Check Overview** for red or amber Web Vitals.
3. **Open Components** and sort by total observed duration to find expensive components.
4. **Open Network** and sort by duration to find slow or failing endpoints.
5. **Open Browser performance** to see whether long tasks line up with the slow moment.
6. **Filter** by route, component, event type, or time window to narrow down.
7. **Export JSON** to attach to a bug report or compare before and after a fix.
8. **Clear** the data and repeat after changing code.

### Reading the numbers correctly

- **Render duration, commit duration, layout, paint, and total interaction latency are different measurements.** They are shown separately and are never summed.
- A repeated render is not automatically wasted. The dashboard flags *potentially* avoidable updates only when evidence exists.
- An unsupported metric is shown as **unavailable**, never as `0`.
- A rising heap alone does not prove a memory leak.

### Dashboard behaviour

The dashboard opens in a separate tab, updates live, filters by route, component, event type, and time, supports clear and export, recovers from transport disconnects, does not modify the monitored app's UI or routes, and does not measure itself.

---

## 6. Component tree and optimization suggestions (Planned)

> This section is a post-MVP feature set (P1). It builds on the component profiling data above.

### Component tree view

- Each component is a **node** in a collapsible tree built from parent context where it can be safely obtained.
- Each node shows name, render count, total and self duration, and a heat color (green to red) by cost.
- Search and filter: slow only, frequent renders, has suggestions.

### Node detail panel (on click)

| Data | Description |
|---|---|
| Metrics | Mount, update, and render counts; total, self, average, and max duration |
| Timeline | Render durations across commits |
| Render reasons | Props, state, context, or parent re-render, where the framework exposes it |
| Network | Requests initiated while this component was active, with time to response |
| Wrapping status | Whether it is memoized or lazy-loaded, where detectable |
| Suggestions | Rule-based hints (below), each with explanation and before/after code |

### Suggestion rules (examples)

| Observation | Suggestion |
|---|---|
| Same props, frequent re-renders | Consider `React.memo` / `memo` (Preact) / `v-memo` (Vue) |
| High render time with computation in render | Consider `useMemo` / `computed`, or move work out of render |
| New object, array, or function props each render | Stabilize with `useMemo` / `useCallback` |
| Heavy component loaded eagerly on a route | Consider `React.lazy` + `Suspense` / `defineAsyncComponent` |
| Very long rendered lists | Consider virtualization |
| Context value changes every render | Memoize the value or split the context |
| Sequential dependent requests | Parallelize, hoist, or use route loaders or a data cache |
| Duplicate requests | Add caching or request deduplication |

**Rules for rules:** a suggestion fires only when measured data supports it, shows its confidence, and says what evidence triggered it. Suggestions are hints, not verdicts. Check them against your actual code before applying them.

Static source analysis (for example detecting missing `key` props or static imports of route components) is a further optional extension.

---

## 7. What is monitored

### 7.1 Core Web Vitals

Uses the official [`web-vitals`](https://github.com/GoogleChrome/web-vitals) library rather than reimplementing the algorithms.

| Metric | Meaning | Good | Needs improvement | Poor |
|---|---|---:|---:|---:|
| LCP | Largest Contentful Paint | ≤ 2.5 s | 2.5–4 s | > 4 s |
| INP | Interaction to Next Paint | ≤ 200 ms | 200–500 ms | > 500 ms |
| CLS | Cumulative Layout Shift | ≤ 0.1 | 0.1–0.25 | > 0.25 |
| FCP | First Contentful Paint | ≤ 1.8 s | 1.8–3 s | > 3 s |
| TTFB | Time to First Byte | ≤ 0.8 s | 0.8–1.8 s | > 1.8 s |

The dashboard shows the latest value and rating, session history, route breakdown where semantics allow, attribution details where available, and unavailable status when a metric cannot be measured.

Web Vitals have specific aggregation rules. SPA route transitions are not treated as fresh page loads, and values from different metric lifecycles are not combined without a clear definition.

### 7.2 Component rendering performance

Collected where the framework supports it: render count and duration, mount and update activity, commit timing, unmount events, frequently updated and slow components, and parent context.

Illustrative table:

| Component | Render count | Total observed duration | Average |
|---|---:|---:|---:|
| Dashboard | 15 | 145 ms | 9.7 ms |
| Navigation | 4 | 12 ms | 3 ms |
| AnalyticsChart | 18 | 480 ms | 26.7 ms |
| UserProfile | 3 | 18 ms | 6 ms |

### 7.3 JavaScript and main-thread performance

Long Tasks API and Long Animation Frames entries, main-thread blocking observations, runtime errors, unhandled rejections, script timing, and custom User Timing marks and measures.

```text
Long task detected
Duration: 320 ms
Start time: 1240 ms
Route: /dashboard
Source attribution: available only where the browser exposes it
```

These APIs differ across browsers, so feature detection is used. A missing entry does not mean the page has no problem.

### 7.4 Network and resource monitoring

Fetch and XHR duration, HTTP status, failed and timed-out requests where observable, slow endpoints, resource loading duration, transfer and encoded sizes, and script, stylesheet, image, and font timing.

| Request | Duration | Status |
|---|---:|---:|
| `/api/users` | 120 ms | 200 |
| `/api/dashboard` | 1,850 ms | 200 |
| `/api/analytics` | 3,200 ms | 500 |

Implementation rules:
- Resource Timing is the base source. Fetch/XHR instrumentation is **opt-in**.
- Original request semantics, bodies, headers, errors, and timing are preserved.
- Response bodies are not consumed or cloned unless explicitly required.
- Payloads are not recorded by default.
- Query parameters and sensitive URL segments are redacted per configuration.
- Authorization headers, cookies, and tokens are never collected.

### 7.5 Memory monitoring

JS heap usage, heap trends, observations across route navigation, and repeated growth patterns, where browser APIs permit.

```text
Initial observed heap: 45 MB
After navigation:      68 MB
After repeated routes: 125 MB
Observation: heap usage increased during this session.
```

Memory APIs are not universal and may be approximate. The SDK does not claim to identify detached DOM nodes or all allocations.

### 7.6 Navigation and routing

Initial document navigation, SPA navigation start and completion, transition duration, route-associated API activity, lazy-module activity, navigation failures, and back/forward and BFCache restoration where observable.

Optional adapters: React Router, Vue Router, and custom routers. Global history methods are not patched without a documented opt-in. Router adapters use supported lifecycle APIs where possible.

### 7.7 Error and stability monitoring

Uncaught errors, unhandled rejections, resource load errors, failed API requests, dynamic chunk load failures, and framework error notifications. Errors can be correlated with route, application version, framework version, and session performance events. Source code, local variables, and form values are not collected by default.

---

## 8. Configuration reference

```ts
export interface PerformanceMonitorConfig {
  enabled?: boolean;

  dashboard?: boolean;
  dashboardPath?: string;

  componentTracking?: boolean;
  networkTracking?: boolean;
  memoryTracking?: boolean;
  webVitals?: boolean;
  navigationTracking?: boolean;
  errorTracking?: boolean;
  longTaskTracking?: boolean;

  samplingRate?: number;
  bufferSize?: number;
  flushInterval?: number;

  environment?: 'development' | 'production' | 'test';

  debug?: boolean;

  excludeRoutes?: string[];
  redactQueryParams?: string[];

  transport?: 'local' | 'custom' | 'remote';
}
```

Example:

```tsx
<PerformanceMonitor
  config={{
    enabled: true,
    componentTracking: true,
    networkTracking: true,
    webVitals: true,
    samplingRate: 1,
    bufferSize: 500,
    flushInterval: 1000,
    environment: 'development',
    debug: false,
    excludeRoutes: ['/performance'],
    redactQueryParams: ['token', 'session', 'email'],
  }}
>
  <App />
</PerformanceMonitor>
```

Rules:
- Configuration is validated at initialization.
- Defaults are documented for every option.
- Development and production defaults are explicit.
- Expensive instrumentation is **not** silently enabled in production.
- Unsupported features report availability clearly.
- Collectors can be enabled and disabled independently.

---

## 9. Telemetry event schema

All collectors and adapters normalize measurements into one format.

```ts
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

export interface PerformanceEvent {
  id: string;
  type: PerformanceEventType;
  timestamp: number;

  application: {
    name?: string;
    version?: string;
    environment?: string;
  };

  sessionId?: string;

  framework?: {
    name: 'react' | 'preact' | 'vue';
    version?: string;
  };

  page: {
    url: string;
    route?: string;
  };

  metrics: Record<string, string | number | boolean | null>;
}
```

Event-specific fields are documented and validated. Large arbitrary objects do not go into `metrics`.

Example component event (illustrative; real IDs and timestamps are SDK-generated):

```json
{
  "id": "event-001",
  "type": "component-render",
  "timestamp": 1731840000000,
  "framework": { "name": "react", "version": "x.y.z" },
  "page": {
    "url": "http://localhost:5173/dashboard",
    "route": "/dashboard"
  },
  "metrics": {
    "componentName": "AnalyticsChart",
    "phase": "update",
    "duration": 26.7
  }
}
```

---

## 10. Architecture

```text
            Monitored application
            React / Preact / Vue
                     |
                     v
              Framework adapter
                     |
                     v
        Framework-independent monitoring core
                     |
      +--------------+--------------+
      v              v              v
  Web Vitals      Network       Components
      +--------------+--------------+
                     |
                     v
             Event normalization
                     |
                     v
               Bounded buffer
                     |
                     v
            Local transport (WebSocket)
                     |
                     v
              Development server
                     |
                     v
           /performance dashboard
```

### Event lifecycle

```text
Browser / framework observation
        -> Collector callback
        -> Privacy filtering
        -> Event normalization
        -> Sampling policy
        -> Bounded event buffer
        -> Batch / flush policy
        -> Selected transport
```

### Responsibilities

| Layer | Owns |
|---|---|
| **Core** | Feature detection, collector lifecycle, observer reuse and cleanup, normalization, sampling, bounded buffering, transport abstraction, privacy filtering, config validation |
| **Adapters** | Framework lifecycle integration, component profiling, framework error integration, cleanup, framework and version metadata |
| **Dashboard** | Visualization, filtering and sorting, metric interpretation, timelines, local export, dashboard settings |

The dashboard consumes the common schema and needs no framework-specific knowledge except for optional detail.

### Collection APIs

| API | Purpose |
|---|---|
| Performance API | Browser performance timeline |
| PerformanceObserver | Observe supported entries |
| Navigation Timing | Document navigation |
| Resource Timing | Resource loading |
| User Timing | Custom marks and measures |
| Long Tasks API | Long main-thread tasks |
| Long Animation Frames API | Slow-frame observations |
| Page Visibility API | Visibility and flush lifecycle |
| `navigator.sendBeacon()` | Best-effort delivery on page exit |
| Memory APIs | Heap observations where supported |

### Local transport

- Events go into a bounded in-memory queue and are batched.
- Batches go to the dev-server WebSocket.
- Disconnects and reconnects are handled safely.
- Message size limits apply.
- Low-priority events are dropped or sampled when the buffer is full, and dropped counts appear in debug mode.

### Remote transport (later)

A transport interface lets you plug in your own ingestion service or an OpenTelemetry-compatible pipeline. A hosted service is never mandatory.

---

## 11. Monorepo structure

```text
frontend-monitor/
├── packages/
│   ├── core/
│   │   └── src/
│   │       ├── collectors/
│   │       │   ├── web-vitals/
│   │       │   ├── network/
│   │       │   ├── memory/
│   │       │   ├── navigation/
│   │       │   ├── resources/
│   │       │   ├── long-tasks/
│   │       │   └── errors/
│   │       ├── observers/
│   │       ├── transport/
│   │       ├── buffering/
│   │       ├── sampling/
│   │       ├── privacy/
│   │       └── types/
│   ├── react/        # PerformanceMonitor.tsx, profiler/, hooks/
│   ├── preact/       # PerformanceMonitor.tsx, profiler/, hooks/
│   ├── vue/          # plugin/, composables/, profiler/
│   ├── dashboard/    # components/, pages/, charts/, views/
│   ├── vite/         # plugin/
│   └── shared/       # event-schema/, utilities/
├── examples/
│   ├── react/
│   ├── preact/
│   └── vue/
├── tests/
├── pnpm-workspace.yaml
├── package.json
├── tsconfig.json
└── README.md
```

### Publishing strategy

**Option A: single package with subpath exports** (recommended first)

```text
perfscope
perfscope/react
perfscope/preact
perfscope/vue
perfscope/vite
```

**Option B: separate packages**

```text
perfscope-core
perfscope-react
perfscope-preact
perfscope-vue
perfscope-vite
perfscope-dashboard
```

Option B allows installing only what you need but adds release and dependency complexity. Develop as a monorepo, publish as Option A first, and split later if bundle size or demand justifies it.

### Technology choices

| Layer | Technology |
|---|---|
| Language | TypeScript |
| Monorepo | pnpm workspaces |
| Build | tsup or Vite library mode |
| Core metrics | `web-vitals` |
| React integration | React Profiler API |
| Preact integration | Lifecycle instrumentation |
| Vue integration | Lifecycle and performance APIs |
| Unit tests | Vitest |
| Browser tests | Playwright |
| Dashboard | React + TypeScript |
| Charts | Recharts or another lightweight library |
| Local transport | WebSocket |
| Dev server | Vite plugin first |
| CI | GitHub Actions |
| Docs | VitePress or Markdown |

The core engine stays independent of the dashboard framework and build tooling.

---

## 12. Performance overhead

Monitoring must not become the problem. Requirements:

- Small, tree-shakeable core bundle.
- Lazy initialization where practical.
- Bounded buffers and batched telemetry.
- Minimal work in observer callbacks; reusable observers.
- Configurable sampling.
- Proper cleanup and disposal.
- No unnecessary app state updates.
- No dashboard rendering inside the monitored app tree.
- Graceful handling of unsupported APIs.

Guidance:
- Use `requestIdleCallback` for non-critical processing, with a fallback.
- Use Web Workers only for genuinely expensive processing.
- Use `sendBeacon` for best-effort page-exit delivery, and flush on visibility changes.
- Do not capture every component render in production by default.
- Measure the SDK's own bundle size, CPU, memory, and event volume.

Set explicit overhead budgets and benchmark them against representative apps. Do not claim zero overhead.

---

## 13. Privacy and security

### Default protections

1. Never capture password or form input values.
2. Never collect cookies or authorization headers.
3. Never collect request or response payloads by default.
4. Redact sensitive URL query parameters.
5. Allow routes to be excluded.
6. Provide configurable data masking.
7. Allow collectors to be disabled individually.
8. Support consent-aware initialization.
9. Use HTTPS for remote telemetry.
10. Configure retention and deletion in any backend integration.

### Local dashboard security

- Bind local services to loopback by default.
- Do not expose the dashboard or WebSocket publicly without explicit configuration.
- Validate WebSocket messages; limit message sizes and connection counts.
- Do not treat the dev dashboard as a production admin interface.
- Ensure production builds cannot accidentally expose dev-only endpoints.

Review GDPR and other regional requirements before collecting real-user telemetry.

---

## 14. Browser compatibility

Targets current Chrome, Firefox, Safari, and Edge. Feature detection is used instead of browser-name checks. Detailed task attribution and memory measurements are browser-dependent.

The dashboard distinguishes these states:

| State | Meaning |
|---|---|
| Supported and measured | Data collected |
| Supported, no event observed | API available, nothing happened yet |
| Unsupported by browser | API missing |
| Disabled by configuration | Turned off in config |
| Temporarily unavailable | Transient failure |

An unsupported metric is never shown as zero.

---

## 15. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `/performance` returns 404 | Vite plugin not registered | Add `performanceMonitorPlugin()` to `vite.config.ts` and restart the dev server |
| Dashboard opens but shows no events | App not wrapped, or collectors disabled | Confirm the provider or plugin is mounted and `enabled: true`; check the dashboard connection status |
| Dashboard stays "disconnected" | WebSocket blocked or wrong port | Check `/performance/ws` in the Network tab; verify the dev server port and any proxy config |
| Component data is empty in production | Production React build has no profiling | Use development mode or a profiling build; see React limitations above |
| Render counts look doubled | React Strict Mode in development | Expected in dev; compare against a non-Strict run |
| A metric shows "unavailable" | Browser does not support the API | See the [compatibility states](#14-browser-compatibility) |
| Dashboard metrics are mixed into app data | Dashboard route not excluded | Confirm `excludeRoutes` includes the dashboard path (should be the default) |
| Network events missing | Fetch/XHR instrumentation is opt-in | Set `networkTracking: true` |
| Worried about overhead | Too much instrumentation | Lower `samplingRate`, disable collectors you don't need, check `debug: true` for dropped counts |

---

## 16. Contributing: develop locally

### Prerequisites

- Node.js (current LTS)
- pnpm (`npm install -g pnpm`)
- Git

### Step by step

1. **Fork and clone**

```bash
git clone https://github.com/<your-user>/frontend-monitor.git
cd frontend-monitor
```

2. **Install dependencies**

```bash
pnpm install
```

3. **Build all packages**

```bash
pnpm -r build
```

4. **Run an example app** (for example React)

```bash
cd examples/react
pnpm dev
```

5. **Open the app and the dashboard** in two tabs (`http://localhost:5173` and `http://localhost:5173/performance`).

6. **Make a change** in the relevant package (`core`, an adapter, `dashboard`, or `vite`). Keep framework-specific logic inside its adapter.

7. **Run the tests**

```bash
pnpm -r test
```

8. **Create a branch and open a pull request**

```bash
git checkout -b feat/my-change
git commit -am "feat: describe the change"
git push origin feat/my-change
```

### Pull request checklist

1. Discuss major architectural changes in an issue first.
2. Add or update tests for changed behaviour.
3. Keep framework-specific logic inside its adapter.
4. Preserve the common event schema.
5. Document browser API limitations.
6. Verify monitoring failures cannot crash the host app.
7. Include overhead measurements for significant instrumentation changes.

Maintain clear boundaries between core collectors, adapters, transports, and dashboard code.

---

## 17. Testing strategy

### Unit (Vitest)

Collector behaviour, event normalization, sampling, buffer limits, privacy filtering, config validation, transport retries and cleanup, unsupported API handling.

### Framework

React, Preact, and Vue testing utilities. Cover initialization and teardown, mount and update events, repeated initialization, React Strict Mode, framework error integration, component identity and naming, and compatibility across supported framework versions.

### Browser (Playwright)

Dashboard route availability, WebSocket delivery, live updates, navigation tracking, network monitoring, error collection, API fallbacks, dashboard exclusion from app metrics, disconnect and reconnect, and data export.

### Performance

Benchmark representative apps with and without the SDK. Measure bundle size, CPU, memory, event volume, main-thread impact, and transport overhead. Compare Web Vitals output with the official `web-vitals` library and verify semantics against browser tooling.

---

## 18. Publishing to npm (maintainers)

1. **Choose a package name and scope** and confirm it is free: `npm view perfscope`
2. **Add a license** (MIT is a simple permissive option) and fill in `package.json` (`name`, `version`, `description`, `repository`, `license`, `keywords`).
3. **Configure subpath exports** in `package.json`:

```json
{
  "exports": {
    ".":        { "types": "./dist/index.d.ts",  "import": "./dist/index.js" },
    "./react":  { "types": "./dist/react.d.ts",  "import": "./dist/react.js" },
    "./preact": { "types": "./dist/preact.d.ts", "import": "./dist/preact.js" },
    "./vue":    { "types": "./dist/vue.d.ts",    "import": "./dist/vue.js" },
    "./vite":   { "types": "./dist/vite.d.ts",   "import": "./dist/vite.js" }
  },
  "sideEffects": false,
  "files": ["dist"]
}
```

4. **Mark framework packages as optional peer dependencies** (`react`, `preact`, `vue`, `vite`) so users install only what they use.
5. **Add versioning and a changelog** (for example Changesets or semantic-release).
6. **Add CI** (GitHub Actions) to lint, test, build, and report bundle size on every PR.
7. **Dry run the publish:** `npm pack --dry-run` and check the file list.
8. **Log in and publish:**

```bash
npm login
npm publish --access public
```

9. **Test the published package** in a clean project using the quick start above.
10. **Add contribution guidelines and issue templates.**

---

## 19. Roadmap

### Phase 1: Core SDK
- [ ] Create pnpm monorepo
- [ ] Define public API and event schema
- [ ] Implement configuration validation
- [ ] Implement collector lifecycle and cleanup
- [ ] Implement Web Vitals collection
- [ ] Implement Navigation Timing
- [ ] Implement Resource Timing
- [ ] Implement network monitoring
- [ ] Implement JavaScript error tracking
- [ ] Implement event buffering and sampling

### Phase 2: Framework adapters
- [ ] React provider and Profiler integration
- [ ] Preact provider and lifecycle/render instrumentation
- [ ] Vue plugin and component lifecycle monitoring
- [ ] Normalize framework events into the common schema
- [ ] Test supported framework versions

### Phase 3: Local dashboard
- [ ] Build dashboard application
- [ ] Implement Vite dev-server plugin and serve `/performance`
- [ ] Implement local WebSocket transport
- [ ] Implement event validation and batching
- [ ] Build overview, component, network, and browser performance views
- [ ] Add filters and JSON export
- [ ] Exclude dashboard activity from application metrics

### Phase 4: Advanced monitoring
- [ ] Long Tasks monitoring
- [ ] Long Animation Frames monitoring
- [ ] Memory trend observations
- [ ] Route-level performance
- [ ] Custom User Timing integration
- [ ] Component tree view and node detail panel
- [ ] Rule-based optimization suggestions
- [ ] Performance regression analysis
- [ ] Advanced sampling and exclusions
- [ ] Custom and remote transport adapters

### Phase 5: Open-source release
- [ ] Complete documentation
- [ ] Add React, Preact, and Vue examples
- [ ] Add unit and browser tests
- [ ] Add bundle-size reporting
- [ ] Add GitHub Actions CI
- [ ] Configure npm publishing
- [ ] Add semantic versioning and changelog
- [ ] Add contribution guidelines and issue templates

---

## 20. MVP acceptance criteria

The first usable release is complete when:

- [ ] A developer can install the published package from npm.
- [ ] React apps can initialize monitoring through a provider.
- [ ] Preact apps can initialize monitoring through an adapter.
- [ ] Vue apps can initialize monitoring through a plugin.
- [ ] Core Web Vitals are collected using established implementations.
- [ ] Network requests and resource timing are observable.
- [ ] Component profiling works for supported framework and runtime configurations.
- [ ] JavaScript errors are captured.
- [ ] The Vite integration serves `/performance`.
- [ ] The dashboard opens in another browser tab.
- [ ] The dashboard receives live events without manual refresh.
- [ ] Local monitoring works without an external backend.
- [ ] Dashboard activity is excluded from application metrics.
- [ ] Unsupported browser APIs are handled gracefully.
- [ ] Monitoring can be disabled and cleaned up.
- [ ] Privacy protections are enabled by default.
- [ ] SDK overhead has been benchmarked and documented.

---

## 21. Existing projects to study

Learn from these implementations and reuse standards-compliant libraries instead of duplicating whole products.

| Project | What to investigate |
|---|---|
| [web-vitals](https://github.com/GoogleChrome/web-vitals) | Core Web Vitals measurement |
| [OpenTelemetry](https://opentelemetry.io/) | Telemetry data model and instrumentation |
| [Sentry JavaScript SDK](https://github.com/getsentry/sentry-javascript) | Error and performance monitoring |
| [Perfume.js](https://github.com/Zizzamia/perfume.js) | Browser performance monitoring |
| [React DevTools](https://github.com/facebook/react) | React component profiling |
| [Vue DevTools](https://github.com/vuejs/devtools) | Vue component inspection |
| [Chrome DevTools](https://developer.chrome.com/docs/devtools/performance/) | Browser performance diagnostics |

---

## 22. License

Choose and add an OSI-approved license before publishing the repository. MIT is a simple permissive option if it matches the project's goals.

---

**Install. Wrap. Run. Monitor.**

No mandatory external service, no custom dashboard to build, and minimal setup for everyday local development.