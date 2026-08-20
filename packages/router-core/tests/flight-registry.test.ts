import { describe, expect, test } from 'vitest'
import { createMemoryHistory } from 'speedy-router-history'
import { createRootRoute, createRoute } from '../src/route'
import { createRouter } from '../src/router'

describe('flight registry', () => {
  test('a client load without a flight registry does not throw', async () => {
    const root = createRootRoute()
    const index = createRoute({ getParentRoute: () => root, path: '/' })
    const about = createRoute({ getParentRoute: () => root, path: '/about' })
    root.addChildren([index, about])
    const router = createRouter({
      routeTree: root,
      history: createMemoryHistory({ initialEntries: ['/'] }),
      isServer: false,
    })

    expect(router._flights).toBeUndefined()
    await expect(router.load()).resolves.toBeUndefined()

    router._flights = undefined
    await expect(router.navigate({ to: '/about' } as any)).resolves.toBeUndefined()
    expect(router.state.location.pathname).toBe('/about')
  })
})
