import { describe, expect, it } from 'vitest'
import { findRouteMatch, processRouteTree } from '../src/match'
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
})
