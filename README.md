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
|         **12.73×**         |           **12.09×**            |       **577,162**        |
| faster typed `to`/`params` | faster changing-params navigate | cold `router.load` / sec |

<sub>Same machine, same loops, published TanStack Router 1.170.30. Re-run with <code>pnpm bench:compare</code>.</sub>

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
- **Same generated route tree.** `speedy-router-plugin` emits TanStack's `routeTree.gen.ts` shape: eager `Route` imports, `.update()`, and `declare module '@tanstack/react-router'`. Alias `@tanstack/router-plugin` at the package manager.

## Quick start

Node 24+, React 19.2, and React DOM 19.2 are required.

```bash
pnpm add speedy-router
```

The other public packages are `speedy-router-core`, `speedy-router-history`, and `speedy-router-plugin`. Clone the workspace to develop or re-run the benches:

```bash
pnpm install
pnpm test
pnpm bench:compare
pnpm size
```

| Package                                          | What you import                                      |
| ------------------------------------------------ | ---------------------------------------------------- |
| [`speedy-router`](packages/react-router)         | `RouterProvider`, `Link`, hooks, SSR bindings        |
| [`speedy-router-core`](packages/router-core)     | Matcher, navigation, loaders, search params          |
| [`speedy-router-history`](packages/history)      | Browser, hash, and memory history                    |
| [`speedy-router-plugin`](packages/router-plugin) | TanStack-compatible `routeTree.gen.ts` + Vite plugin |

## Performance

Routing cost is not a microbenchmark. It is every click and every request.

On a 4-core Intel Xeon, Linux, Node 24, in memory, no HTTP server:

<div align="center">

|                                 | speedy-router | TanStack |            |
| ------------------------------- | ------------: | -------: | ---------: |
| Warm `navigate({ to, params })` |   **928,147** |   72,894 | **12.73×** |
| Warm `navigate` changing params |   **720,415** |   59,599 | **12.09×** |
| SSR cold `router.load`          |   **577,162** |   65,059 |  **8.87×** |

</div>

These are in-memory Node loops: no browser, React render, HTTP, HTML, lazy components, or loader I/O. Cold `router.load` is match + loaders on a new router each time. Typed `to`/`params` navigation is what `<Link>` uses. Default `staleTime` is 0, the same as TanStack, so those rows rerun the post loader on enter and when params change. The compare harness refuses to print if loader-call counts diverge (`pnpm audit:loaders` is the same probe). `navigate({ href })` uses the same staleTime policy and skips `to`/`params` interpolation, so it is listed separately. A settled `router.load()` no-op is not published: this implementation can skip that call. `createRequestHandler` (normalize, attach SSR utils, load, dehydrate) is in the full table.

TanStack side is the published packages, not this repo's test aliases:

- `@tanstack/react-router@1.170.30`
- `@tanstack/router-core@1.171.25`
- `@tanstack/history@1.162.1`

```bash
pnpm bench:compare
```

### Equal-work headlines

| Operation                       | speedy-router | TanStack |            |
| ------------------------------- | ------------: | -------: | ---------: |
| Warm `navigate({ to, params })` |   **928,147** |   72,894 | **12.73×** |
| Warm `navigate` changing params |   **720,415** |   59,599 | **12.09×** |
| Invalidate + reload             |   **816,057** |   73,623 | **11.08×** |
| SSR cold `router.load` req/s    |   **577,162** |   65,059 |  **8.87×** |
| `createRequestHandler` req/s    |    **79,788** |   18,556 |  **4.30×** |

### Same staleTime, no `to`/`params` interpolation

| Operation                 | speedy-router | TanStack |            |
| ------------------------- | ------------: | -------: | ---------: |
| Warm `navigate({ href })` | **1,108,532** |   48,791 | **22.72×** |

### Utilities

Rotating unique inputs, so a last-value intern cache does not decide the row.

| Operation                        |  speedy-router |  TanStack | vs TanStack |
| -------------------------------- | -------------: | --------: | ----------: |
| Query-string encode              |  **4,104,874** | 2,503,754 |   **1.64×** |
| Query-string decode              |  **1,661,581** | 1,366,472 |   **1.22×** |
| `defaultStringifySearch`         |  **4,167,415** | 2,813,748 |   **1.48×** |
| `parseHref`                      |  **5,970,450** | 3,626,893 |   **1.65×** |
| `cleanPath`                      | **19,321,172** | 9,153,809 |   **2.11×** |
| `resolvePath`                    | **10,336,479** | 4,438,530 |   **2.33×** |
| `interpolatePath`                |  **6,044,122** | 2,339,701 |   **2.58×** |
| Route match (large tree)         | **14,985,219** | 5,475,160 |   **2.74×** |
| Encode 100 typical SSR match IDs |  **1,952,649** |    29,733 |  **65.67×** |
| History `push`                   |  **3,270,471** | 1,409,650 |   **2.32×** |

