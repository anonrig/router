import { expect, test } from 'vitest'
import { createMemoryHistory } from 'speedy-router-history'
import { createRootRoute, createRoute } from '../src/route'
import { createRouter } from '../src/router'

test('updating caseSensitive rebuilds the matcher', () => {
  const root = createRootRoute()
  const users = createRoute({
    getParentRoute: () => root,
    path: '/Users/$id',
  })
  root.addChildren([users])
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory(),
    caseSensitive: false,
  })

  router.update({ caseSensitive: true })

  expect(router.getMatchedRoutes('/Users/alice')[2]?.id).toBe('/Users/$id')
  expect(router.getMatchedRoutes('/users/alice')[2]).toBeUndefined()
})
