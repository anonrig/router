> **Experimental.** This project is under active development. APIs, performance, and compatibility can change without notice. Do not use it in production.

<div align="center">

<img src="https://raw.githubusercontent.com/anonrig/router/main/assets/logo.svg" width="72" height="72" alt="speedy-router" />

# speedy-router

**The TanStack Router API. Rebuilt for the hot path.**

A from-scratch React 19.2 router. Same public names. Faster navigations. Faster SSR.

[![CI](https://github.com/anonrig/router/actions/workflows/ci.yml/badge.svg)](https://github.com/anonrig/router/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/speedy-router.svg)](https://www.npmjs.com/package/speedy-router)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![React](https://img.shields.io/badge/React-19.2-149ECA?logo=react&logoColor=white)](https://react.dev)
[![Node](https://img.shields.io/badge/Node-24+-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)

<br />

|                            |                                 |                          |
| :------------------------: | :-----------------------------: | :----------------------: |
|         **16.37×**         |           **13.86×**            |       **589,365**        |
| faster typed `to`/`params` | faster changing-params navigate | cold `router.load` / sec |

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
} from 'speedy-router'

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

Keep your existing `@tanstack/react-router` imports. Point the alias at `speedy-router`.

## Why this exists

TanStack Router is the right API: typed routes, loaders, search params, nested layouts. The internals were not written for the cost of every navigation and every SSR request.

This repo is not a fork. The compatibility surface is the TanStack Router API. The hot path is new: less store setup, less match-object construction, less work before the first byte.

If you already know TanStack Router, you already know this router.

## Features

- **Same API.** `createRouter`, `Link`, `Outlet`, loaders, search params, nested routes. Public names match `@tanstack/react-router` so existing apps and TanStack's own tests can run against it.
- **Faster on the same work.** `pnpm bench:compare` checks loader-call counts before timing. Headline rows use TanStack's default `staleTime: 0`, so loaders rerun on enter and param changes on both sides. Utility rows rotate unique inputs so last-value intern caches do not dominate.
- **Streaming SSR.** Every stream starts on `onShellReady` and flushes incrementally. No `isbot`, no User-Agent parse, no waiting for a complete document because a crawler might be watching.
- **React 19.2 only.** Peers are pinned to `react` and `react-dom` `~19.2.0`. No compatibility tax for React 18.
- **Node 24 only.** `engines.node` is `>=24`. No compatibility tax for Node 22.
- **Typed the same way.** Vendored TanStack type tests pass. Route trees, params, and search stay on the TanStack type surface.
- **Measured in the open.** Head-to-head benches, heap per operation, and bundle sizes live in the repo. Re-run them. The tables are the same loop as `pnpm bench:compare`.
- **Large trees stay small.** The generated `routeTree` still uses `createRoute` and `.lazy()`. Only the root route is statically imported. Other route modules load when they are matched. Types live in a separate file and do not use `typeof` every route.

## Quick start

Node 24+, React 19.2, and React DOM 19.2 are required.

```bash
pnpm add speedy-router
```

The other public packages are `speedy-router-core`, `speedy-router-history`, and `speedy-router-generator`. Clone the workspace to develop or re-run the benches:

```bash
pnpm install
pnpm test
pnpm bench:compare
pnpm size
```

| Package                                                | What you import                               |
| ------------------------------------------------------ | --------------------------------------------- |
| [`speedy-router`](packages/react-router)               | `RouterProvider`, `Link`, hooks, SSR bindings |
| [`speedy-router-core`](packages/router-core)           | Matcher, navigation, loaders, search params   |
| [`speedy-router-history`](packages/history)            | Browser, hash, and memory history             |
| [`speedy-router-generator`](packages/router-generator) | Compact lazy `routeTree.gen.ts` + types       |

## Performance

Routing cost is not a microbenchmark. It is every click and every request.

On a 4-core Intel Xeon, Linux, Node 24, in memory, no HTTP server:

<div align="center">

|                                 | speedy-router | TanStack |            |
| ------------------------------- | ------------: | -------: | ---------: |
| Warm `navigate({ to, params })` | **1,268,275** |   77,483 | **16.37×** |
| Warm `navigate` changing params |   **883,102** |   63,738 | **13.86×** |
| SSR cold `router.load`          |   **589,365** |   65,030 |  **9.06×** |

</div>

These are in-memory Node loops: no browser, React render, HTTP, HTML, lazy components, or loader I/O. Cold `router.load` is match + loaders on a new router each time. Typed `to`/`params` navigation is what `<Link>` uses. Default `staleTime` is 0, the same as TanStack, so those rows rerun the post loader on enter and when params change. The compare harness refuses to print if loader-call counts diverge (`pnpm audit:loaders` is the same probe). `navigate({ href })` uses the same staleTime policy and skips `to`/`params` interpolation, so it is listed separately. A settled `router.load()` no-op is not published: this implementation can skip that call. `createRequestHandler` (normalize, attach SSR utils, load, dehydrate) is in the full table.

TanStack side is the published packages, not this repo's test aliases:

- `@tanstack/react-router@1.170.29`
- `@tanstack/router-core@1.171.24`
- `@tanstack/history@1.162.1`

```bash
pnpm bench:compare
```

### Equal-work headlines

| Operation                       | speedy-router | TanStack |            |
| ------------------------------- | ------------: | -------: | ---------: |
| Warm `navigate({ to, params })` | **1,268,275** |   77,483 | **16.37×** |
| Warm `navigate` changing params |   **883,102** |   63,738 | **13.86×** |
| Invalidate + reload             |   **815,131** |  103,095 |  **7.91×** |
| SSR cold `router.load` req/s    |   **589,365** |   65,030 |  **9.06×** |
| `createRequestHandler` req/s    |    **85,126** |   16,080 |  **5.29×** |

### Same staleTime, no `to`/`params` interpolation

| Operation                 | speedy-router | TanStack |            |
| ------------------------- | ------------: | -------: | ---------: |
| Warm `navigate({ href })` | **1,519,641** |   50,898 | **29.86×** |

### Utilities

Rotating unique inputs, so a last-value intern cache does not decide the row.

| Operation                        |  speedy-router |  TanStack | vs TanStack |
| -------------------------------- | -------------: | --------: | ----------: |
| Query-string encode              |  **3,991,198** | 2,510,884 |   **1.59×** |
| Query-string decode              |  **1,670,625** | 1,397,280 |   **1.20×** |
| `defaultStringifySearch`         |  **4,234,573** | 2,775,190 |   **1.53×** |
| `parseHref`                      |  **5,951,191** | 3,630,408 |   **1.64×** |
| `cleanPath`                      | **19,197,333** | 9,243,102 |   **2.08×** |
| `resolvePath`                    | **10,449,998** | 4,462,980 |   **2.34×** |
| `interpolatePath`                |  **6,210,305** | 2,336,558 |   **2.66×** |
| Route match (large tree)         | **14,717,095** | 5,506,262 |   **2.67×** |
| Encode 100 typical SSR match IDs |  **1,818,605** |    29,442 |  **61.77×** |
| History `push`                   |  **5,800,004** | 1,245,902 |   **4.66×** |

Typed `navigate({ to, params })` is the Link-shaped path: an absolute `to` with fully specified simple params interpolates and uses the same warm load lane as `href`. Search middlewares, blockers, preloads, masks, and route lifecycle hooks still take the full load coordinator. Default `staleTime` is 0, so changing params and re-entering a loaded route rerun the post loader on both sides. Set `staleTime: Infinity` (or `defaultStaleTime`) to keep successful data. Invalidate + reload marks matches invalid and reruns loaders on both sides. `navigate({ href })` is a resolved-href fast path with the same staleTime policy. A settled `router.load()` on an already-valid router is not published: this implementation can skip that call. Unique query-string encode and decode both beat published TanStack on this machine; decode no longer clones every miss. `cleanPath` / `resolvePath` / `interpolatePath` keep small result caches and compile simple `$param` templates. Large-tree match walks many static leaves through `staticExact` instead of one repeated LRU key. SSR match IDs replace slashes in one pass and intern the result. Memory history keeps the full stack by default, the same as TanStack. Pass `createMemoryHistory({ compact: true })` to drop the oldest half at 2048 entries. Cold `createRouter().load()` reuses processed trees, empty-search match templates, a prototype `createMemoryHistory`, and a synchronous fast SSR lane when loaders are sync. `createRequestHandler` stays on that sync lane when load, dehydrate, and the render callback are sync, then dehydrates without an extra `await`.

jsdom `URLSearchParams` numbers from `pnpm bench` are a different environment. Do not compare them to the Node table above.

### Bundle size

Initial client graph for the public constructors. Vite 8 / Rolldown minify, gzip -9, `react` / `react-dom` external. The client load coordinator and SSR `load` chunk are dynamic imports and are not counted.

| Package              | speedy-router |    gzip |     TanStack |        gzip |
| -------------------- | ------------: | ------: | -----------: | ----------: |
| `speedy-router`      |      109.0 kB | 30.6 kB | **104.4 kB** | **29.5 kB** |
| `speedy-router-core` |       89.2 kB | 24.9 kB |  **74.7 kB** | **21.6 kB** |

TanStack is still smaller on both client graphs (1.04× gzip for `speedy-router`). Parallel route slots are tree-shaken out of this graph unless `createSlotRoute` is imported. The client load coordinator and SSR `load` chunk are dynamic imports and are not counted. The remaining extra is the warm-path / matcher interners. The initial graph no longer includes TanStack's segment-tree matcher, hydrate, HMR refresh, or hash/memory history. Re-run with `pnpm size`.

Copied TanStack unit benches (search params, SSR match IDs, Link, closing-tag detection) live in `benches/tanstack/`. TanStack's Nx Start app benches are not copied; they need `@tanstack/react-start` and a built server.

## Large route trees

TanStack's `routeTree.gen.ts` statically imports every route module and repeats every path as `typeof` aliases and union members. At a few hundred URLs that file becomes a TypeScript and bundle problem: tsserver crawls a giant generated module, and the initial JS graph includes every route even when the user only opened `/`.

This generator still exports `routeTree` for `createRouter({ routeTree })`. The difference is how that file is built:

- `routeTree.gen.ts` uses the existing `createRoute` + `.update()` + `.lazy()` APIs. Only the root route is a static import. Every other route is `() => import(...)`, so unused modules stay out of the initial chunk.
- `routeTree.types.ts` holds `FileRouteTypes`. Path unions are `keyof` maps, not written-out `typeof` aliases, so the type file stays cheap for tsserver.

```ts
import { tanstackRouter } from 'speedy-router-generator/vite'

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

The public names match `@tanstack/react-router`. Default loader freshness does too: omitted `staleTime` is 0. This workspace runs a copied, modified subset of TanStack's history, router-core, and React tests — not TanStack's full monorepo, e2e, or TypeScript-version matrix. Alias the TanStack names to the local packages:

```ts
// vitest / vite
resolve: {
  alias: {
    '@tanstack/react-router': 'speedy-router',
    '@tanstack/router-core': 'speedy-router-core',
    '@tanstack/history': 'speedy-router-history',
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
pnpm audit:loaders        # loader-call counts vs published TanStack
pnpm bench                # vitest benches
pnpm bench:compare        # head-to-head ops/s + heap vs published TanStack
pnpm size                 # client min+gzip vs published TanStack
pnpm lint && pnpm fmt:check
pnpm knip                 # unused files, dependencies, and exports
```

## Publishing

The public packages are `speedy-router`, `speedy-router-core`, `speedy-router-history`, and `speedy-router-generator`. The repo root stays private. Versions stay in lockstep. Releases run from [`.github/workflows/release.yml`](.github/workflows/release.yml).

Trusted publishing cannot create a package's first version. Bootstrap once with a token, then switch to OIDC.

### 1. First publish (token)

1. Sign in at [npmjs.com](https://www.npmjs.com) as the owner who will hold the four package names.
2. Create a granular access token with **Read and write** permission for new packages (or an Automation classic token).
3. Either:
   - add it as the `NPM_TOKEN` repository secret on `anonrig/router`, then run [Release](https://github.com/anonrig/router/actions/workflows/release.yml) with **bump** `none` (publishes `0.1.0`), or
   - from a clean checkout of the release commit: `NPM_TOKEN=… pnpm release`.
4. Confirm all four names exist: [speedy-router](https://www.npmjs.com/package/speedy-router), [speedy-router-core](https://www.npmjs.com/package/speedy-router-core), [speedy-router-history](https://www.npmjs.com/package/speedy-router-history), [speedy-router-generator](https://www.npmjs.com/package/speedy-router-generator).

### 2. Trusted publishing (every later release)

On each of the four package pages: **Settings → Trusted publisher → GitHub Actions**.

| Field                | Value                                                 |
| -------------------- | ----------------------------------------------------- |
| Organization or user | `anonrig`                                             |
| Repository           | `router`                                              |
| Workflow filename    | `release.yml`                                         |
| Environment          | leave blank (the workflow does not set `environment`) |
| Allowed actions      | `npm publish`                                         |

Then delete the `NPM_TOKEN` repository secret. The workflow only writes `.npmrc` when that secret is present; an empty token would skip the OIDC exchange.

### 3. Cut a release

Preferred: [Release](https://github.com/anonrig/router/actions/workflows/release.yml) → **Run workflow**.

- **bump** `none` publishes the version already in the package files.
- `patch` / `minor` / `major` / `prerelease` rewrites every package in lockstep, commits, and tags.
- **version** overrides the bump with an exact semver.
- **dry_run** runs the same checks and prints the npm plan without publishing.

The job installs current npm (OIDC needs 11.5.1+), runs the same checks as CI, publishes with provenance, pushes a `v*` tag only if it is new or already points at `HEAD`, and opens a GitHub Release.

Pushing a `v*` tag yourself also starts the job. The tag must match the lockstep version in every `package.json` (`v0.1.0` → `0.1.0`). A mismatched tag fails before publish.

## License

MIT. TanStack Router is also MIT. Its tests and benches are vendored for compatibility; copyright remains with Tanner Linsley.
