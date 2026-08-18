/**
 * Head-to-head throughput: this repo vs published TanStack Router.
 *
 * `speedy-router*` resolves through the workspace packages. `@tanstack/*` stays
 * on the published packages so the same operations can be timed head-to-head.
 *
 * Headline rows measure equivalent work on both sides: typed `to`/`params`
 * navigation (what `<Link>` uses), param-changing navigation, invalidate +
 * reload, and per-request cold `load` / `createRequestHandler`. Default
 * `staleTime` is 0, so those navigations rerun stale loaders on both sides.
 * Utility rows use rotating unique inputs so last-value intern caches miss.
 * A settled `router.load()` no-op is not published.
 */
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'

const require = createRequire(import.meta.url)
function tanstackVersion(name: string) {
  return (require(`${name}/package.json`) as { version: string }).version
}
import './bench-compare-self.ts'
import {
  createMemoryHistory as oursCreateMemoryHistory,
  parseHref as oursParseHref,
} from 'speedy-router-history'
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
} from 'speedy-router-core'
import { createRequestHandler as oursCreateRequestHandler } from 'speedy-router-core/ssr/server'
import { dehydrateSsrMatchId as oursDehydrateSsrMatchId } from 'speedy-router-core/ssr/ssr-match-id'
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

type Row = {
  name: string
  ours: number
  tanstack: number
  oursBytes: number
  tanstackBytes: number
}

function now() {
  return performance.now()
}

function heapUsed() {
  return process.memoryUsage().heapUsed
}

function collectHeap(fn: () => void, ms: number) {
  const warmupEnd = now() + 40
  while (now() < warmupEnd) fn()
  globalThis.gc?.()
  const before = heapUsed()
  let ops = 0
  const start = now()
  const end = start + ms
  while (now() < end) {
    fn()
    ops++
  }
  return ops > 0 ? (heapUsed() - before) / ops : 0
}

