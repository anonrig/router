import { describe, expect, test } from 'vitest'
import { createMemoryHistory } from 'speedy-router-history'
import { createRootRoute, createRoute } from '../src/route'
import { createRouter } from '../src/router'

describe('navigateHrefFast respects blockers', () => {
  test('blocked href navigate does not desync router from history', async () => {
    ;(globalThis as any).document = {}
    const root = createRootRoute()
    const about = createRoute({
      getParentRoute: () => root,
      path: '/about',
      loader: () => 'about',
    })
    const posts = createRoute({
      getParentRoute: () => root,
      path: '/posts',
      loader: () => 'posts',
    })
    root.addChildren([about, posts] as any)
    const history = createMemoryHistory({ initialEntries: ['/about'] })
    const router = createRouter({
      routeTree: root as any,
      history,
      isServer: true,
    })
    await router.load()
    history.block({ blockerFn: () => true })

    await router.navigate({ href: '/posts' } as any)

    expect(history.location.pathname).toBe('/about')
    expect(router.state.location.pathname).toBe('/about')
    expect(router.latestLocation.pathname).toBe('/about')
    delete (globalThis as any).document
  })
})
