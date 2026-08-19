import { describe, expect, test } from 'vitest'
import { createMemoryHistory } from 'speedy-router-history'
import { createRootRoute, createRoute } from '../src/route'
import { createRouter } from '../src/router'

function setup(trailingSlash: 'always' | 'never', initialEntry = '/') {
  const root = createRootRoute()
  const index = createRoute({ getParentRoute: () => root, path: '/' })
  const about = createRoute({ getParentRoute: () => root, path: '/about' })
  root.addChildren([index, about] as any)
  return createRouter({
    routeTree: root as any,
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
    isServer: true,
    trailingSlash,
  } as any)
}

describe('trailingSlash on the navigate fast path', () => {
  test('href navigation honors trailingSlash: always', async () => {
    const router = setup('always')
    await router.load()
    await router.navigate({ href: '/about' } as any)
    expect(router.state.location.pathname).toBe('/about/')
  })

  test('to navigation honors trailingSlash: never', async () => {
    const router = setup('never')
    await router.load()
    await router.navigate({ to: '/about/' } as any)
    expect(router.state.location.pathname).toBe('/about')
  })
})
