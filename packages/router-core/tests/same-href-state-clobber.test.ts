import { describe, expect, test } from 'vitest'
import { createMemoryHistory } from 'speedy-router-history'
import { createRootRoute, createRoute } from '../src/route'
import { createRouter } from '../src/router'

describe('navigateHrefFast history state bookkeeping', () => {
  test('same-href navigation keeps __TSR_index on published location.state', async () => {
    const root = createRootRoute()
    const about = createRoute({ getParentRoute: () => root, path: '/about' })
    const posts = createRoute({ getParentRoute: () => root, path: '/posts' })
    root.addChildren([about, posts] as any)
    const history = createMemoryHistory({ initialEntries: ['/about'] })
    const router = createRouter({
      routeTree: root as any,
      history,
      isServer: true,
    })

    await router.load()
    await router.navigate({ href: '/posts' } as any)
    expect(history.location.state.__TSR_index).toBe(1)

    await router.navigate({ href: '/posts' } as any)
    expect((router.state.location.state as any).__TSR_index).toBe(1)
    expect((router.latestLocation.state as any).__TSR_index).toBe(1)
  })
})
