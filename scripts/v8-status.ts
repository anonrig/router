/**
 * Report V8 optimization status for hot-path functions.
 *
 *   node --allow-natives-syntax --fuzzing --experimental-transform-types --import ./scripts/register-ts.mjs scripts/v8-status.ts
 *
 * `--fuzzing` is required: `%PrepareFunctionForOptimization` can OSR, and
 * recent V8 CHECKs `v8_flags.fuzzing` in that path (Node 24/25 abort).
 *
 * `router.navigate` / `router.buildLocation` are bound wrappers. Status the
 * prototype implementations: `executeNavigate` and `executeBuildLocation`.
 */
import { createMemoryHistory, parseHref } from 'speedy-router-history'
import {
  cleanPath,
  createRouter,
  decode,
  defaultStringifySearch,
  encode,
  interpolatePath,
  resolvePath,
} from 'speedy-router-core'
import {
  findRouteMatch,
  findRouteMatchFromTree,
  processRouteTree,
} from '../packages/router-core/src/match.ts'
import {
  appPaths as paths,
  buildAppTree,
  buildWideTree,
  describeStatus,
  encoded,
  natives,
  ordinarySearch,
  sample,
} from './v8-shared.ts'

const getOptimizationStatusUnsafe = natives('%GetOptimizationStatus(fn)')
const prepareUnsafe = natives('%PrepareFunctionForOptimization(fn)')
const optimizeNextUnsafe = natives('%OptimizeFunctionOnNextCall(fn)')

function assertOptimizable(fn: unknown): asserts fn is Function {
  if (typeof fn !== 'function') {
    throw new TypeError('V8 natives require a function')
  }
  if (isBound(fn)) {
    throw new TypeError('V8 natives cannot status a bound function')
  }
}

function getOptimizationStatus(fn: Function) {
  assertOptimizable(fn)
  return getOptimizationStatusUnsafe(fn)
}

function prepare(fn: Function) {
  assertOptimizable(fn)
  prepareUnsafe(fn)
}

function optimizeNext(fn: Function) {
  assertOptimizable(fn)
  optimizeNextUnsafe(fn)
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
    return `${status}\t${describeStatus(status)}`
  } catch (err) {
    return `crash\t${(err as Error).message}`
  }
}

const processed = processRouteTree(buildWideTree() as any)
const needle = '/s0-7/s0-7-1-7/s0-7-1-7-2-7'
const paramNeedle = '/posts/abc'

const appRoot = buildAppTree()
const appTree = processRouteTree(appRoot as any)
const router = createRouter({
  routeTree: appRoot,
  history: createMemoryHistory({ initialEntries: ['/'] }),
})
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
  [
    'RouterCore.executeNavigate (proto)',
    proto.executeNavigate,
    Object.hasOwn(proto, 'executeNavigate'),
  ],
  ['router.parseLocation (own)', router.parseLocation, Object.hasOwn(router, 'parseLocation')],
  ['RouterCore.parseLocation (proto)', proto.parseLocation, Object.hasOwn(proto, 'parseLocation')],
  ['router.buildLocation (own)', router.buildLocation, Object.hasOwn(router, 'buildLocation')],
  [
    'RouterCore.executeBuildLocation (proto)',
    proto.executeBuildLocation,
    Object.hasOwn(proto, 'executeBuildLocation'),
  ],
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

function forceOptimize(name: string, fn: unknown, run: () => void) {
  if (typeof fn !== 'function' || isBound(fn)) {
    console.log(`force ${name}\t${safeStatus(fn)}`)
    return
  }
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
forceOptimize('RouterCore.executeBuildLocation', proto.executeBuildLocation, () =>
  router.buildLocation({ to: '/posts/$id', params: { id: '1' } }),
)
forceOptimize('RouterCore.executeNavigate', proto.executeNavigate, () => {
  void router.navigate({ href: '/about' })
})
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
console.log(
  `bound navigate === proto.executeNavigate\t${router.navigate === proto.executeNavigate}`,
)
console.log(
  `bound buildLocation === proto.executeBuildLocation\t${router.buildLocation === proto.executeBuildLocation}`,
)

for (let i = 0; i < 50; i++) {
  await createRouter({
    routeTree: appRoot,
    history: createMemoryHistory({ initialEntries: [paths[i % paths.length]!] }),
  }).load()
}
console.log('v8-status done')
