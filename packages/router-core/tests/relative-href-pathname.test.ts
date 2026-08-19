import { describe, expect, test } from 'vitest'
import { createMemoryHistory } from 'speedy-router-history'
import { createRootRoute, createRoute } from '../src/route'
import { createRouter } from '../src/router'

function setup(initialEntry: string) {
  const root = createRootRoute({
    validateSearch: (search: Record<string, unknown>) => search,
  } as any)
  const posts = createRoute({
    getParentRoute: () => root,
    path: '/posts',
    loader: () => 'posts',
  })
  const about = createRoute({
    getParentRoute: () => root,
    path: '/about',
    loader: () => 'about',
  })
  root.addChildren([posts, about] as any)
  return createRouter({
    routeTree: root as any,
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
    isServer: true,
  })
}

describe('relative search/hash href navigation', () => {
  test('navigate("?q=1") keeps the current path and hash', async () => {
    const router = setup('/posts#top')
    await router.load()

    await router.navigate({ href: '?q=1' } as any)

    expect(router.state.location.pathname).toBe('/posts')
    expect(router.state.location.search).toEqual({ q: 1 })
    expect(router.state.location.hash).toBe('top')
  })

  test('navigate("#section") keeps the current path and search', async () => {
    const router = setup('/about?q=1')
    await router.load()

    await router.navigate({ href: '#section' } as any)

    expect(router.state.location.pathname).toBe('/about')
    expect(router.state.location.search).toEqual({ q: 1 })
    expect(router.state.location.hash).toBe('section')
  })

  test('a search-only href with its own fragment keeps that fragment', async () => {
    const router = setup('/posts?old=1#top')
    await router.load()

    const built = router.buildLocation({ href: '?q=1#frag' } as any)
    expect(built.pathname).toBe('/posts')
    expect(built.search).toEqual({ q: 1 })
    expect(built.hash).toBe('frag')

    await router.navigate({ href: '?q=1#frag' } as any)
    expect(router.state.location.pathname).toBe('/posts')
    expect(router.state.location.search).toEqual({ q: 1 })
    expect(router.state.location.hash).toBe('frag')
  })

  test('buildLocation resolves relative hrefs against the current location', async () => {
    const router = setup('/posts?old=1#top')
    await router.load()

    const searchOnly = router.buildLocation({ href: '?q=1' } as any)
    expect(searchOnly.pathname).toBe('/posts')
    expect(searchOnly.search).toEqual({ q: 1 })
    expect(searchOnly.hash).toBe('top')

    const hashOnly = router.buildLocation({ href: '#section' } as any)
    expect(hashOnly.pathname).toBe('/posts')
    expect(hashOnly.search).toEqual({ old: 1 })
    expect(hashOnly.hash).toBe('section')
  })

  test('dot-relative hrefs resolve against the current path, not the origin', async () => {
    const router = setup('/posts')
    await router.load()

    expect(router.buildLocation({ href: './comments' } as any).pathname).toBe('/posts/comments')
    expect(router.buildLocation({ href: '../about' } as any).pathname).toBe('/about')

    await router.navigate({ href: './comments' } as any)
    expect(router.state.location.pathname).toBe('/posts/comments')

    await router.navigate({ href: '../about' } as any)
    expect(router.state.location.pathname).toBe('/about')
  })
})