async function collectHeapAsync(fn: () => Promise<void>, ms: number) {
  const warmupEnd = now() + 40
  while (now() < warmupEnd) await fn()
  globalThis.gc?.()
  const before = heapUsed()
  let ops = 0
  const start = now()
  const end = start + ms
  while (now() < end) {
    await fn()
    ops++
  }
  return ops > 0 ? (heapUsed() - before) / ops : 0
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

function measureSyncHeap(fn: () => void, ms = 250) {
  const samples = [collectHeap(fn, ms), collectHeap(fn, ms), collectHeap(fn, ms)]
  const usable = samples.filter((value) => value >= 0)
  return Math.max(0, median(usable.length ? usable : samples))
}

async function measureAsyncHeap(fn: () => Promise<void>, ms = 250) {
  const samples = [
    await collectHeapAsync(fn, ms),
    await collectHeapAsync(fn, ms),
    await collectHeapAsync(fn, ms),
  ]
  const usable = samples.filter((value) => value >= 0)
  return Math.max(0, median(usable.length ? usable : samples))
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

function createOursAppTree(loader?: () => { title: string }) {
  const root = oursCreateRootRoute()
  const index = oursCreateRoute({ getParentRoute: () => root, path: '/' })
  const posts = oursCreateRoute({ getParentRoute: () => root, path: '/posts' })
  const post = oursCreateRoute({
    getParentRoute: () => root,
    path: '/posts/$id',
    loader: loader ?? (() => ({ title: 'Post' })),
  })
  const about = oursCreateRoute({ getParentRoute: () => root, path: '/about' })
  root.addChildren([index, posts, post, about])
  return root
}

function createTsAppTree(loader?: () => { title: string }) {
  const root = tsCreateRootRoute()
  const index = tsCreateRoute({ getParentRoute: () => root, path: '/' })
  const posts = tsCreateRoute({ getParentRoute: () => root, path: '/posts' })
  const post = tsCreateRoute({
    getParentRoute: () => root,
    path: '/posts/$id',
    loader: loader ?? (() => ({ title: 'Post' })),
  })
  const about = tsCreateRoute({ getParentRoute: () => root, path: '/about' })
  root.addChildren([index, posts, post, about])
  return root
}

const encodeSamples = [
  { token: 'foo', page: 12, q: 'hello world', flag: true },
  { token: 'bar', page: 3, q: 'router bench', flag: false },
  { token: 'baz', page: 99, q: 'unique value', flag: true },
  { token: 'qux', page: 1, q: 'another query', flag: false },
  { token: 'zip', page: 42, q: 'more text', flag: true },
  { token: 'zap', page: 7, q: 'final sample', flag: false },
]
const decodeSamples = encodeSamples.map((sample) => oursEncode(sample))
const searchSamples = [
  { tab: 'specs', filter: 'available', category: 'hardware', sort: 'newest' },
  { tab: 'reviews', filter: 'all', category: 'software', sort: 'oldest' },
  { tab: 'docs', filter: 'open', category: 'cloud', sort: 'name' },
  { q: 'router', page: 2, debug: true },
  { ref: 'nav', utm: 'bench', lang: 'en' },
  { id: 'post-1', comments: true, sort: 'recent' },
]
const hrefSamples = [
  '/posts/abc?tab=specs&page=2#comments',
  '/about?ref=nav#team',
  '/posts/1?sort=new',
  '/search?q=router&page=3',
  '/settings/profile?tab=security',
  '/docs/start#install',
]
const cleanSamples = [
  '/a//b///c/d//e',
  '/x//y/z/',
  '//double/slash',
  '/keep/single',
  '/a/b//c//d/e/',
]
const resolveSamples = [
  { base: '/a/b/c', to: '../../d/e' },
  { base: '/posts/1', to: '../2' },
  { base: '/docs/api', to: './guide' },
  { base: '/a/b', to: '/absolute' },
  { base: '/x/y/z', to: '../../../root' },
]
const interpolateSamples = [
  { path: '/posts/$slug/comments/$id', params: { slug: 'x', id: '1' } },
  { path: '/posts/$slug/comments/$id', params: { slug: 'y', id: '2' } },
  { path: '/orgs/$org/projects/$id', params: { org: 'acme', id: '9' } },
  { path: '/files/$id', params: { id: 'abc' } },
  { path: '/users/$user/posts/$id', params: { user: 'sam', id: '4' } },
]
const typicalIds = Array.from(
  { length: 100 },
  (_, index) => `/$orgId/projects/$projectId/acme/projects/project-${index}{"page":${index}}`,
)
const needles: string[] = []
for (let a = 0; a < 8; a++) {
  for (let b = 0; b < 8; b++) {
    needles.push(`/s0-${a}/s0-${a}-1-${b}/s0-${a}-1-${b}-2-7`)
  }
}
let matchCursor = 0
let sampleCursor = 0
const oursRouteTree = createOursAppTree()
const tsRouteTree = createTsAppTree()
const paths = ['/', '/posts', '/posts/1', '/posts/2', '/about']
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

const typedDests = [
  { to: '/' },
  { to: '/posts' },
  { to: '/posts/$id', params: { id: '1' } },
  { to: '/posts/$id', params: { id: '2' } },
  { to: '/about' },
] as const

async function countLoaders(
  createApp: (counter: { calls: number }) => {
    navigate: (options: any) => Promise<unknown>
  },
) {
  const sequential = { calls: 0 }
  const router = createApp(sequential)
  for (let index = 0; index < 100; index++) {
    await router.navigate(typedDests[index % typedDests.length])
  }
  const typed = sequential.calls
  for (let index = 0; index < 100; index++) {
    await router.navigate({
      to: '/posts/$id',
      params: { id: String((index % 50) + 1) },
    })
  }
  const changingAfterTyped = sequential.calls - typed
  const fresh = { calls: 0 }
  const freshRouter = createApp(fresh)
  for (let index = 0; index < 100; index++) {
    await freshRouter.navigate({
      to: '/posts/$id',
      params: { id: String((index % 50) + 1) },
    })
  }
  return { typed, changingAfterTyped, fresh: fresh.calls }
}

async function assertLoaderParity() {
  const ours = await countLoaders((counter) =>
    oursCreateRouter({
      routeTree: createOursAppTree(() => {
        counter.calls++
        return { title: 'Post' }
      }),
      history: oursCreateMemoryHistory({ initialEntries: ['/'] }),
    }),
  )
  const tanstack = await countLoaders((counter) =>
    tsCreateRouter({
      routeTree: createTsAppTree(() => {
        counter.calls++
        return { title: 'Post' }
      }),
      history: tsCreateMemoryHistory({ initialEntries: ['/'] }),
    }),
  )
  if (
    ours.typed !== tanstack.typed ||
    ours.changingAfterTyped !== tanstack.changingAfterTyped ||
    ours.fresh !== tanstack.fresh
  ) {
    throw new Error(
      `Loader-call parity failed: ours=${JSON.stringify(ours)} tanstack=${JSON.stringify(tanstack)}`,
    )
  }
  return ours
}

const microRows: Row[] = []
const headlineRows: Row[] = []

const syncJobs: Array<{ name: string; ours: () => void; tanstack: () => void }> = []
const asyncJobs: Array<{
  name: string
  ours: () => Promise<void>
  tanstack: () => Promise<void>
}> = []

function addSync(name: string, ours: () => void, tanstack: () => void) {
  syncJobs.push({ name, ours, tanstack })
}

function addAsync(name: string, ours: () => Promise<void>, tanstack: () => Promise<void>) {
  asyncJobs.push({ name, ours, tanstack })
}

async function finishRows() {
  for (const job of syncJobs) {
    microRows.push({
      name: job.name,
      ours: measureSync(job.ours),
      tanstack: measureSync(job.tanstack),
      oursBytes: 0,
      tanstackBytes: 0,
    })
  }
  for (const job of asyncJobs) {
    headlineRows.push({
      name: job.name,
      ours: await measureAsync(job.ours),
      tanstack: await measureAsync(job.tanstack),
      oursBytes: 0,
      tanstackBytes: 0,
    })
  }
  globalThis.gc?.()
  for (let i = 0; i < syncJobs.length; i++) {
    const job = syncJobs[i]!
    const row = microRows[i]!
    row.oursBytes = measureSyncHeap(job.ours)
    row.tanstackBytes = measureSyncHeap(job.tanstack)
  }
  for (let i = 0; i < asyncJobs.length; i++) {
    const job = asyncJobs[i]!
    const row = headlineRows[i]!
    row.oursBytes = await measureAsyncHeap(job.ours)
    row.tanstackBytes = await measureAsyncHeap(job.tanstack)
  }
}

function fmt(n: number) {
  return n >= 1000 ? n.toLocaleString('en-US', { maximumFractionDigits: 0 }) : n.toFixed(1)
}

function ratio(ours: number, tanstack: number) {
  if (tanstack <= 0) return '—'
  return `${(ours / tanstack).toFixed(2)}×`
}

function printTable(title: string, rows: Row[]) {
  console.log(title)
  console.log(
    'Operation'.padEnd(38) +
      'speedy-router'.padStart(14) +
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
}

function printRows(
  headlines: Row[],
  micros: Row[],
  loaders: Awaited<ReturnType<typeof countLoaders>>,
) {
  console.log('')
  console.log('Same-machine comparison (higher ops/s is better)')
  console.log(`Node ${process.version}`)
  console.log(
    `TanStack: @tanstack/router-core ${tanstackVersion('@tanstack/router-core')}, @tanstack/history ${tanstackVersion('@tanstack/history')}, @tanstack/react-router ${tanstackVersion('@tanstack/react-router')}`,
  )
  console.log(
    `Loader-call parity: typed ${loaders.typed}/${loaders.typed}, changing-params ${loaders.fresh}/${loaders.fresh} (default staleTime 0)`,
  )
  console.log('')
  printTable('Equal-work headlines (same loader counts, default staleTime 0)', [
    ...headlines.filter((row) => row.name === 'Warm navigate ({ to, params })'),
    ...headlines.filter((row) => row.name === 'Warm navigate changing params'),
    ...headlines.filter((row) => row.name === 'Invalidate + reload'),
    ...headlines.filter((row) => row.name === 'SSR cold router.load req/s'),
    ...headlines.filter((row) => row.name === 'createRequestHandler req/s'),
  ])
  printTable(
    'Same staleTime, no to/params interpolation',
    headlines.filter((row) => row.name === 'Warm navigate ({ href })'),
  )
  printTable('Utilities (rotating unique inputs so intern caches miss)', micros)
}

function runSection(section: string): Row[] {
  const result = spawnSync(process.execPath, [...process.execArgv, ...process.argv.slice(1)], {
    env: { ...process.env, BENCH_SECTION: section },
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  })
  if (result.status !== 0) {
    if (result.stderr) process.stderr.write(result.stderr)
    if (result.stdout) process.stdout.write(result.stdout)
    process.exit(result.status ?? 1)
  }
  const line = result.stdout.split('\n').find((entry) => entry.startsWith('BENCH_JSON:'))
  if (!line) {
    process.stderr.write(result.stdout)
    throw new Error(`bench section ${section} did not print BENCH_JSON`)
  }
  return JSON.parse(line.slice('BENCH_JSON:'.length)) as Row[]
}

const section = process.env.BENCH_SECTION

if (!section) {
  const loaders = await assertLoaderParity()
  const headlines = runSection('headline')
  const micros = runSection('micro')
  printRows(headlines, micros, loaders)
  process.exit(0)
}

globalThis.gc?.()

if (section === 'headline') {
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
        ({ responseHeaders }) => new Response(null, { status: 200, headers: responseHeaders }),
      )
    },
    async () => {
      const path = paths[cursor++ % paths.length]!
      const handler = tsCreateRequestHandler({
        createRouter: () => createTsRouter(path),
        request: new Request(`http://localhost${path}`),
      })
      await handler(
        ({ responseHeaders }) => new Response(null, { status: 200, headers: responseHeaders }),
      )
    },
  )
  const oursRouter = oursCreateRouter({
    routeTree: oursRouteTree,
    history: oursCreateMemoryHistory({ initialEntries: ['/'] }),
  })
  const tsRouter = tsCreateRouter({
    routeTree: tsRouteTree,
    history: tsCreateMemoryHistory({ initialEntries: ['/'] }),
  })
  let typedCursor = 0
  let paramCursor = 0
  await addAsync(
    'Warm navigate ({ href })',
    async () => {
      await oursRouter.navigate({ href: paths[cursor++ % paths.length]! })
    },
    async () => {
      await tsRouter.navigate({ href: paths[cursor++ % paths.length]! })
    },
  )
  await addAsync(
    'Warm navigate ({ to, params })',
    async () => {
      await oursRouter.navigate(typedDests[typedCursor++ % typedDests.length] as any)
    },
    async () => {
      await tsRouter.navigate(typedDests[typedCursor++ % typedDests.length] as any)
    },
  )
  await addAsync(
    'Warm navigate changing params',
    async () => {
      await oursRouter.navigate({
        to: '/posts/$id',
        params: { id: String((paramCursor++ % 50) + 1) },
      })
    },
    async () => {
      await tsRouter.navigate({
        to: '/posts/$id',
        params: { id: String((paramCursor++ % 50) + 1) },
      })
    },
  )
  const oursInvalidateRouter = oursCreateRouter({
    routeTree: oursRouteTree,
    history: oursCreateMemoryHistory({ initialEntries: ['/posts/1'] }),
  })
  const tsInvalidateRouter = tsCreateRouter({
    routeTree: tsRouteTree,
    history: tsCreateMemoryHistory({ initialEntries: ['/posts/1'] }),
  })
  await oursInvalidateRouter.load()
  await tsInvalidateRouter.load()
  await addAsync(
    'Invalidate + reload',
    async () => {
      await oursInvalidateRouter.invalidate()
    },
    async () => {
      await tsInvalidateRouter.invalidate()
    },
  )
}

