import { expect, test } from 'vitest'
import { createMemoryHistory } from 'speedy-router-history'
import { createRootRoute, createRoute } from '../src/route'
import { createRouter } from '../src/router'

test('hash-only location updates preserve validated search', () => {
  const root = createRootRoute()
  const page = createRoute({
    getParentRoute: () => root,
    path: '/page',
    validateSearch: (search: any) => ({ query: search.query }),
  })
  root.addChildren([page])
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ['/page?query=keep'] }),
    isServer: true,
  })

  expect(router.buildLocation({ hash: 'next' } as any).href).toBe('/page?query=keep#next')
})
