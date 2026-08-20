import { bench, describe } from 'vitest'
import { createMemoryHistory } from '../packages/history/src/index.ts'
import { createRootRoute, createRoute, RouterCore } from '../packages/router-core/src/index.ts'
import { createRequestHandler } from '../packages/router-core/src/ssr/create-request-handler.ts'

function createTree() {
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

const routeTree = createTree()
const paths = ['/', '/posts', '/posts/1', '/posts/2', '/about']
let cursor = 0

function createRouter(path: string) {
  return new RouterCore({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  })
}

describe('ssr requests', () => {
  bench('cold router.load per request', async () => {
    const path = paths[cursor++ % paths.length]!
    const router = createRouter(path)
    await router.load()
  })

  bench('createRequestHandler per request', async () => {
    const path = paths[cursor++ % paths.length]!
    const handler = createRequestHandler({
      createRouter: () => createRouter(path),
      request: new Request(`http://localhost${path}`),
    })
    await handler(
      ({ responseHeaders }) => new Response(null, { status: 200, headers: responseHeaders }),
    )
  })
})
