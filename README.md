<div align="center">

<img src="assets/logo.svg" width="72" height="72" alt="@anonrig/router" />

# @anonrig/router

**The TanStack Router API. Rebuilt for the hot path.**

A from-scratch React 19.2 router. Same public names. Faster navigations. Faster SSR.

[![CI](https://github.com/anonrig/router/actions/workflows/ci.yml/badge.svg)](https://github.com/anonrig/router/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![React](https://img.shields.io/badge/React-19.2-149ECA?logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)

<br />

|                        |                            |                          |
| :--------------------: | :------------------------: | :----------------------: |
|       **3.48×**        |         **2.08×**          |        **54,794**        |
| faster warm `navigate` | faster SSR request handler | cold `router.load` / sec |

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
- **Faster where it counts.** Warm client navigations and cold SSR `load` / `createRequestHandler` beat published TanStack Router on the same machine. Those are the operations that show up as req/s.
- **Streaming SSR.** Every stream starts on `onShellReady` and flushes incrementally. No `isbot`, no User-Agent parse, no waiting for a complete document because a crawler might be watching.
- **React 19.2 only.** Peers are pinned to `react` and `react-dom` `~19.2.0`. No compatibility tax for React 18.
- **Typed the same way.** Vendored TanStack type tests pass. Route trees, params, and search stay on the TanStack type surface.
- **Measured in the open.** Head-to-head benches live in the repo. Re-run them. The wins and the losses are both in the table.

## Quick start

React 19.2 and React DOM 19.2 are required. Clone the workspace and import the packages:

```bash
pnpm install
pnpm test
pnpm bench:compare
```

| Package                                          | What you import                               |
| ------------------------------------------------ | --------------------------------------------- |
| [`@anonrig/react-router`](packages/react-router) | `RouterProvider`, `Link`, hooks, SSR bindings |
| [`@anonrig/router-core`](packages/router-core)   | Matcher, navigation, loaders, search params   |
| [`@anonrig/history`](packages/history)           | Browser, hash, and memory history             |

## Performance

Routing cost is not a microbenchmark. It is every click and every request.

On a 4-core Intel Xeon, Linux, Node 22, single process, in memory, no HTTP server:

<div align="center">

|                        |    @anonrig | TanStack |           |
| ---------------------- | ----------: | -------: | --------: |
| Warm `navigate`        | **193,122** |   55,441 | **3.48×** |
| `createRequestHandler` |  **24,767** |   11,904 | **2.08×** |
| SSR cold `router.load` |  **54,794** |   39,368 | **1.39×** |

</div>

`createRequestHandler` is the full server entry: normalize the URL, attach SSR utils, load, dehydrate. Cold `router.load` is match + loaders only. Warm `navigate` reuses one router.

TanStack side is the published packages, not this repo's test aliases:

- `@tanstack/react-router@1.170.29`
- `@tanstack/router-core@1.171.24`
- `@tanstack/history@1.162.1`

```bash
pnpm bench:compare
```

### Full comparison

| Operation                        |    @anonrig |   TanStack | vs TanStack |
| -------------------------------- | ----------: | ---------: | ----------: |
| Query-string encode              |   1,428,135 |  2,871,250 |       0.50× |
| Query-string decode              |   1,069,492 |  1,424,518 |       0.75× |
| `defaultStringifySearch` (×1000) |       1,665 |      3,024 |       0.55× |
| `parseHref`                      |   3,203,205 |  3,088,733 |       1.04× |
| `cleanPath`                      |   6,938,548 |  6,322,465 |       1.10× |
| `resolvePath`                    |   3,800,131 |  4,212,974 |       0.90× |
| `interpolatePath`                |   1,489,830 |  2,147,659 |       0.69× |
| Route match (large tree)         |   2,028,406 | 20,669,666 |       0.10× |
| Encode 100 typical SSR match IDs |      28,473 |     29,220 |       0.97× |
| History `push`                   |   1,191,437 |  1,192,404 |       1.00× |
| Warm `navigate`                  | **193,122** |     55,441 |   **3.48×** |
| Warm `router.load`               |     182,155 |    128,168 |       1.42× |
| SSR cold `router.load` req/s     |  **54,794** |     39,368 |   **1.39×** |
| `createRequestHandler` req/s     |  **24,767** |     11,904 |   **2.08×** |

TanStack's query-string helpers use Node's native `URLSearchParams`, which wins those microbenches. The published trie matcher is faster on a large static tree. This router is ahead on the full navigation and SSR request path.

jsdom `URLSearchParams` numbers from `pnpm bench` are a different environment. Do not compare them to the Node table above.

Copied TanStack unit benches (search params, SSR match IDs, Link, closing-tag detection) live in `benches/tanstack/`. TanStack's Nx Start app benches are not copied; they need `@tanstack/react-start` and a built server.

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

| Suite                                                 | Status                                                              |
| ----------------------------------------------------- | ------------------------------------------------------------------- |
| First-party unit tests                                | Passing                                                             |
| Vendored TanStack history tests                       | Passing                                                             |
| Vendored TanStack type tests                          | Passing                                                             |
| Vendored TanStack core path / qss / search / match    | Passing                                                             |
| Vendored TanStack core load / preload / SSR lifecycle | Vendored, still failing                                             |
| Vendored TanStack React runtime                       | A handful of files pass; pending / preload / SSR / hydration remain |

```bash
pnpm test                 # first-party
pnpm test:tanstack        # vendored TanStack runtime
pnpm test:types           # vendored TanStack types
pnpm bench                # vitest benches
pnpm bench:compare        # head-to-head vs published TanStack
pnpm lint && pnpm fmt:check
```

## License

MIT. TanStack Router is also MIT. Its tests and benches are vendored for compatibility; copyright remains with Tanner Linsley.
