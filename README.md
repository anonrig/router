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
- `pnpm bench` compares query-string and path hot paths against `URLSearchParams` / regex.

Current status:

- Local unit tests: passing
- Vendored TanStack core runtime tests: passing
- Vendored TanStack type tests (`pnpm test:types`): passing
- Vendored TanStack React runtime tests: navigation, loaders, links, and hooks are largely covered; remaining work is in the heaviest SSR/hydration-lane cases
- `pnpm lint` and `pnpm fmt:check` are the CI gates for first-party code

## Benchmarks

On this machine, the rewritten hot paths measured:

| Operation                | vs TanStack-style baseline           |
| ------------------------ | ------------------------------------ |
| Query-string encode      | ~29× faster than `URLSearchParams`   |
| Query-string decode      | ~17× faster than `URLSearchParams`   |
| `cleanPath`              | ~1.4× faster than regex replace      |
| Route match (large tree) | ~1.9M matches/sec (O(segments) trie) |

## License

MIT. TanStack Router is also MIT; its tests are vendored for compatibility and its copyright remains with Tanner Linsley.
