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
|         **15.48×**         |           **0.02×**            |       **459,453**        |
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
| Warm `navigate({ to, params })` | **1,094,260** |   70,670 | **15.48×** |
| Warm `navigate` changing params |   **646,803** |   58,535 | **11.05×** |
| SSR cold `router.load`          |   **459,453** |   70,918 |  **6.48×** |

</div>

Same loops, allocated `heapUsed` per operation after warmup (lower is better):

<div align="center">

|                                 |  @anonrig | TanStack |           |
| ------------------------------- | --------: | -------: | --------: |
| Warm `navigate({ to, params })` |  **73 B** |   4.1 kB | **0.02×** |
| Warm `navigate` changing params | **323 B** |   2.1 kB | **0.15×** |
| SSR cold `router.load`          | **675 B** |   3.3 kB | **0.20×** |

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
| Query-string encode              | **24,366,870** | 2,671,482 |   **9.12×** |
| Query-string decode              |  **3,239,150** | 1,392,435 |   **2.33×** |
| `defaultStringifySearch` (×1000) |  **1,350,401** |     2,861 | **471.98×** |
| `parseHref`                      | **13,268,865** | 3,617,030 |   **3.67×** |
| `cleanPath`                      | **22,067,378** | 7,402,833 |   **2.98×** |
| `resolvePath`                    | **21,991,248** | 4,138,600 |   **5.31×** |
| `interpolatePath`                |  **6,453,424** | 2,230,480 |   **2.89×** |
| Route match (large tree)         | **14,699,320** | 5,574,049 |   **2.64×** |
| Encode 100 typical SSR match IDs |  **1,932,802** |    29,644 |  **65.20×** |
| History `push`                   |  **3,099,583** | 1,015,897 |   **3.05×** |
| Warm `navigate({ href })`        |  **1,322,308** |    47,206 |  **28.01×** |
| Warm `navigate({ to, params })`  |  **1,094,260** |    70,670 |  **15.48×** |
| Warm `navigate` changing params  |    **646,803** |    58,535 |  **11.05×** |
| Invalidate + reload              |    **643,116** |    95,843 |   **6.71×** |
| SSR cold `router.load` req/s     |    **459,453** |    70,918 |   **6.48×** |
| `createRequestHandler` req/s     |     **40,444** |    15,114 |   **2.68×** |

Allocated heap per operation after warmup. Lower is better. `0.00×` means the interned path allocated too little to show at two decimals.

| Operation                        |    @anonrig | TanStack | vs TanStack |
| -------------------------------- | ----------: | -------: | ----------: |
| Query-string encode              |   **3.9 B** |    141 B |   **0.03×** |
| Query-string decode              |    **25 B** |    102 B |   **0.25×** |
| `defaultStringifySearch` (×1000) |   **4.1 B** |  84.1 kB |   **0.00×** |
| `parseHref`                      |    **13 B** |     51 B |   **0.26×** |
| `cleanPath`                      |   **3.6 B** |     18 B |   **0.20×** |
| `resolvePath`                    |    **11 B** |     80 B |   **0.14×** |
| `interpolatePath`                |    **41 B** |    132 B |   **0.31×** |
| Route match (large tree)         |   **3.9 B** |     24 B |   **0.16×** |
| Encode 100 typical SSR match IDs |   **4.7 B** |  11.9 kB |   **0.00×** |
| History `push`                   |   **116 B** |    166 B |   **0.70×** |
| Warm `navigate({ href })`        |   **179 B** |   6.1 kB |   **0.03×** |
| Warm `navigate({ to, params })`  |    **73 B** |   4.1 kB |   **0.02×** |
| Warm `navigate` changing params  |   **323 B** |   2.1 kB |   **0.15×** |
| Invalidate + reload              |   **554 B** |   3.1 kB |   **0.18×** |
| SSR cold `router.load` req/s     |   **675 B** |   3.3 kB |   **0.20×** |
| `createRequestHandler` req/s     | **11.4 kB** |  21.8 kB |   **0.53×** |

Every throughput row is at least 2× published TanStack Router. Every heap row is below TanStack. Typed `navigate({ to, params })` is the Link-shaped path: an absolute `to` with fully specified simple params interpolates and uses the same warm load lane as `href`. Search middlewares, blockers, preloads, masks, and route lifecycle hooks still take the full load coordinator. Changing params forces a new match id and reruns the post loader. Invalidate + reload marks matches invalid and reruns loaders on both sides. `navigate({ href })` is a resolved-href fast path and is listed for completeness, not as the headline. A settled `router.load()` on an already-valid router is not published: this implementation can skip that call, and TanStack's default-stale semantics rerun loaders. Query-string encode/decode intern the last object or string. `cleanPath` / `resolvePath` / `interpolatePath` keep small result caches and compile simple `$param` templates. Large-tree match walks many static leaves through `staticExact` instead of one repeated LRU key. SSR match IDs replace slashes in one pass and intern the result. Cold `createRouter().load()` reuses processed trees, empty-search match templates, a prototype `createMemoryHistory`, and a synchronous fast SSR lane when loaders are sync. `createRequestHandler` dehydrates synchronously.

jsdom `URLSearchParams` numbers from `pnpm bench` are a different environment. Do not compare them to the Node table above.

### Bundle size

Initial client graph for the public constructors. Vite 8 / Rolldown minify, gzip -9, `react` / `react-dom` external. The client load coordinator and SSR `load` chunk are dynamic imports and are not counted.

| Package         | @anonrig |    gzip |     TanStack |        gzip |
| --------------- | -------: | ------: | -----------: | ----------: |
| `@react-router` | 109.0 kB | 30.6 kB | **104.4 kB** | **29.5 kB** |
| `@router-core`  |  89.2 kB | 24.9 kB |  **74.7 kB** | **21.6 kB** |

TanStack is still smaller on both client graphs (1.04× gzip for `@react-router`). Parallel route slots are tree-shaken out of this graph unless `createSlotRoute` is imported. The client load coordinator and SSR `load` chunk are dynamic imports and are not counted. The remaining extra is the warm-path / matcher interners that keep every `pnpm bench:compare` row at least 2×. The initial graph no longer includes TanStack's segment-tree matcher, hydrate, HMR refresh, or hash/memory history. Re-run with `pnpm size`.

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
