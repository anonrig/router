/**
 * Report V8 optimization status for hot-path functions.
 *
 *   node --allow-natives-syntax \
 *     node_modules/vite-node/dist/cli.mjs --config scripts/bench-compare.config.ts \
 *     scripts/v8-status.ts
 *
 * Node 22 / V8 bits:
 *   1 fn  2 never-opt  8 maybe-deopted  16 optimized
 *   32 maglev  64 turbofan  128 interpreted  32768 baseline
 */
import { createMemoryHistory, parseHref } from '@anonrig/history'
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
} from '@anonrig/router-core'
import {
  findRouteMatch,
  findRouteMatchFromTree,
  processRouteTree,
} from '../packages/router-core/src/match.ts'

const natives = (src: string) => new Function('fn', `return ${src}`) as (fn: Function) => any

const getOptimizationStatus = natives('%GetOptimizationStatus(fn)')
const prepare = natives('%PrepareFunctionForOptimization(fn)')
const optimizeNext = natives('%OptimizeFunctionOnNextCall(fn)')

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

function isBound(fn: Function): boolean {
  return (
    fn.name.startsWith('bound ') || /\[native code\]/.test(Function.prototype.toString.call(fn))
  )
}

function safeStatus(fn: unknown): string {
  if (typeof fn !== 'function') return 'missing'
  if (isBound(fn)) return 'bound\tskipped'
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

const root = createRootRoute()
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
make(root, 0, 's')
const processed = processRouteTree(root as any)
const needle = '/s0-7/s0-7-1-7/s0-7-1-7-2-7'
const paramNeedle = '/posts/abc'

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
const router = createRouter({
  routeTree: appRoot,
  history: createMemoryHistory({ initialEntries: ['/'] }),
})
const paths = ['/', '/posts', '/posts/1', '/posts/2', '/about']
let cursor = 0

function syncHot() {
  encode(sample)
  decode(encoded)
  defaultStringifySearch(ordinarySearch)
  parseHref('/posts/abc?tab=specs&page=2#comments', undefined)
  cleanPath('/a//b///c/d//e')
  resolvePath({ base: '/a/b/c', to: '../../d/e' })
  interpolatePath({ path: '/posts/$slug/comments/$id', params: { slug: 'x', id: '1' } })
  findRouteMatchFromTree(processed, needle)
  findRouteMatchFromTree(appTree, paramNeedle)
}

for (let i = 0; i < 20_000; i++) syncHot()
await router.load()
for (let i = 0; i < 2_000; i++) {
  await router.navigate({ href: paths[cursor++ % paths.length]! })
  await router.load()
}

const proto = Object.getPrototypeOf(router)
const rows: Array<[string, unknown, boolean]> = [
  ['encode', encode, true],
  ['decode', decode, true],
  ['defaultStringifySearch', defaultStringifySearch, true],
  ['parseHref', parseHref, true],
  ['cleanPath', cleanPath, true],
  ['resolvePath', resolvePath, true],
  ['interpolatePath', interpolatePath, true],
  ['findRouteMatch', findRouteMatch, true],
  ['findRouteMatchFromTree', findRouteMatchFromTree, true],
  ['router.load (own)', router.load, Object.hasOwn(router, 'load')],
  ['RouterCore.load (proto)', proto.load, Object.hasOwn(proto, 'load')],
  ['router.navigate (own)', router.navigate, Object.hasOwn(router, 'navigate')],
  ['RouterCore.navigate (proto)', proto.navigate, Object.hasOwn(proto, 'navigate')],
  ['router.parseLocation (own)', router.parseLocation, Object.hasOwn(router, 'parseLocation')],
  ['RouterCore.parseLocation (proto)', proto.parseLocation, Object.hasOwn(proto, 'parseLocation')],
  ['router.buildLocation (own)', router.buildLocation, Object.hasOwn(router, 'buildLocation')],
  ['RouterCore.buildLocation (proto)', proto.buildLocation, Object.hasOwn(proto, 'buildLocation')],
  [
    'router.updateLatestLocation (own)',
    router.updateLatestLocation,
    Object.hasOwn(router, 'updateLatestLocation'),
  ],
  [
    'RouterCore.updateLatestLocation (proto)',
    proto.updateLatestLocation,
    Object.hasOwn(proto, 'updateLatestLocation'),
  ],
  ['router.matchRoutes (own)', router.matchRoutes, Object.hasOwn(router, 'matchRoutes')],
  ['RouterCore.matchRoutes (proto)', proto.matchRoutes, Object.hasOwn(proto, 'matchRoutes')],
]

console.log('name\town\tstatus\tflags')
for (const [name, fn, own] of rows) {
  console.log(`${name}\t${own}\t${safeStatus(fn)}`)
}

function forceOptimize(name: string, fn: Function, run: () => void) {
  try {
    prepare(fn)
    run()
    optimizeNext(fn)
    run()
    console.log(`force ${name}\t${safeStatus(fn)}`)
  } catch (err) {
    console.log(`force ${name}\tcrash\t${(err as Error).message}`)
  }
}

forceOptimize('encode', encode, () => encode(sample))
forceOptimize('decode', decode, () => decode(encoded))
forceOptimize('interpolatePath', interpolatePath, () =>
  interpolatePath({ path: '/posts/$slug/comments/$id', params: { slug: 'x', id: '1' } }),
)
forceOptimize('findRouteMatchFromTree', findRouteMatchFromTree, () =>
  findRouteMatchFromTree(processed, needle),
)
forceOptimize('findRouteMatchFromTree-param', findRouteMatchFromTree, () =>
  findRouteMatchFromTree(appTree, paramNeedle),
)
forceOptimize('RouterCore.load', proto.load, () => {})
forceOptimize('RouterCore.parseLocation', proto.parseLocation, () =>
  router.parseLocation(router.history.location, router.latestLocation),
)
forceOptimize('RouterCore.buildLocation', proto.buildLocation, () =>
  router.buildLocation({ to: '/posts/$id', params: { id: '1' } }),
)
forceOptimize('RouterCore.updateLatestLocation', proto.updateLatestLocation, () =>
  router.updateLatestLocation(),
)

const fresh = createRouter({
  routeTree: appRoot,
  history: createMemoryHistory({ initialEntries: ['/posts/1'] }),
})
console.log(`fresh.load === proto.load\t${fresh.load === proto.load}`)
console.log(
  `fresh.parseLocation === proto.parseLocation\t${fresh.parseLocation === proto.parseLocation}`,
)
console.log(`fresh.load status\t${safeStatus(fresh.load)}`)
console.log(`bound navigate === proto.navigate\t${router.navigate === proto.navigate}`)

for (let i = 0; i < 50; i++) {
  await createRouter({
    routeTree: appRoot,
    history: createMemoryHistory({ initialEntries: [paths[i % paths.length]!] }),
  }).load()
}
console.log('v8-status done')
