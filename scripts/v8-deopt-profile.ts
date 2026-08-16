/**
 * Exercise the published bench:compare loops, then dump V8 optimization
 * status for the functions those loops actually call.
 */
import { createMemoryHistory, parseHref } from 'fast-router-history'
import {
  cleanPath,
  createRootRoute,
  createRoute,
  createRouter,
  decode,
  defaultStringifySearch,
  encode,
  interpolatePath,
  resolvePath,
} from 'fast-router-core'
import { createRequestHandler } from 'fast-router-core/ssr/server'
import {
  findRouteMatch,
  findRouteMatchFromTree,
  processRouteTree,
} from '../packages/router-core/src/match.ts'

const natives = (src: string) => new Function('fn', `return ${src}`) as (fn: Function) => any
const getOptimizationStatus = natives('%GetOptimizationStatus(fn)')

function describe(status: number): string {
  const flags: string[] = []
  if (status & 1) flags.push('fn')
  if (status & 2) flags.push('never-opt')
  if (status & 4) flags.push('always-opt')
  if (status & 8) flags.push('maybe-deopted')
  if (status & 16) flags.push('optimized')
  if (status & 32) flags.push('maglev')
  if (status & 64) flags.push('turbofan')
  if (status & 128) flags.push('interpreted')
  if (status & 256) flags.push('marked-opt')
  if (status & 8192) flags.push('lite')
  if (status & 16384) flags.push('marked-deopt')
  if (status & 32768) flags.push('baseline')
  return flags.join(',') || String(status)
}

function statusOf(fn: unknown) {
  if (typeof fn !== 'function') return 'missing'
  try {
    const status = getOptimizationStatus(fn)
    return `${status}\t${describe(status)}`
  } catch (err) {
    return `crash\t${(err as Error).message}`
  }
}

const sample = { token: 'foo', page: 12, q: 'hello world', flag: true }
const encoded = encode(sample)
const ordinarySearch = {
  tab: 'specs',
  filter: 'available',
  category: 'hardware',
  sort: 'newest',
}

const largeRoot = createRootRoute()
const make = (parent: any, level: number, prefix: string) => {
  if (level >= 3) return
  const children: any[] = []
  for (let i = 0; i < 8; i++) {
    const route = createRoute({
      getParentRoute: () => parent,
      path: `/${prefix}${level}-${i}`,
    })
    make(route, level + 1, `${prefix}${level}-${i}-`)
    children.push(route)
  }
  parent.addChildren(children)
}
make(largeRoot, 0, 's')
const largeTree = processRouteTree(largeRoot as any)
const needles = [
  '/s0-0/s0-0-1-0/s0-0-1-0-2-0',
  '/s0-7/s0-7-1-7/s0-7-1-7-2-7',
  '/s0-3/s0-3-1-2/s0-3-1-2-2-4',
  '/missing/path',
]

const appRoot = createRootRoute()
const index = createRoute({ getParentRoute: () => appRoot, path: '/' })
const posts = createRoute({ getParentRoute: () => appRoot, path: '/posts' })
const post = createRoute({
  getParentRoute: () => appRoot,
  path: '/posts/$id',
  loader: () => ({ title: 'Post' }),
})
const about = createRoute({ getParentRoute: () => appRoot, path: '/about' })
appRoot.addChildren([index, posts, post, about])
const appTree = processRouteTree(appRoot as any)

const paths = ['/', '/posts', '/posts/1', '/posts/2', '/about']
const typedDests = [
  { to: '/' },
  { to: '/posts' },
  { to: '/posts/$id', params: { id: '1' } },
  { to: '/posts/$id', params: { id: '2' } },
  { to: '/about' },
] as const

function createAppRouter(path = '/') {
  return createRouter({
    routeTree: appRoot,
    history: createMemoryHistory({ initialEntries: [path] }),
  })
}

const router = createAppRouter()
await router.load()

let cursor = 0
let typedCursor = 0
let paramCursor = 0
let matchCursor = 0

for (let i = 0; i < 8_000; i++) {
  encode(sample)
  decode(encoded)
  defaultStringifySearch(ordinarySearch)
  parseHref('/posts/abc?tab=specs&page=2#comments', undefined)
  cleanPath('/a//b///c/d//e')
  resolvePath({ base: '/a/b/c', to: '../../d/e' })
  interpolatePath({ path: '/posts/$slug/comments/$id', params: { slug: 'x', id: '1' } })
  findRouteMatch(largeTree, needles[matchCursor++ & 3]!)
  findRouteMatchFromTree(appTree, '/posts/abc')
}

for (let i = 0; i < 2_000; i++) {
  await router.navigate({ href: paths[cursor++ % paths.length]! })
}
for (let i = 0; i < 2_000; i++) {
  await router.navigate(typedDests[typedCursor++ % typedDests.length] as any)
}
for (let i = 0; i < 2_000; i++) {
  await router.navigate({
    to: '/posts/$id',
    params: { id: String((paramCursor++ % 50) + 1) },
  })
}

const invalidateRouter = createAppRouter('/posts/1')
await invalidateRouter.load()
for (let i = 0; i < 400; i++) {
  await invalidateRouter.invalidate()
}

for (let i = 0; i < 200; i++) {
  const path = paths[i % paths.length]!
  await createAppRouter(path).load()
}

for (let i = 0; i < 80; i++) {
  const path = paths[i % paths.length]!
  const handler = createRequestHandler({
    createRouter: () => createAppRouter(path),
    request: new Request(`http://localhost${path}`),
  })
  await handler(
    async ({ responseHeaders }) => new Response(null, { status: 200, headers: responseHeaders }),
  )
}

const proto = Object.getPrototypeOf(router)
const historyProto = Object.getPrototypeOf(router.history)
const rows: Array<[string, unknown]> = [
  ['encode', encode],
  ['decode', decode],
  ['defaultStringifySearch', defaultStringifySearch],
  ['parseHref', parseHref],
  ['cleanPath', cleanPath],
  ['resolvePath', resolvePath],
  ['interpolatePath', interpolatePath],
  ['findRouteMatch', findRouteMatch],
  ['findRouteMatchFromTree', findRouteMatchFromTree],
  ['RouterCore.load', proto.load],
  ['RouterCore.executeNavigate', proto.executeNavigate],
  ['RouterCore.executeBuildLocation', proto.executeBuildLocation],
  ['RouterCore.tryNavigateToFast', proto.tryNavigateToFast],
  ['RouterCore.navigateHrefFast', proto.navigateHrefFast],
  ['RouterCore.tryWarmLoad', proto.tryWarmLoad],
  ['RouterCore.finishWarmMatches', proto.finishWarmMatches],
  ['RouterCore.completeWarmLoad', proto.completeWarmLoad],
  ['RouterCore.canReuseWarmMatches', proto.canReuseWarmMatches],
  ['RouterCore.runLoad', proto.runLoad],
  ['RouterCore.matchRoutes', proto.matchRoutes],
  ['RouterCore.matchRoutesInternal', proto.matchRoutesInternal],
  ['RouterCore.parseLocation', proto.parseLocation],
  ['RouterCore.updateLatestLocation', proto.updateLatestLocation],
  ['RouterCore.isolateServerRequest', proto.isolateServerRequest],
  ['RouterCore.invalidate', proto.invalidate],
  ['MemoryHistory.push', historyProto.push],
  ['MemoryHistory.notify', historyProto.notify],
]

console.log('name\tstatus\tflags')
for (const [name, fn] of rows) {
  console.log(`${name}\t${statusOf(fn)}`)
}
console.log('v8-deopt-profile done')
