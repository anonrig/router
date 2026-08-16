/**
 * Exercise hot-path functions long enough for TurboFan, then keep going
 * so --trace-deopt / --prof see the steady state.
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
import { findRouteMatch, processRouteTree } from '../packages/router-core/src/match.ts'

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
