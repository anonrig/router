/**
 * Head-to-head throughput: this repo vs published TanStack Router.
 *
 * `@anonrig/*` resolves through the workspace packages. `@tanstack/*` stays
 * on the published packages so the same operations can be timed head-to-head.
 */
import './bench-compare-self.ts'
import {
  createMemoryHistory as oursCreateMemoryHistory,
  parseHref as oursParseHref,
} from '@anonrig/history'
import {
  cleanPath as oursCleanPath,
  createRootRoute as oursCreateRootRoute,
  createRoute as oursCreateRoute,
  createRouter as oursCreateRouter,
  decode as oursDecode,
  defaultStringifySearch as oursStringifySearch,
  encode as oursEncode,
  interpolatePath as oursInterpolatePath,
  resolvePath as oursResolvePath,
} from '@anonrig/router-core'
import { createRequestHandler as oursCreateRequestHandler } from '@anonrig/router-core/ssr/server'
import { dehydrateSsrMatchId as oursDehydrateSsrMatchId } from '@anonrig/router-core/ssr/ssr-match-id'
import {
  findRouteMatch as oursFindRouteMatch,
  processRouteTree as oursProcessRouteTree,
} from '../packages/router-core/src/match.ts'
import {
  createMemoryHistory as tsCreateMemoryHistory,
  parseHref as tsParseHref,
} from '@tanstack/history'
import {
  cleanPath as tsCleanPath,
  decode as tsDecode,
  defaultStringifySearch as tsStringifySearch,
  encode as tsEncode,
  interpolatePath as tsInterpolatePath,
  resolvePath as tsResolvePath,
} from '@tanstack/router-core'
import { createRequestHandler as tsCreateRequestHandler } from '@tanstack/router-core/ssr/server'
import {
  createRootRoute as tsCreateRootRoute,
  createRoute as tsCreateRoute,
  createRouter as tsCreateRouter,
} from '@tanstack/react-router'
import {
  findRouteMatch as tsFindRouteMatch,
  processRouteTree as tsProcessRouteTree,
} from '../node_modules/@tanstack/router-core/dist/esm/new-process-route-tree.js'
import { dehydrateSsrMatchId as tsDehydrateSsrMatchId } from '../node_modules/@tanstack/router-core/dist/esm/ssr/ssr-match-id.js'

type Row = { name: string; ours: number; tanstack: number }

function now() {
  return performance.now()
}

function measureSync(fn: () => void, ms = 1500) {
  const warmupEnd = now() + 200
  while (now() < warmupEnd) fn()
  let ops = 0
  const start = now()
  const end = start + ms
  while (now() < end) {
    fn()
    ops++
  }
  return ops / ((now() - start) / 1000)
}

async function measureAsync(fn: () => Promise<void>, ms = 1500) {
  const warmupEnd = now() + 200
  while (now() < warmupEnd) await fn()
  let ops = 0
  const start = now()
  const end = start + ms
  while (now() < end) {
    await fn()
    ops++
  }
  return ops / ((now() - start) / 1000)
}

function buildOursLargeTree(width: number, depth: number) {
  const root = oursCreateRootRoute()
  const make = (parent: any, level: number, prefix: string) => {
    if (level >= depth) return
    const children: any[] = []
    for (let i = 0; i < width; i++) {
      const route = oursCreateRoute({
        getParentRoute: () => parent,
        path: `/${prefix}${level}-${i}`,
      })
      make(route, level + 1, `${prefix}${level}-${i}-`)
      children.push(route)
    }
    parent.addChildren(children)
  }
  make(root, 0, 's')
  return oursProcessRouteTree(root as any)
}

function buildTsLargeTree(width: number, depth: number) {
  const root = tsCreateRootRoute()
  const make = (parent: any, level: number, prefix: string) => {
    if (level >= depth) return
    const children: any[] = []
    for (let i = 0; i < width; i++) {
      const route = tsCreateRoute({
        getParentRoute: () => parent,
        path: `/${prefix}${level}-${i}`,
      })
      make(route, level + 1, `${prefix}${level}-${i}-`)
      children.push(route)
    }
    parent.addChildren(children)
  }
  make(root, 0, 's')
  root.init?.({ originalIndex: 0 })
  return tsProcessRouteTree(root as any, false, (route: any, index: number) => {
    route.init?.({ originalIndex: index })
  })
}