Typed `navigate({ to, params })` is the Link-shaped path: an absolute `to` with fully specified simple params interpolates and uses the same warm load lane as `href`. Search middlewares, blockers, preloads, masks, and route lifecycle hooks still take the full load coordinator. Default `staleTime` is 0, so changing params and re-entering a loaded route rerun the post loader on both sides. Set `staleTime: Infinity` (or `defaultStaleTime`) to keep successful data. Invalidate + reload marks matches invalid and reruns loaders on both sides. `navigate({ href })` is a resolved-href fast path with the same staleTime policy. A settled `router.load()` on an already-valid router is not published: this implementation can skip that call. Unique query-string encode and decode both beat published TanStack on this machine; decode no longer clones every miss. `cleanPath` / `resolvePath` / `interpolatePath` keep small result caches and compile simple `$param` templates. Large-tree match walks many static leaves through `staticExact` instead of one repeated LRU key. SSR match IDs replace slashes in one pass and intern the result. Memory history keeps the full stack by default, the same as TanStack. Pass `createMemoryHistory({ compact: true })` to drop the oldest half at 2048 entries. Cold `createRouter().load()` reuses processed trees, empty-search match templates, a prototype `createMemoryHistory`, and a synchronous fast SSR lane when loaders are sync. `createRequestHandler` stays on that sync lane when load, dehydrate, and the render callback are sync, then dehydrates without an extra `await`.

jsdom `URLSearchParams` numbers from `pnpm bench` are a different environment. Do not compare them to the Node table above.

### Bundle size

Initial client graph for the public constructors. Vite 8 / Rolldown minify, gzip -9, `react` / `react-dom` external. The client load coordinator and SSR `load` chunk are dynamic imports and are not counted.

| Package              | speedy-router |        gzip | TanStack |    gzip |
| -------------------- | ------------: | ----------: | -------: | ------: |
| `speedy-router`      |   **96.6 kB** | **28.0 kB** | 104.5 kB | 29.5 kB |
| `speedy-router-core` |   **75.0 kB** | **21.6 kB** |  75.1 kB | 21.6 kB |

speedy-router is now smaller on both initial client graphs (0.95× gzip for `speedy-router`). Parallel route slots are tree-shaken out of this graph unless `createSlotRoute` is imported. The client load coordinator and SSR `load` chunk are dynamic imports and are not counted. The initial graph no longer includes TanStack's segment-tree matcher, hydrate, HMR refresh, or hash/memory history. Re-run with `pnpm size`.

Copied TanStack unit benches (search params, SSR match IDs, Link, closing-tag detection) live in `benches/tanstack/`. TanStack's Nx Start app benches are not copied; they need `@tanstack/react-start` and a built server.

## Large route trees

The generator is a drop-in for `@tanstack/router-plugin`. It writes one `routeTree.gen.ts` with the same eager `Route` imports, `.update({ id, path, getParentRoute })`, `_addFileChildren` / `_addFileTypes`, and `FileRoutesByPath` module augmentation. Existing tools that read `fullPath` out of that file keep working.

```ts
import { tanstackRouter } from '@tanstack/router-plugin/vite'

export default defineConfig({
  plugins: [
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
      routeFileIgnorePattern: '\\.test\\.|\\.e2e\\.|__generated__',
    }),
  ],
})
```

Point the TanStack package names at the speedy packages:

```yaml
# pnpm-workspace.yaml catalog
'@tanstack/react-router': npm:speedy-router@0.1.4
'@tanstack/router-plugin': npm:speedy-router-plugin@0.1.4
```

Apps keep `createFileRoute('/posts/$id')` in each route file. Nothing new to call at runtime.

## Streaming, on purpose

TanStack's `renderRouterToStream` inspects `User-Agent` with `isbot` and, for crawlers, waits for React's `allReady` / `onAllReady` so the first byte is a complete document.

This router never inspects User-Agent.

Every SSR stream starts on `onShellReady` by default and flushes incrementally. That keeps a dependency out of the hot path and avoids a User-Agent parse on every request.

If you need crawlers to receive fully buffered HTML, pass `isBot: true` (or a request predicate) to `renderRouterToStream`. That waits for React's `allReady` / `onAllReady` without adding `isbot`.

## Compatibility

The public names match `@tanstack/react-router`. Default loader freshness does too: omitted `staleTime` is 0. This workspace runs a copied, modified subset of TanStack's history, router-core, and React tests — not TanStack's full monorepo, e2e, or TypeScript-version matrix. Alias the TanStack names to the local packages:

```ts
// vitest / vite
resolve: {
  alias: {
    '@tanstack/react-router': 'speedy-router',
    '@tanstack/router-core': 'speedy-router-core',
    '@tanstack/history': 'speedy-router-history',
    '@tanstack/router-plugin': 'speedy-router-plugin',
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

The public packages are `speedy-router`, `speedy-router-core`, `speedy-router-history`, and `speedy-router-plugin` (formerly `speedy-router-generator`). The repo root stays private. Versions stay in lockstep. Releases run from [`.github/workflows/release.yml`](.github/workflows/release.yml).

Published tarballs contain compiled ESM JavaScript and `.d.ts` files in `dist/`. TypeScript source stays in the git repo. `pnpm build` emits `dist` before `pnpm release`.

Trusted publishing cannot create a package's first version. Bootstrap once with a token, then switch to OIDC.

### 1. First publish (token)

1. Sign in at [npmjs.com](https://www.npmjs.com) as the owner who will hold the four package names.
2. Create a granular access token with **Read and write** permission for new packages (or an Automation classic token).
3. Either:
   - add it as the `NPM_TOKEN` repository secret on `anonrig/router`, then run [Release](https://github.com/anonrig/router/actions/workflows/release.yml) with **bump** `none` (publishes `0.1.0`), or
   - from a clean checkout of the release commit: `NPM_TOKEN=… pnpm release`.
4. Confirm all four names exist: [speedy-router](https://www.npmjs.com/package/speedy-router), [speedy-router-core](https://www.npmjs.com/package/speedy-router-core), [speedy-router-history](https://www.npmjs.com/package/speedy-router-history), [speedy-router-plugin](https://www.npmjs.com/package/speedy-router-plugin).

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
