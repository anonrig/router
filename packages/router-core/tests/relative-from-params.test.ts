import { describe, expect, test } from 'vitest'
import { createMemoryHistory } from 'speedy-router-history'
import { createRootRoute, createRoute } from '../src/route'
import { createRouter } from '../src/router'

function setup() {
  const root = createRootRoute()
  const posts = createRoute({
    getParentRoute: () => root,
    path: '/posts',
  })
  const post = createRoute({
    getParentRoute: () => posts,
    path: '/$postId',
  })
  const details = createRoute({
    getParentRoute: () => post,
    path: '/details',
  })
  const info = createRoute({
    getParentRoute: () => post,
    path: '/info',
  })
  root.addChildren([posts.addChildren([post.addChildren([details, info])])])
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ['/posts/id1/details'] }),
    isServer: true,
  })
  return router
}

describe('relative dests against param templates', () => {
  test('buildLocation interpolates from="/posts/$postId" to="./info"', async () => {
    const router = setup()
    await router.load()

    expect(router.buildLocation({ from: '/posts/$postId', to: './info' } as any).pathname).toBe(
      '/posts/id1/info',
    )
  })

  test('navigate follows the interpolated relative dest', async () => {
    const router = setup()
    await router.load()

    await router.navigate({ from: '/posts/$postId', to: './info' } as any)

    expect(router.state.location.pathname).toBe('/posts/id1/info')
  })
})
