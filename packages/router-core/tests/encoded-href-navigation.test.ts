import { describe, expect, test } from 'vitest'
import { createMemoryHistory } from 'speedy-router-history'
import { createRootRoute, createRoute } from '../src/route'
import { createRouter } from '../src/router'

describe('percent-encoded href navigation', () => {
  test('navigate({ href }) decodes the pathname the same way as the initial load', async () => {
    const root = createRootRoute()
    const index = createRoute({ getParentRoute: () => root, path: '/' })
    const page = createRoute({
      getParentRoute: () => root,
      path: '/hello world',
      loader: () => 'ok',
    })
    root.addChildren([index, page] as any)
    const history = createMemoryHistory({ initialEntries: ['/'] })
    const router = createRouter({
      routeTree: root as any,
      history,
      isServer: true,
    })
    await router.load()

    await router.navigate({ href: '/hello%20world' } as any)

    expect(router.state.location.pathname).toBe('/hello world')
    expect(router.state.matches.at(-1)?.routeId).toBe(page.id)
  })
})