function createOursAppTree() {
  const root = oursCreateRootRoute()
  const index = oursCreateRoute({ getParentRoute: () => root, path: '/' })
  const posts = oursCreateRoute({ getParentRoute: () => root, path: '/posts' })
  const post = oursCreateRoute({
    getParentRoute: () => root,
    path: '/posts/$id',
    loader: () => ({ title: 'Post' }),
  })
  const about = oursCreateRoute({ getParentRoute: () => root, path: '/about' })
  root.addChildren([index, posts, post, about])
  return root
}

function createTsAppTree() {
  const root = tsCreateRootRoute()
  const index = tsCreateRoute({ getParentRoute: () => root, path: '/' })
  const posts = tsCreateRoute({ getParentRoute: () => root, path: '/posts' })
  const post = tsCreateRoute({
    getParentRoute: () => root,
    path: '/posts/$id',
    loader: () => ({ title: 'Post' }),
  })
  const about = tsCreateRoute({ getParentRoute: () => root, path: '/about' })
  root.addChildren([index, posts, post, about])
  return root
}

const sample = { token: 'foo', page: 12, q: 'hello world', flag: true }
const oursEncoded = oursEncode(sample)
const tsEncoded = tsEncode(sample)
const ordinarySearch = {
  tab: 'specs',
  filter: 'available',
  category: 'hardware',
  sort: 'newest',
}
const typicalIds = Array.from(
  { length: 100 },
  (_, index) => `/$orgId/projects/$projectId/acme/projects/project-${index}{"page":${index}}`,
)
const oursProcessed = buildOursLargeTree(8, 3)
const tsProcessed = buildTsLargeTree(8, 3)
const needle = '/s0-7/s0-7-1-7/s0-7-1-7-2-7'
const oursRouteTree = createOursAppTree()
const tsRouteTree = createTsAppTree()
const paths = ['/', '/posts', '/posts/1', '/posts/2', '/about']
const oursHistory = oursCreateMemoryHistory({ initialEntries: ['/'] })
const tsHistory = tsCreateMemoryHistory({ initialEntries: ['/'] })
const oursRouter = oursCreateRouter({
  routeTree: oursRouteTree,
  history: oursCreateMemoryHistory({ initialEntries: ['/'] }),
})
const tsRouter = tsCreateRouter({
  routeTree: tsRouteTree,
  history: tsCreateMemoryHistory({ initialEntries: ['/'] }),
})
let cursor = 0

function createOursRouter(path: string) {
  return oursCreateRouter({
    routeTree: oursRouteTree,
    history: oursCreateMemoryHistory({ initialEntries: [path] }),
  })
}

function createTsRouter(path: string) {
  return tsCreateRouter({
    routeTree: tsRouteTree,
    history: tsCreateMemoryHistory({ initialEntries: [path] }),
  })
}

const rows: Row[] = []

async function addSync(name: string, ours: () => void, tanstack: () => void) {
  rows.push({ name, ours: measureSync(ours), tanstack: measureSync(tanstack) })
}

async function addAsync(name: string, ours: () => Promise<void>, tanstack: () => Promise<void>) {
  rows.push({ name, ours: await measureAsync(ours), tanstack: await measureAsync(tanstack) })
}

