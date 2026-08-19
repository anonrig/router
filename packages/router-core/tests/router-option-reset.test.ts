import { describe, expect, test } from 'vitest'
import { createMemoryHistory } from 'speedy-router-history'
import { createRootRoute, createRoute } from '../src/route'
import { createRouter } from '../src/router'

describe('router option resets', () => {
  test('clears a removed pathParamsAllowedCharacters decoder', () => {
    const root = createRootRoute()
    const child = createRoute({ getParentRoute: () => root, path: '/$id' })
    root.addChildren([child])
    const router = createRouter({
      routeTree: root,
      history: createMemoryHistory({ initialEntries: ['/'] }),
      pathParamsAllowedCharacters: [';'],
    })
    expect(router.buildLocation({ to: '/$id', params: { id: 'a;b' } }).pathname).toBe('/a;b')

    router.update({ pathParamsAllowedCharacters: undefined })

    expect(router.buildLocation({ to: '/$id', params: { id: 'a;b' } }).pathname).toBe('/a%3Bb')
  })
})
