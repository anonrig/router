import { bench, describe } from 'vitest'
import { createMemoryHistory } from '../packages/history/src/index.ts'
import { createRootRoute, createRoute } from '../packages/router-core/src/route.ts'
import { RouterCore } from '../packages/router-core/src/router.ts'

function createNavRouter() {
  const root = createRootRoute()
  const index = createRoute({ getParentRoute: () => root, path: '/' })
  const posts = createRoute({ getParentRoute: () => root, path: '/posts' })
  const post = createRoute({ getParentRoute: () => root, path: '/posts/$id' })
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
let cursor = 0

describe('navigation', () => {
  bench('navigate between routes', async () => {
    const href = paths[cursor++ % paths.length]!
    await router.navigate({ href })
  })

  bench('load current location', async () => {
    await router.load()
  })

  bench('buildLocation absolute', () => {
    router.buildLocation({ to: '/posts/$id', params: { id: '42' } })
  })
})
