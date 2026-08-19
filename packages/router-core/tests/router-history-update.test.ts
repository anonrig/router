import { describe, expect, test } from 'vitest'
import { createMemoryHistory } from 'speedy-router-history'
import { createRootRoute, createRoute } from '../src/route'
import { createRouter } from '../src/router'

describe('router history updates', () => {
  test('subscribes to a replacement history', async () => {
    const root = createRootRoute()
    const first = createRoute({ getParentRoute: () => root, path: '/first' })
    const second = createRoute({ getParentRoute: () => root, path: '/second' })
    root.addChildren([first, second])
    const oldHistory = createMemoryHistory({ initialEntries: ['/first'] })
    const nextHistory = createMemoryHistory({ initialEntries: ['/first'] })
    const router = createRouter({
      routeTree: root,
      history: oldHistory,
      isServer: false,
    })
    await router.load()

    router.update({ history: nextHistory })
    nextHistory.push('/second')
    await Promise.resolve()
    await Promise.resolve()

    expect(router.latestLocation.pathname).toBe('/second')
  })
})
