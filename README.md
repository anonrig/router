# @anonrig/router

A React 19.2 router with the [TanStack Router](https://github.com/TanStack/router) API, written to be faster on the hot path.

Requires **React 19.2** and **React DOM 19.2**. React 18 and other 19.x lines are not supported.

This is a from-scratch implementation. Public names match `@tanstack/react-router` so existing apps and TanStack's own test suite can run against it.

## Why it is faster

The compatibility surface is the TanStack Router API. The internals are not a fork.

Head-to-head numbers against published TanStack Router are in [Benchmarks](#benchmarks). The wins that show up there are on the full request path, not every micro-primitive:

- **Navigation and SSR load** skip work TanStack still does per request (store setup, match-object construction, search parsing). Warm `navigate` and cold `router.load` / `createRequestHandler` are the operations that matter for req/s.
- **`cleanPath`** walks character codes instead of allocating with regex replace.
- **Query-string and trie matching** are still custom scanners in this repo. On Node 22 they lose to TanStack's native `URLSearchParams` helpers and published matcher; they are kept because they avoid jsdom/`URLSearchParams` costs in the browser test environment and keep the hot path allocation-light. That tradeoff is deliberate and visible in the table.

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
- `pnpm bench:compare` / `pnpm bench:rps` times the same operations on this router and on published TanStack Router.
- `pnpm bench:all` also runs the copied TanStack Link and closing-tag detection benches.

Current status:

- Local unit tests: passing
- Vendored TanStack history tests: passing
- Vendored TanStack core runtime tests: the isolated path/qss/utils/search/match files pass; load/preload/SSR lifecycle files are vendored and still fail
- Vendored TanStack type tests (`pnpm test:types`): passing
- Vendored TanStack React runtime tests: a handful of files pass; remaining work is pending/preload/SSR/hydration
- `pnpm lint` and `pnpm fmt:check` are the CI gates for first-party code

## Benchmarks

Measured on a 4-core Intel Xeon (Linux, Node 22). Same process, same timed loops, in-memory, no HTTP server. Re-run with `pnpm bench:compare`.

TanStack side is the published packages, not this repo's `@tanstack/*` test aliases:

- `@tanstack/router-core@1.171.24`
- `@tanstack/history@1.162.1`
- `@tanstack/react-router@1.170.29`

**req/s** is one `router.load()` (or one `createRequestHandler`) per request on a fresh router. Warm navigate/load reuse one router. `vs` is `@anonrig` ops/s ÷ TanStack ops/s.

| Operation                        |   @anonrig |   TanStack | vs TanStack |
| -------------------------------- | ---------: | ---------: | ----------: |
| Query-string encode              |    892,070 |  2,921,693 |       0.31× |
| Query-string decode              |  1,099,244 |  1,420,655 |       0.77× |
| `defaultStringifySearch` (×1000) |      910.2 |      3,049 |       0.30× |
| `parseHref`                      |  1,525,611 |  2,980,266 |       0.51× |
| `cleanPath`                      |  7,945,612 |  6,289,894 |       1.26× |
| `resolvePath`                    |  3,362,085 |  4,024,584 |       0.84× |
| `interpolatePath`                |  1,490,983 |  2,130,015 |       0.70× |
| Route match (large tree)         |  1,934,010 | 20,633,624 |       0.09× |
| Encode 100 typical SSR match IDs |     28,489 |     29,981 |       0.95× |
| History `push`                   |  1,105,272 |  1,189,807 |       0.93× |
| Warm `navigate`                  |    166,275 |     46,583 |       3.57× |
| Warm `router.load`               |    186,323 |    171,826 |       1.08× |
| **SSR cold `router.load` req/s** | **61,681** | **38,842** |   **1.59×** |
| **`createRequestHandler` req/s** | **27,541** | **15,422** |   **1.79×** |

`createRequestHandler` is the full server entry (normalize URL, attach SSR utils, load, dehydrate). Cold `router.load` is the match + loader path only.

TanStack's query-string helpers use Node's native `URLSearchParams`, which wins the microbenches here. Earlier “17× `URLSearchParams`” numbers were against jsdom's polyfill in `pnpm bench`, not against TanStack on Node. The trie matcher in published `@tanstack/router-core` is also faster on a large static tree. This router is ahead on the full navigation and SSR request path: warm `navigate`, cold `load`, and `createRequestHandler`.

### Copied TanStack benches

Every **router-core** and **react-router** unit bench from TanStack Router is in `benches/tanstack/`:

- `search-params.bench.ts` — `defaultStringifySearch` batches (1,000 encodes/iteration)
- `ssr-match-id.bench.ts` — dehydrate/hydrate 100 match IDs
- `closing-tag-detection.bench.ts` — HTML injection boundary scanners
- `link.bench.tsx` — 5,000 links on small (1 route) and medium (1,000 route) trees

TanStack's Nx Start apps (SSR/client-nav/memory/bundle-size for React/Vue/Solid) are not copied. They need `@tanstack/react-start`, generated route trees, and a built server bundle.

`defaultStringifySearch` and SSR match-ID encode are in the comparison table above (those copied files still alias `@tanstack/*` to this repo). Closing-tag and Link numbers below are this implementation only; they are algorithm / React-render benches, not a second TanStack package run.

| Bench                                       |         hz |
| ------------------------------------------- | ---------: |
| Closing-tag scan, 13KB chunk (`charCodeAt`) | 12,823,515 |
| Same chunk, regex                           |     59,388 |
| Link, small router, hardcoded `<a href>`    |       12.8 |
| Link, small router, `<Link to>`             |        4.2 |
| Link, medium router, hardcoded `<a href>`   |       10.9 |
| Link, medium router, `<Link to>`            |        4.2 |

The stream HTML scanner already uses a `charCodeAt` / `lastIndexOf('</')` walk, which is ~200× faster than regex on large chunks in that bench.

## License

MIT. TanStack Router is also MIT; its tests and benches are vendored for compatibility and its copyright remains with Tanner Linsley.
