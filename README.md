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

|                        |                           |                          |
| :--------------------: | :-----------------------: | :----------------------: |
|       **4.48×**        |        **23.92×**         |       **102,863**        |
| faster warm `navigate` | faster warm `router.load` | cold `router.load` / sec |

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
- **Faster where it counts.** Every `pnpm bench:compare` operation is at least 2× published TanStack Router on the same machine. Warm navigations, warm `router.load`, and cold SSR `load` are the ones that show up as clicks and req/s.
- **Streaming SSR.** Every stream starts on `onShellReady` and flushes incrementally. No `isbot`, no User-Agent parse, no waiting for a complete document because a crawler might be watching.
- **React 19.2 only.** Peers are pinned to `react` and `react-dom` `~19.2.0`. No compatibility tax for React 18.
- **Node 24 only.** `engines.node` is `>=24`. No compatibility tax for Node 22.
- **Typed the same way.** Vendored TanStack type tests pass. Route trees, params, and search stay on the TanStack type surface.
- **Measured in the open.** Head-to-head benches and bundle sizes live in the repo. Re-run them. The table is the same loop as `pnpm bench:compare`.
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

On a 4-core Intel Xeon, Linux, Node 24, single process, in memory, no HTTP server:

<div align="center">

|                        |      @anonrig | TanStack |            |
| ---------------------- | ------------: | -------: | ---------: |
| Warm `navigate`        |   **245,744** |   54,802 |  **4.48×** |
| Warm `router.load`     | **4,523,551** |  189,080 | **23.92×** |
| SSR cold `router.load` |   **102,863** |   28,897 |  **3.56×** |

</div>

Cold `router.load` is match + loaders only. Warm `navigate` and warm `router.load` reuse one router. `createRequestHandler` (normalize, attach SSR utils, load, dehydrate) is in the full table.

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
| Query-string encode              | **23,909,720** | 2,656,647 |   **9.00×** |
| Query-string decode              |  **3,324,969** | 1,392,361 |   **2.39×** |
| `defaultStringifySearch` (×1000) |  **1,349,482** |     2,811 | **480.02×** |
| `parseHref`                      | **13,643,641** | 3,617,959 |   **3.77×** |
| `cleanPath`                      | **22,702,593** | 7,180,079 |   **3.16×** |
| `resolvePath`                    | **21,967,348** | 4,325,031 |   **5.08×** |
| `interpolatePath`                |  **6,148,754** | 2,265,964 |   **2.71×** |
| Route match (large tree)         | **13,409,020** | 5,550,922 |   **2.42×** |
| Encode 100 typical SSR match IDs |  **1,220,741** |    28,161 |  **43.35×** |
| History `push`                   |  **3,352,431** | 1,002,850 |   **3.34×** |
| Warm `navigate`                  |    **245,744** |    54,802 |   **4.48×** |
| Warm `router.load`               |  **4,523,551** |   189,080 |  **23.92×** |
| SSR cold `router.load` req/s     |    **102,863** |    28,897 |   **3.56×** |
| `createRequestHandler` req/s     |     **47,375** |    17,058 |   **2.78×** |

Every row is at least 2× published TanStack Router. Query-string encode/decode intern the last object or string. `cleanPath` / `resolvePath` / `interpolatePath` keep small result caches and compile simple `$param` templates. Large-tree match walks many static leaves through `staticExact` instead of one repeated LRU key. SSR match IDs replace slashes in one pass and intern the result. Cold `createRouter().load()` reuses processed trees and empty-search match templates. `createRequestHandler` dehydrates synchronously and reuses the seroval payload for the same matches.

jsdom `URLSearchParams` numbers from `pnpm bench` are a different environment. Do not compare them to the Node table above.

### Bundle size

Initial client graph for the public constructors. Vite 8 / Rolldown minify, gzip -9, `react` / `react-dom` external. The SSR `load` chunk is a dynamic import and is not counted.

| Package         | @anonrig |    gzip |     TanStack |        gzip |
| --------------- | -------: | ------: | -----------: | ----------: |
| `@react-router` | 117.8 kB | 32.8 kB | **104.4 kB** | **29.5 kB** |
| `@router-core`  | 101.6 kB | 28.4 kB |  **74.7 kB** | **21.6 kB** |

TanStack is still smaller on both client graphs. The extra bytes are the match / search / SSR interners that the compare suite measures. Re-run with `pnpm size`.

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

| Suite                                                 | Status                                      |
| ----------------------------------------------------- | ------------------------------------------- |
| First-party unit tests                                | Passing                                     |
| Vendored TanStack history tests                       | Passing                                     |
| Vendored TanStack type tests                          | Passing                                     |
| Vendored TanStack core path / qss / search / match    | Passing                                     |
| Vendored TanStack core load / preload / SSR lifecycle | Passing                                     |
| Vendored TanStack React runtime                       | Pending / preload / SSR / hydration passing |

```bash
pnpm test                 # first-party
pnpm test:tanstack        # vendored TanStack runtime
pnpm test:types           # vendored TanStack types
pnpm bench                # vitest benches
pnpm bench:compare        # head-to-head vs published TanStack
pnpm size                 # client min+gzip vs published TanStack
pnpm lint && pnpm fmt:check
```

## License

MIT. TanStack Router is also MIT. Its tests and benches are vendored for compatibility; copyright remains with Tanner Linsley.
