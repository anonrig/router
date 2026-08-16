// @vitest-environment node
import { createMemoryHistory } from '@tanstack/history'
import { describe, expect, test, vi } from 'vitest'
import { BaseRootRoute, BaseRoute } from '@tanstack/router-core'
import { createTestRouter } from './router-test-utils'

describe('server load after invalidation', () => {
  test('invalidate reruns the loader on a settled server router', async () => {
    const loader = vi.fn(() => ({ secret: 'value' }))
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      loader,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
      isServer: true,
    })

    await router.load()
    expect(loader).toHaveBeenCalledTimes(1)

    // Server loads never skip: a reused instance must not replay the previous
    // request's loader data just because the URL and match ids still match.
    await router.load()
    expect(loader).toHaveBeenCalledTimes(2)

    await router.invalidate()
    expect(loader).toHaveBeenCalledTimes(3)
    expect(router.state.matches.at(-1)).toMatchObject({
      status: 'success',
      invalid: false,
      loaderData: { secret: 'value' },
    })
  })
})
