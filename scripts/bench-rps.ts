import { createMemoryHistory, parseHref } from '../packages/history/src/index.ts'
import { decode, encode } from '../packages/router-core/src/qss.ts'
import { findRouteMatch, processRouteTree } from '../packages/router-core/src/match.ts'
import { createRootRoute, createRoute } from '../packages/router-core/src/route.ts'
import { RouterCore } from '../packages/router-core/src/router.ts'

function now() {
  return performance.now()
}

function measureSync(name: string, fn: () => void, ms = 1500) {
  const warmupEnd = now() + 200
  while (now() < warmupEnd) fn()
  let ops = 0
  const start = now()
  const end = start + ms
  while (now() < end) {
    fn()
    ops++
  }
  const elapsed = (now() - start) / 1000
  return { name, ops, seconds: elapsed, hz: ops / elapsed }
}

async function measureAsync(name: string, fn: () => Promise<void>, ms = 1500) {
  const warmupEnd = now() + 200
  while (now() < warmupEnd) await fn()
  let ops = 0
  const start = now()
  const end = start + ms
  while (now() < end) {
    await fn()
    ops++
  }
  const elapsed = (now() - start) / 1000
  return { name, ops, seconds: elapsed, hz: ops / elapsed }
}

function buildLargeTree(width: number, depth: number) {
  const root = createRootRoute()
  const make = (parent: any, level: number, prefix: string) => {
    if (level >= depth) return
    const children: any[] = []
    for (let i = 0; i < width; i++) {
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
  return processRouteTree(root as any)
}

function createAppTree() {
  const root = createRootRoute()
  const index = createRoute({ getParentRoute: () => root, path: '/' })
  const posts = createRoute({ getParentRoute: () => root, path: '/posts' })
  const post = createRoute({
    getParentRoute: () => root,
    path: '/posts/$id',
    loader: () => ({ title: 'Post' }),
  })
  const about = createRoute({ getParentRoute: () => root, path: '/about' })
  root.addChildren([index, posts, post, about])
  return root
}

const sample = { token: 'foo', page: 12, q: 'hello world', flag: true }
const encoded = encode(sample)
const processed = buildLargeTree(8, 3)
const needle = '/s0-7/s0-7-1-7/s0-7-1-7-2-7'
const routeTree = createAppTree()
const paths = ['/', '/posts', '/posts/1', '/posts/2', '/about']
const history = createMemoryHistory({ initialEntries: ['/'] })
const router = new RouterCore({
  routeTree,
  history: createMemoryHistory({ initialEntries: ['/'] }),
})
let cursor = 0

function createRouter(path: string) {
  return new RouterCore({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  })
}

const rows = [
  measureSync('qss encode', () => {
    encode(sample)
  }),
  measureSync('qss decode', () => {
    decode(encoded)
  }),
  measureSync('parseHref', () => {
    parseHref('/posts/abc?tab=specs&page=2#comments', undefined)
  }),
  measureSync('findRouteMatch large tree', () => {
    findRouteMatch(processed, needle)
  }),
  measureSync('history.push', () => {
    history.push(`/n/${cursor++}`)
  }),
  await measureAsync('navigate ({ href })', async () => {
    await router.navigate({ href: paths[cursor++ % paths.length]! })
  }),
  await measureAsync('navigate ({ to, params })', async () => {
    await router.navigate({ to: '/posts/$id', params: { id: String((cursor++ % 50) + 1) } })
  }),
  await router.navigate({ to: '/posts/$id', params: { id: '1' } }),
  await measureAsync('invalidate + reload', async () => {
    await router.invalidate()
  }),
  await measureAsync('SSR cold router.load req/s', async () => {
    const path = paths[cursor++ % paths.length]!
    const next = createRouter(path)
    await next.load()
  }),
]

function fmt(n: number) {
  return n >= 1000 ? n.toLocaleString('en-US', { maximumFractionDigits: 0 }) : n.toFixed(1)
}

console.log('')
console.log('Throughput (higher is better)')
console.log(''.padEnd(40, '-') + ' ' + 'ops/s'.padStart(14))
for (const row of rows) {
  console.log(row.name.padEnd(40) + ' ' + fmt(row.hz).padStart(14))
}
console.log('')
