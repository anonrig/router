import { describe, expect, test } from 'vitest'
import { createMemoryHistory } from 'speedy-router-history'
import { createRootRoute, createRoute } from '../src/route'
import { createRouter } from '../src/router'

describe('navigateHrefFast history state', () => {
  test('same-href navigation with state commits to history', async () => {
    const root = createRootRoute()
    const index = createRoute({ getParentRoute: () => root, path: '/' })
    root.addChildren([index] as any)
    const history = createMemoryHistory({ initialEntries: ['/'] })
    const router = createRouter({
      routeTree: root as any,
      history,
      isServer: true,
    })

    await router.load()
    expect(history.location.state.__TSR_index).toBe(0)

    await router.navigate({ href: '/', state: { foo: 1 } } as any)

    expect((history.location.state as any).foo).toBe(1)
    expect(history.location.state.__TSR_index).toBe(1)
    expect((router.latestLocation.state as any).foo).toBe(1)
    expect(router.latestLocation.state.__TSR_index).toBe(1)
  })
})
