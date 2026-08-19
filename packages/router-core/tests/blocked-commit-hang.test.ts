import { describe, expect, test } from 'vitest'
import { createMemoryHistory } from 'speedy-router-history'
import { createRootRoute, createRoute } from '../src/route'
import { createRouter } from '../src/router'

describe('blocked commitLocation settles', () => {
  test('await navigate settles when a blocker denies the commit', async () => {
    ;(globalThis as any).document = {}
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
    // Match app usage: history subscribers drive loads after successful commits.
    const unsub = history.subscribe(() => {
      void router.load()
    })
    history.block({ blockerFn: () => true })

    const result = await Promise.race([
      router.navigate({ to: '/posts' } as any).then(
        () => 'resolved' as const,
        () => 'rejected' as const,
      ),
      new Promise<'timeout'>((resolve) => {
        setTimeout(() => resolve('timeout'), 250)
      }),
    ])

    expect(result).not.toBe('timeout')
    expect(history.location.pathname).toBe('/about')
    unsub()
    delete (globalThis as any).document
  })
})