if (section === 'micro') {
  const oursProcessed = buildOursLargeTree(8, 3)
  const tsProcessed = buildTsLargeTree(8, 3)
  const oursHistory = oursCreateMemoryHistory({ initialEntries: ['/'] })
  const tsHistory = tsCreateMemoryHistory({ initialEntries: ['/'] })
  await addSync(
    'Query-string encode',
    () => {
      oursEncode(encodeSamples[sampleCursor++ % encodeSamples.length]!)
    },
    () => {
      tsEncode(encodeSamples[sampleCursor++ % encodeSamples.length]!)
    },
  )
  await addSync(
    'Query-string decode',
    () => {
      oursDecode(decodeSamples[sampleCursor++ % decodeSamples.length]!)
    },
    () => {
      tsDecode(decodeSamples[sampleCursor++ % decodeSamples.length]!)
    },
  )
  await addSync(
    'defaultStringifySearch',
    () => {
      oursStringifySearch(searchSamples[sampleCursor++ % searchSamples.length]!)
    },
    () => {
      tsStringifySearch(searchSamples[sampleCursor++ % searchSamples.length]!)
    },
  )
  await addSync(
    'parseHref',
    () => {
      oursParseHref(hrefSamples[sampleCursor++ % hrefSamples.length]!, undefined)
    },
    () => {
      tsParseHref(hrefSamples[sampleCursor++ % hrefSamples.length]!, undefined)
    },
  )
  await addSync(
    'cleanPath',
    () => {
      oursCleanPath(cleanSamples[sampleCursor++ % cleanSamples.length]!)
    },
    () => {
      tsCleanPath(cleanSamples[sampleCursor++ % cleanSamples.length]!)
    },
  )
  await addSync(
    'resolvePath',
    () => {
      oursResolvePath(resolveSamples[sampleCursor++ % resolveSamples.length]!)
    },
    () => {
      tsResolvePath(resolveSamples[sampleCursor++ % resolveSamples.length]!)
    },
  )
  await addSync(
    'interpolatePath',
    () => {
      oursInterpolatePath(interpolateSamples[sampleCursor++ % interpolateSamples.length]!)
    },
    () => {
      tsInterpolatePath(interpolateSamples[sampleCursor++ % interpolateSamples.length]!)
    },
  )
  await addSync(
    'Route match (large tree)',
    () => {
      oursFindRouteMatch(oursProcessed, needles[matchCursor++ & 63]!)
    },
    () => {
      tsFindRouteMatch(needles[matchCursor++ & 63]!, tsProcessed.processedTree)
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
}

await finishRows()
console.log(`BENCH_JSON:${JSON.stringify([...microRows, ...headlineRows])}`)
