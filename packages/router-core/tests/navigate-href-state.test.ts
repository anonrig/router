import { describe, expect, test } from 'vitest'
import { createMemoryHistory } from 'speedy-router-history'
import { createRootRoute, createRoute } from '../src/route'
import { createRouter } from '../src/router'

describe('navigateHrefFast history state', () => {
  test('resolves functional state updates', async () => {
    const root = createRootRoute()
    const page = createRoute({ getParentRoute: () => root, path: '/page' })
    root.addChildren([page])
    const history = createMemoryHistory({ initialEntries: ['/'] })
    const router = createRouter({ routeTree: root, history, isServer: true })

    await router.navigate({ href: '/page', state: { count: 1 } } as any)
    await router.navigate({
      href: '/page',
      state: (previous: any) => ({ count: previous.count + 1 }),
    } as any)

    expect((history.location.state as any).count).toBe(2)
  })

  test('state true preserves the current user state', async () => {
    const root = createRootRoute()
    const page = createRoute({ getParentRoute: () => root, path: '/page' })
    root.addChildren([page])
    const history = createMemoryHistory({ initialEntries: ['/'] })
    const router = createRouter({ routeTree: root, history, isServer: true })

    await router.navigate({ href: '/page', state: { count: 1 } } as any)
    await router.navigate({ href: '/page', state: true } as any)

    expect((history.location.state as any).count).toBe(1)
  })

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
