import { describe, expect, it } from 'vitest'
import {
  findRouteMatch,
  findRouteMatchFromTree,
  findRouteMatchFromTreeOrFuzzy,
  matchHasFuzzyLeftover,
  processRouteTree,
} from '../src/match'
import { createRootRoute, createRoute } from '../src/route'

function tree() {
  const root = createRootRoute()
  const index = createRoute({ getParentRoute: () => root, path: '/' })
  const posts = createRoute({ getParentRoute: () => root, path: '/posts' })
  const post = createRoute({ getParentRoute: () => posts, path: '/$slug' })
  const layoutParent = createRoute({ getParentRoute: () => root, path: '/u' })
  const layout = createRoute({ getParentRoute: () => layoutParent, id: '_layout' })
  const user = createRoute({ getParentRoute: () => layout, path: '$username' })
  root.addChildren([
    index,
    posts.addChildren([post]),
    layoutParent.addChildren([layout.addChildren([user])]),
  ])
  return processRouteTree(root as any)
}

describe('matcher', () => {
  it('matches the index route', () => {
    const processed = tree()
    const matches = findRouteMatch(processed, '/')
    expect(matches?.map((m) => m.route.id)).toEqual(['__root__', '/'])
  })

  it('matches a static nested route', () => {
    const processed = tree()
    const matches = findRouteMatch(processed, '/posts')
    expect(matches?.map((m) => m.route.id)).toEqual(['__root__', '/posts'])
  })

  it('matches params', () => {
    const processed = tree()
    const matches = findRouteMatch(processed, '/posts/tkdodo')
    expect(matches?.at(-1)?.params).toEqual({ slug: 'tkdodo' })
    expect(matches?.map((m) => m.route.id)).toEqual(['__root__', '/posts', '/posts/$slug'])
  })

  it('matches pathless layouts', () => {
    const processed = tree()
    const matches = findRouteMatch(processed, '/u/anonrig')
    expect(matches?.map((m) => m.route.id)).toEqual([
      '__root__',
      '/u',
      '/u/_layout',
      '/u/_layout/$username',
    ])
    expect(matches?.at(-1)?.params).toEqual({ username: 'anonrig' })
  })

  it('returns null for unknown paths', () => {
    const processed = tree()
    expect(findRouteMatch(processed, '/missing')).toBeNull()
  })

  it('matches a static route that has a param child', () => {
    const processed = tree()
    const matches = findRouteMatch(processed, '/posts')
    expect(matches?.map((m) => m.route.id)).toEqual(['__root__', '/posts'])
  })

  it('matches static paths case-insensitively', () => {
    const processed = tree()
    const matches = findRouteMatch(processed, '/POSTS')
    expect(matches?.map((m) => m.route.id)).toEqual(['__root__', '/posts'])
  })

  it('does not prefer a static sibling over an optional route that can skip', () => {
    const root = createRootRoute()
    const localized = createRoute({
      getParentRoute: () => root,
      path: '/{-$lang}/home',
      params: {
        parse: (params: { lang?: string }) => {
          if (params.lang && params.lang !== 'en') return false
          return params
        },
      },
    })
    const home = createRoute({ getParentRoute: () => root, path: '/home' })
    root.addChildren([localized, home])
    const processed = processRouteTree(root as any)
    expect(findRouteMatch(processed, '/home')?.map((m) => m.route.id)).toEqual([
      '__root__',
      '/{-$lang}/home',
    ])
    expect(findRouteMatch(processed, '/en/home')?.at(-1)?.route.id).toBe('/{-$lang}/home')
  })

  it('matches a static-only tree without entering the dynamic walker', () => {
    const root = createRootRoute()
    const about = createRoute({ getParentRoute: () => root, path: '/about' })
    const docs = createRoute({ getParentRoute: () => about, path: '/docs' })
    root.addChildren([about.addChildren([docs])])
    const processed = processRouteTree(root as any)
    expect(processed.hasDynamic).toBe(false)
    expect(findRouteMatch(processed, '/about/docs')?.map((m) => m.route.id)).toEqual([
      '__root__',
      '/about',
      '/about/docs',
    ])
    expect(findRouteMatch(processed, '/missing')).toBeNull()
  })
})

describe('findRouteMatchFromTreeOrFuzzy', () => {
  function idsOf(match: ReturnType<typeof findRouteMatchFromTreeOrFuzzy>) {
    return match?.map((item) => item.route.id)
  }

  function exactThenFuzzy(processed: ReturnType<typeof processRouteTree>, pathname: string) {
    return (
      findRouteMatchFromTree(processed, pathname) ??
      findRouteMatchFromTree(processed, pathname, false, true)
    )
  }

  it('matches exact paths the same as findRouteMatchFromTree', () => {
    const processed = tree()
    for (const pathname of ['/', '/posts', '/posts/tkdodo', '/u/anonrig']) {
      expect(idsOf(findRouteMatchFromTreeOrFuzzy(processed, pathname))).toEqual(
        idsOf(findRouteMatchFromTree(processed, pathname)),
      )
    }
  })

  it('uses one walk for fuzzy misses and matches the two-call result', () => {
    for (const pathname of ['/missing', '/posts/tkdodo/extra', '/u/anonrig/settings']) {
      const combined = findRouteMatchFromTreeOrFuzzy(tree(), pathname)
      const legacy = exactThenFuzzy(tree(), pathname)
      expect(idsOf(combined)).toEqual(idsOf(legacy))
      expect(combined?.at(-1)?.rawParams).toEqual(legacy?.at(-1)?.rawParams)
      expect(matchHasFuzzyLeftover(combined)).toBe(matchHasFuzzyLeftover(legacy))
    }
  })
})
