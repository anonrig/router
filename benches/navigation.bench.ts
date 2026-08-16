import { bench, describe } from 'vitest'
import { createMemoryHistory } from '../packages/history/src/index.ts'
import { createRootRoute, createRoute } from '../packages/router-core/src/route.ts'
import { RouterCore } from '../packages/router-core/src/router.ts'

function createNavRouter() {
  const root = createRootRoute()
  const index = createRoute({ getParentRoute: () => root, path: '/' })
  const posts = createRoute({ getParentRoute: () => root, path: '/posts' })
  const post = createRoute({
    getParentRoute: () => root,
    path: '/posts/$id',
    loader: () => ({ title: 'Post' }),
  })
  const about = createRoute({ getParentRoute: () => root, path: '/about' })
  const search = createRoute({ getParentRoute: () => root, path: '/search' })
  root.addChildren([index, posts, post, about, search])
  return new RouterCore({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
}

const router = createNavRouter()
const paths = ['/', '/posts', '/posts/42', '/about', '/search?q=router']
const typedDests = [
  { to: '/' },
  { to: '/posts' },
  { to: '/posts/$id', params: { id: '42' } },
  { to: '/about' },
  { to: '/search', search: { q: 'router' } },
] as const
let cursor = 0
let typedCursor = 0
let paramCursor = 0

describe('navigation', () => {
  bench('navigate ({ href })', async () => {
    const href = paths[cursor++ % paths.length]!
    await router.navigate({ href })
  })

  bench('navigate ({ to, params })', async () => {
    await router.navigate(typedDests[typedCursor++ % typedDests.length] as any)
  })

  bench('navigate changing params', async () => {
    await router.navigate({
      to: '/posts/$id',
      params: { id: String((paramCursor++ % 50) + 1) },
    })
  })

  bench('invalidate + reload', async () => {
    await router.invalidate()
  })

  bench('buildLocation absolute', () => {
    router.buildLocation({ to: '/posts/$id', params: { id: '42' } })
  })
})
