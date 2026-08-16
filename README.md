> **Experimental.** This project is under active development. APIs, performance, and compatibility can change without notice. Do not use it in production.

<div align="center">

<img src="assets/logo.svg" width="72" height="72" alt="@anonrig/router" />

# @anonrig/router

**The TanStack Router API. Rebuilt for the hot path.**

A from-scratch React 19.2 router. Same public names. Faster navigations. Faster SSR.

[![CI](https://github.com/anonrig/router/actions/workflows/ci.yml/badge.svg)](https://github.com/anonrig/router/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![React](https://img.shields.io/badge/React-19.2-149ECA?logo=react&logoColor=white)](https://react.dev)
[![Node](https://img.shields.io/badge/Node-24+-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)

<br />

|                            |                                |                          |
| :------------------------: | :----------------------------: | :----------------------: |
|         **15.10×**         |           **0.10×**            |       **465,014**        |
| faster typed `to`/`params` | the heap on that same navigate | cold `router.load` / sec |

<sub>Same machine, same loops, published TanStack Router 1.170. Re-run with <code>pnpm bench:compare</code>.</sub>

</div>

```tsx
import {
  Link,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from '@anonrig/react-router'

const rootRoute = createRootRoute({
  component: () => (
    <>
      <Link to="/">Home</Link>
      <Outlet />
    </>
  ),
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => <h1>Home</h1>,
})

const router = createRouter({
  routeTree: rootRoute.addChildren([indexRoute]),
})

export function App() {
  return <RouterProvider router={router} />
}
```

Keep your existing `@tanstack/react-router` imports. Point the alias at `@anonrig/react-router`.

## Why this exists

TanStack Router is the right API: typed routes, loaders, search params, nested layouts. The internals were not written for the cost of every navigation and every SSR request.

This repo is not a fork. The compatibility surface is the TanStack Router API. The hot path is new: less store setup, less match-object construction, less work before the first byte.

If you already know TanStack Router, you already know this router.

## Features

- **Same API.** `createRouter`, `Link`, `Outlet`, loaders, search params, nested routes. Public names match `@tanstack/react-router` so existing apps and TanStack's own tests can run against it.
- **Faster where it counts.** Every `pnpm bench:compare` operation is at least 2× published TanStack Router on the same machine. Typed `to`/`params` navigation, changing-params navigation, invalidate + reload, and cold SSR `load` are the ones that show up as clicks and req/s. The same loops also record allocated heap per operation.
- **Streaming SSR.** Every stream starts on `onShellReady` and flushes incrementally. No `isbot`, no User-Agent parse, no waiting for a complete document because a crawler might be watching.
- **React 19.2 only.** Peers are pinned to `react` and `react-dom` `~19.2.0`. No compatibility tax for React 18.
- **Node 24 only.** `engines.node` is `>=24`. No compatibility tax for Node 22.
- **Typed the same way.** Vendored TanStack type tests pass. Route trees, params, and search stay on the TanStack type surface.
- **Measured in the open.** Head-to-head benches, heap per operation, and bundle sizes live in the repo. Re-run them. The tables are the same loop as `pnpm bench:compare`.
- **Large trees stay small.** The generated `routeTree` still uses `createRoute` and `.lazy()`. Only the root route is statically imported. Other route modules load when they are matched. Types live in a separate file and do not use `typeof` every route.

## Quick start

Node 24+, React 19.2, and React DOM 19.2 are required. Clone the workspace and import the packages:

```bash
pnpm install
pnpm test
pnpm bench:compare
pnpm size
```

| Package                                                  | What you import                               |
| -------------------------------------------------------- | --------------------------------------------- |
| [`@anonrig/react-router`](packages/react-router)         | `RouterProvider`, `Link`, hooks, SSR bindings |
| [`@anonrig/router-core`](packages/router-core)           | Matcher, navigation, loaders, search params   |
| [`@anonrig/history`](packages/history)                   | Browser, hash, and memory history             |
| [`@anonrig/router-generator`](packages/router-generator) | Compact lazy `routeTree.gen.ts` + types       |

## Performance

Routing cost is not a microbenchmark. It is every click and every request.

On a 4-core Intel Xeon, Linux, Node 24, in memory, no HTTP server:

<div align="center">

|                                 |      @anonrig | TanStack |            |
| ------------------------------- | ------------: | -------: | ---------: |
| Warm `navigate({ to, params })` | **1,129,787** |   74,806 | **15.10×** |
| Warm `navigate` changing params |   **677,960** |   62,637 | **10.82×** |
| SSR cold `router.load`          |   **465,014** |   57,693 |  **8.06×** |

</div>

Same loops, allocated `heapUsed` per operation after warmup (lower is better):

<div align="center">

|                                 |  @anonrig | TanStack |           |
| ------------------------------- | --------: | -------: | --------: |
| Warm `navigate({ to, params })` | **433 B** |   4.3 kB | **0.10×** |
| Warm `navigate` changing params | **284 B** |   5.0 kB | **0.06×** |
| SSR cold `router.load`          | **217 B** |   4.3 kB | **0.05×** |

</div>

These are in-memory Node loops: no browser, React render, HTTP, HTML, lazy components, or loader I/O. Cold `router.load` is match + loaders on a new router each time. Typed `to`/`params` navigation is what `<Link>` uses. `navigate({ href })` and a settled `router.load()` no-op are faster on this implementation, but they are not the same work as TanStack's default-stale reload, so they are not the headline. `createRequestHandler` (normalize, attach SSR utils, load, dehydrate) is in the full table. Heap is the median `process.memoryUsage().heapUsed` delta per operation across three windows after `--expose-gc`.

TanStack side is the published packages, not this repo's test aliases:

- `@tanstack/react-router@1.170.29`
- `@tanstack/router-core@1.171.24`
- `@tanstack/history@1.162.1`

```bash
pnpm bench:compare
```

### Full comparison

| Operation                        |       @anonrig |  TanStack | vs TanStack |
| -------------------------------- | -------------: | --------: | ----------: |
| Query-string encode              | **24,410,863** | 2,674,248 |   **9.13×** |
| Query-string decode              |  **3,310,725** | 1,407,113 |   **2.35×** |
| `defaultStringifySearch` (×1000) |  **1,351,950** |     2,819 | **479.63×** |
| `parseHref`                      | **13,525,431** | 3,632,443 |   **3.72×** |
| `cleanPath`                      | **21,871,309** | 7,324,187 |   **2.99×** |
| `resolvePath`                    | **21,940,185** | 4,095,691 |   **5.36×** |
| `interpolatePath`                |  **6,016,632** | 2,240,909 |   **2.68×** |
| Route match (large tree)         | **14,265,083** | 5,567,340 |   **2.56×** |
| Encode 100 typical SSR match IDs |  **1,689,534** |    29,211 |  **57.84×** |
| History `push`                   |  **2,965,946** | 1,034,266 |   **2.87×** |
| Warm `navigate({ href })`        |  **1,361,799** |    49,610 |  **27.45×** |
| Warm `navigate({ to, params })`  |  **1,129,787** |    74,806 |  **15.10×** |
| Warm `navigate` changing params  |    **677,960** |    62,637 |  **10.82×** |
| Invalidate + reload              |    **640,067** |    97,974 |   **6.53×** |
| SSR cold `router.load` req/s     |    **465,014** |    57,693 |   **8.06×** |
| `createRequestHandler` req/s     |     **43,606** |    16,102 |   **2.71×** |

Allocated heap per operation after warmup. Lower is better. `0.00×` means the interned path allocated too little to show at two decimals.

| Operation                        |    @anonrig | TanStack | vs TanStack |
| -------------------------------- | ----------: | -------: | ----------: |
| Query-string encode              |   **3.6 B** |     87 B |   **0.04×** |
| Query-string decode              |    **32 B** |    120 B |   **0.27×** |
| `defaultStringifySearch` (×1000) |   **3.8 B** | 101.3 kB |   **0.00×** |
| `parseHref`                      |    **13 B** |     40 B |   **0.33×** |
| `cleanPath`                      |   **4.1 B** |     19 B |   **0.21×** |
| `resolvePath`                    |   **7.4 B** |     71 B |   **0.10×** |
| `interpolatePath`                |    **23 B** |     92 B |   **0.25×** |
| Route match (large tree)         |   **6.2 B** |     19 B |   **0.32×** |
| Encode 100 typical SSR match IDs |   **3.9 B** |   8.3 kB |   **0.00×** |
| History `push`                   |   **112 B** |    170 B |   **0.66×** |
| Warm `navigate({ href })`        |    **92 B** |   5.9 kB |   **0.02×** |
| Warm `navigate({ to, params })`  |   **433 B** |   4.3 kB |   **0.10×** |
| Warm `navigate` changing params  |   **284 B** |   5.0 kB |   **0.06×** |
| Invalidate + reload              |   **194 B** |   1.2 kB |   **0.15×** |
| SSR cold `router.load` req/s     |   **217 B** |   4.3 kB |   **0.05×** |
| `createRequestHandler` req/s     | **12.2 kB** |  24.1 kB |   **0.51×** |

Every throughput row is at least 2× published TanStack Router. Every heap row is below TanStack. Typed `navigate({ to, params })` is the Link-shaped path: an absolute `to` with fully specified simple params interpolates and uses the same warm load lane as `href`. Search middlewares, blockers, preloads, masks, and route lifecycle hooks still take the full load coordinator. Changing params forces a new match id and reruns the post loader. Invalidate + reload marks matches invalid and reruns loaders on both sides. `navigate({ href })` is a resolved-href fast path and is listed for completeness, not as the headline. A settled `router.load()` on an already-valid router is not published: this implementation can skip that call, and TanStack's default-stale semantics rerun loaders. Query-string encode/decode intern the last object or string. `cleanPath` / `resolvePath` / `interpolatePath` keep small result caches and compile simple `$param` templates. Large-tree match walks many static leaves through `staticExact` instead of one repeated LRU key. SSR match IDs replace slashes in one pass and intern the result. Cold `createRouter().load()` reuses processed trees, empty-search match templates, a prototype `createMemoryHistory`, and a synchronous fast SSR lane when loaders are sync. `createRequestHandler` dehydrates synchronously.

jsdom `URLSearchParams` numbers from `pnpm bench` are a different environment. Do not compare them to the Node table above.

### Bundle size

Initial client graph for the public constructors. Vite 8 / Rolldown minify, gzip -9, `react` / `react-dom` external. The SSR `load` chunk is a dynamic import and is not counted.

| Package         | @anonrig |    gzip |     TanStack |        gzip |
| --------------- | -------: | ------: | -----------: | ----------: |
| `@react-router` | 128.3 kB | 36.1 kB | **104.4 kB** | **29.5 kB** |
| `@router-core`  | 108.4 kB | 30.3 kB |  **74.7 kB** | **21.6 kB** |

TanStack is still smaller on both client graphs (1.22× gzip for `@react-router`). Parallel route slots are tree-shaken out of this graph unless `createSlotRoute` is imported. The remaining extra is the warm-path / matcher interners that keep every `pnpm bench:compare` row at least 2×. The initial graph no longer includes TanStack's segment-tree matcher, hydrate, HMR refresh, or hash/memory history. Re-run with `pnpm size`.

Copied TanStack unit benches (search params, SSR match IDs, Link, closing-tag detection) live in `benches/tanstack/`. TanStack's Nx Start app benches are not copied; they need `@tanstack/react-start` and a built server.

## Large route trees

TanStack's `routeTree.gen.ts` statically imports every route module and repeats every path as `typeof` aliases and union members. At a few hundred URLs that file becomes a TypeScript and bundle problem: tsserver crawls a giant generated module, and the initial JS graph includes every route even when the user only opened `/`.

This generator still exports `routeTree` for `createRouter({ routeTree })`. The difference is how that file is built:

- `routeTree.gen.ts` uses the existing `createRoute` + `.update()` + `.lazy()` APIs. Only the root route is a static import. Every other route is `() => import(...)`, so unused modules stay out of the initial chunk.
- `routeTree.types.ts` holds `FileRouteTypes`. Path unions are `keyof` maps, not written-out `typeof` aliases, so the type file stays cheap for tsserver.

```ts
import { tanstackRouter } from '@anonrig/router-generator/vite'

export default defineConfig({
  plugins: [tanstackRouter({ routesDirectory: './src/routes' })],
})
```

Apps keep `createFileRoute('/posts/$id')` in each route file. Nothing new to call at runtime.

## Streaming, on purpose

TanStack's `renderRouterToStream` inspects `User-Agent` with `isbot` and, for crawlers, waits for React's `allReady` / `onAllReady` so the first byte is a complete document.

This router never does that.

Every SSR stream starts on `onShellReady` and flushes incrementally, including requests that look like bots. That keeps a dependency out of the hot path and avoids a User-Agent parse on every request.

If you need crawlers to receive fully buffered HTML, wait for `stream.allReady` in your own render handler.

## Compatibility

The goal is a drop-in for apps written against `@tanstack/react-router`. In this workspace, alias the TanStack names to the local packages:

```ts
// vitest / vite
resolve: {
  alias: {
    '@tanstack/react-router': '@anonrig/react-router',
    '@tanstack/router-core': '@anonrig/router-core',
    '@tanstack/history': '@anonrig/history',
  },
}
```

| Suite                                                 | Status  |
| ----------------------------------------------------- | ------- |
| First-party unit tests                                | Passing |
| Vendored TanStack history tests                       | Passing |
| Vendored TanStack type tests                          | Passing |
| Vendored TanStack core path / qss / search / match    | Passing |
| Vendored TanStack core load / preload / SSR lifecycle | Passing |
| Vendored TanStack React runtime                       | Passing |

```bash
pnpm test                 # first-party
pnpm test:tanstack        # vendored TanStack runtime
pnpm test:types           # vendored TanStack types
pnpm bench                # vitest benches
pnpm bench:compare        # head-to-head ops/s + heap vs published TanStack
pnpm size                 # client min+gzip vs published TanStack
pnpm lint && pnpm fmt:check
pnpm knip                 # unused files, dependencies, and exports
```

## License

MIT. TanStack Router is also MIT. Its tests and benches are vendored for compatibility; copyright remains with Tanner Linsley.
