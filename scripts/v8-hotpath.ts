/**
 * Exercise hot-path functions long enough for TurboFan, then keep going
 * so --trace-deopt / --prof see the steady state.
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
import { findRouteMatch, processRouteTree } from '../packages/router-core/src/match.ts'
import {
  appPaths as paths,
  buildAppTree,
  buildWideTree,
  encoded,
  ordinarySearch,
  sample,
} from './v8-shared.ts'

const processed = processRouteTree(buildWideTree() as any)
const needle = '/s0-7/s0-7-1-7/s0-7-1-7-2-7'

const appRoot = buildAppTree()
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
  findRouteMatch(processed, needle)
}

for (let i = 0; i < 50_000; i++) syncHot()
await router.load()
for (let i = 0; i < 5_000; i++) {
  await router.navigate({ href: paths[cursor++ % paths.length]! })
  await router.load()
}
for (let i = 0; i < 200; i++) {
  const path = paths[i % paths.length]!
  await createRouter({
    routeTree: appRoot,
    history: createMemoryHistory({ initialEntries: [path] }),
  }).load()
}
for (let i = 0; i < 50_000; i++) syncHot()
console.log('v8-hotpath done')
