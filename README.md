# @anonrig/router

A React 19.2 router with the [TanStack Router](https://github.com/TanStack/router) API, written to be faster on the hot path.

Requires **React 19.2** and **React DOM 19.2**. React 18 and other 19.x lines are not supported.

This is a from-scratch implementation. Public names match `@tanstack/react-router` so existing apps and TanStack's own test suite can run against it.

## Why it is faster

The compatibility surface is the TanStack Router API. The internals are not a fork.

- **Query strings** are parsed and serialized with a single-pass scanner. There is no `URLSearchParams` constructor, iterator, or `toString` on every navigation.
- **Path utilities** (`cleanPath`, `trimPath`, `parseHref`, `sanitizePath`) walk character codes instead of allocating with regex replace.
- **Route matching** compiles the route tree into a segment trie once. Matching is O(segments), not O(routes).
- **Path interpolation** reuses a `Uint16Array` segment parser and avoids regex for `$param`, `{$param}`, `{-$optional}`, and `$` splat segments.

## Deliberate differences from TanStack Router

- **No `isbot`.** TanStack's `renderRouterToStream` inspects `User-Agent` with the `isbot` package and, for crawlers, waits for React's `allReady` / `onAllReady` so the first byte is a complete document. This router never does that. Every SSR stream starts on `onShellReady` and flushes incrementally, including requests that look like bots. That keeps the dependency out of the hot SSR path and avoids a User-Agent parse on every request. If you need crawlers to receive fully buffered HTML, wait for `stream.allReady` in your own render handler.

## Packages

| Package                 | Role                                             |
| ----------------------- | ------------------------------------------------ |
| `@anonrig/history`      | Browser, hash, and memory history                |
| `@anonrig/router-core`  | Matcher, navigation, loaders, search params      |
| `@anonrig/react-router` | React bindings (`RouterProvider`, `Link`, hooks) |

## Install (workspace)

```bash
pnpm install
pnpm test
pnpm test:tanstack
pnpm bench
pnpm bench:rps
pnpm bench:all
```

## Drop-in usage

```tsx
import {
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
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

Alias `@tanstack/react-router` to `@anonrig/react-router` if you want to keep existing imports.

## Tests

- `pnpm test` runs this repo's unit tests (path, query string, matcher, React navigation).
- `pnpm test:tanstack` runs the vendored TanStack Router runtime tests against this implementation.
- `pnpm bench` runs first-party plus copied TanStack router-core benches.
- `pnpm bench:rps` prints a timed ops/sec and req/s report.
- `pnpm bench:all` also runs the copied TanStack Link and closing-tag detection benches.

Current status:

- Local unit tests: passing
- Vendored TanStack history tests: passing
- Vendored TanStack core runtime tests: the isolated path/qss/utils/search/match files pass; load/preload/SSR lifecycle files are vendored and still fail
- Vendored TanStack type tests (`pnpm test:types`): passing
- Vendored TanStack React runtime tests: a handful of files pass; remaining work is pending/preload/SSR/hydration
- `pnpm lint` and `pnpm fmt:check` are the CI gates for first-party code

## Benchmarks

Measured on a 4-core Intel Xeon (Linux, Node 22). Numbers are single-process, in-memory, no HTTP server. Re-run with `pnpm bench:rps` and `pnpm bench`.

### Throughput

Timed loops from `pnpm bench:rps`. **req/s** is one `router.load()` per request on a fresh router (SSR-style). Warm navigate/load reuse one router.

| Operation                        |      ops/s |
| -------------------------------- | ---------: |
| Query-string encode              |    879,070 |
| Query-string decode              |  1,097,790 |
| `parseHref`                      |  1,422,887 |
| Route match (large tree)         |  1,898,766 |
| History `push`                   |  1,086,665 |
| Warm `navigate`                  |    169,359 |
| Warm `router.load`               |    497,568 |
| **SSR cold `router.load` req/s** | **66,237** |

Vitest bench (`pnpm bench`) on the same machine:

| Operation                    |        hz | vs baseline                          |
| ---------------------------- | --------: | ------------------------------------ |
| Query-string encode          |   848,499 | **17.1×** `URLSearchParams` (49,645) |
| Query-string decode          | 1,060,482 | **12.8×** `URLSearchParams` (82,925) |
| `cleanPath`                  | 7,766,307 | **1.35×** regex replace (5,756,092)  |
| `resolvePath`                | 3,077,283 | —                                    |
| `interpolatePath`            | 1,212,374 | —                                    |
| Route match (large tree)     | 1,878,811 | —                                    |
| `parseHref`                  | 1,411,010 | —                                    |
| History `push` / `replace`   |     ~1.0M | —                                    |
| Warm navigate                |   136,969 | —                                    |
| Warm `load`                  |   189,029 | —                                    |
| `buildLocation`              |   533,759 | —                                    |
| Cold `router.load` req/s     |    50,832 | —                                    |
| `createRequestHandler` req/s |     6,826 | includes SSR attach + dehydrate      |

`createRequestHandler` is the full server entry (normalize URL, attach SSR utils, load, dehydrate). Cold `router.load` is the match + loader path only.

### Copied TanStack benches

Every **router-core** and **react-router** unit bench from TanStack Router is in `benches/tanstack/`:

- `search-params.bench.ts` — `defaultStringifySearch` batches (1,000 encodes/iteration)
- `ssr-match-id.bench.ts` — dehydrate/hydrate 100 match IDs
- `closing-tag-detection.bench.ts` — HTML injection boundary scanners
- `link.bench.tsx` — 5,000 links on small (1 route) and medium (1,000 route) trees

TanStack's Nx Start apps (SSR/client-nav/memory/bundle-size for React/Vue/Solid) are not copied. They need `@tanstack/react-start`, generated route trees, and a built server bundle.

Selected copied-bench results:

| Bench                                       |         hz |
| ------------------------------------------- | ---------: |
| Stringify ordinary search (×1000)           |        893 |
| Encode 100 typical SSR match IDs            |     31,039 |
| Closing-tag scan, 13KB chunk (`charCodeAt`) | 12,823,515 |
| Same chunk, regex                           |     59,388 |
| Link, small router, hardcoded `<a href>`    |       12.8 |
| Link, small router, `<Link to>`             |        4.2 |
| Link, medium router, hardcoded `<a href>`   |       10.9 |
| Link, medium router, `<Link to>`            |        4.2 |

The stream HTML scanner already uses a `charCodeAt` / `lastIndexOf('</')` walk, which is ~200× faster than regex on large chunks in that bench.

## License

MIT. TanStack Router is also MIT; its tests and benches are vendored for compatibility and its copyright remains with Tanner Linsley.