await addSync(
  'Query-string encode',
  () => {
    oursEncode(sample)
  },
  () => {
    tsEncode(sample)
  },
)
await addSync(
  'Query-string decode',
  () => {
    oursDecode(oursEncoded)
  },
  () => {
    tsDecode(tsEncoded)
  },
)
await addSync(
  'defaultStringifySearch (×1000)',
  () => {
    for (let i = 0; i < 1000; i++) oursStringifySearch(ordinarySearch)
  },
  () => {
    for (let i = 0; i < 1000; i++) tsStringifySearch(ordinarySearch)
  },
)
await addSync(
  'parseHref',
  () => {
    oursParseHref('/posts/abc?tab=specs&page=2#comments', undefined)
  },
  () => {
    tsParseHref('/posts/abc?tab=specs&page=2#comments', undefined)
  },
)
await addSync(
  'cleanPath',
  () => {
    oursCleanPath('/a//b///c/d//e')
  },
  () => {
    tsCleanPath('/a//b///c/d//e')
  },
)
await addSync(
  'resolvePath',
  () => {
    oursResolvePath({ base: '/a/b/c', to: '../../d/e' })
  },
  () => {
    tsResolvePath({ base: '/a/b/c', to: '../../d/e' })
  },
)
await addSync(
  'interpolatePath',
  () => {
    oursInterpolatePath({ path: '/posts/$slug/comments/$id', params: { slug: 'x', id: '1' } })
  },
  () => {
    tsInterpolatePath({ path: '/posts/$slug/comments/$id', params: { slug: 'x', id: '1' } })
  },
)
await addSync(
  'Route match (large tree)',
  () => {
    oursFindRouteMatch(oursProcessed, needle)
  },
  () => {
    tsFindRouteMatch(needle, tsProcessed.processedTree)
  },
)
await addSync(
  'Encode 100 typical SSR match IDs',
  () => {
    for (const id of typicalIds) oursDehydrateSsrMatchId(id)
  },
  () => {
    for (const id of typicalIds) tsDehydrateSsrMatchId(id)
  },
)
await addSync(
  'History push',
  () => {
    oursHistory.push(`/n/${cursor++}`)
  },
  () => {
    tsHistory.push(`/n/${cursor++}`)
  },
)
await addAsync(
  'Warm navigate',
  async () => {
    await oursRouter.navigate({ href: paths[cursor++ % paths.length]! })
  },
  async () => {
    await tsRouter.navigate({ href: paths[cursor++ % paths.length]! })
  },
)
await addAsync(
  'Warm router.load',
  async () => {
    await oursRouter.load()
  },
  async () => {
    await tsRouter.load()
  },
)
await addAsync(
  'SSR cold router.load req/s',
  async () => {
    const path = paths[cursor++ % paths.length]!
    await createOursRouter(path).load()
  },
  async () => {
    const path = paths[cursor++ % paths.length]!
    await createTsRouter(path).load()
  },
)
await addAsync(
  'createRequestHandler req/s',
  async () => {
    const path = paths[cursor++ % paths.length]!
    const handler = oursCreateRequestHandler({
      createRouter: () => createOursRouter(path),
      request: new Request(`http://localhost${path}`),
    })
    await handler(
      async ({ responseHeaders }) => new Response(null, { status: 200, headers: responseHeaders }),
    )
  },
  async () => {
    const path = paths[cursor++ % paths.length]!
    const handler = tsCreateRequestHandler({
      createRouter: () => createTsRouter(path),
      request: new Request(`http://localhost${path}`),
    })
    await handler(
      async ({ responseHeaders }) => new Response(null, { status: 200, headers: responseHeaders }),
    )
  },
)

function fmt(n: number) {
  return n >= 1000 ? n.toLocaleString('en-US', { maximumFractionDigits: 0 }) : n.toFixed(1)
}

function ratio(ours: number, tanstack: number) {
  if (tanstack <= 0) return '—'
  return `${(ours / tanstack).toFixed(2)}×`
}

console.log('')
console.log('Same-machine comparison (higher ops/s is better)')
console.log(`Node ${process.version}`)
console.log(
  'TanStack: @tanstack/router-core 1.171.24, @tanstack/history 1.162.1, @tanstack/react-router 1.170.29',
)
console.log('')
console.log(
  'Operation'.padEnd(38) +
    ' @anonrig'.padStart(14) +
    ' TanStack'.padStart(14) +
    ' vs TanStack'.padStart(14),
)
console.log(''.padEnd(80, '-'))
for (const row of rows) {
  console.log(
    row.name.padEnd(38) +
      fmt(row.ours).padStart(14) +
      fmt(row.tanstack).padStart(14) +
      ratio(row.ours, row.tanstack).padStart(14),
  )
}
console.log('')
