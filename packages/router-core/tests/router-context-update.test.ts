import { expect, test } from 'vitest'
import { createMemoryHistory } from 'speedy-router-history'
import { createRootRoute, createRoute } from '../src/route'
import { createRouter } from '../src/router'

test('cached warm matches use updated router context', async () => {
  const root = createRootRoute()
  const first = createRoute({ getParentRoute: () => root, path: '/first' })
  const second = createRoute({ getParentRoute: () => root, path: '/second' })
  root.addChildren([first, second])
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory(),
    isServer: true,
    context: { version: 1 },
  })

  await router.navigate({ href: '/first' } as any)
  router.update({ context: { version: 2 } })
  await router.navigate({ href: '/second' } as any)
  await router.navigate({ href: '/first' } as any)

  expect(router.state.matches.at(-1)?.context.version).toBe(2)
})
