import { describe, expect, it } from 'vitest'
import { findRouteMatch, processRouteTree } from '../src/match'
import { createRootRoute, createRoute } from '../src/route'

function fileRoute(id: string, path: string | undefined, parent: () => any) {
  const route = createRoute({ getParentRoute: parent })
  route.update(
    (path === undefined
      ? { id, getParentRoute: parent }
      : { id, path, getParentRoute: parent }) as any,
  )
  return route
}

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
  it('prefers required parameters over optional affixed parameters', () => {
    const root = createRootRoute()
    const required = createRoute({
      getParentRoute: () => root,
      path: '/$value',
    })
    const optional = createRoute({
      getParentRoute: () => root,
      path: '/pre{-$value}suf',
    })
    root.addChildren([required, optional])

    const matches = findRouteMatch(processRouteTree(root as any), '/preXsuf')

    expect(matches?.at(-1)?.route.id).toBe('/$value')
  })

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

  it('reprocesses nested children added after the tree was cached', () => {
    const root = createRootRoute()
    const parent = createRoute({ getParentRoute: () => root, path: '/parent' })
    root.addChildren([parent])
    processRouteTree(root as any)

    const child = createRoute({ getParentRoute: () => parent, path: '/child' })
    parent.addChildren([child])

    const processed = processRouteTree(root as any)
    expect(findRouteMatch(processed, '/parent/child')?.at(-1)?.route.id).toBe('/parent/child')
  })

  it('matches params', () => {
    const processed = tree()
    const matches = findRouteMatch(processed, '/posts/tkdodo')
    expect(matches?.at(-1)?.params).toEqual({ slug: 'tkdodo' })
    expect(matches?.map((m) => m.route.id)).toEqual(['__root__', '/posts', '/posts/$slug'])
  })

  it('matches parameter affixes case-insensitively by default', () => {
    const root = createRootRoute()
    const child = createRoute({ getParentRoute: () => root, path: '/pre{$id}suf' })
    root.addChildren([child])

    const matches = findRouteMatch(processRouteTree(root as any), '/PRExSUF')

    expect(matches?.at(-1)?.params).toEqual({ id: 'x' })
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

  it('matches parenthesized route groups without consuming URL segments', () => {
    const root = createRootRoute()
    const auth = fileRoute('/(auth)', undefined, () => root)
    const login = fileRoute('/login', '/login', () => auth)
    const settings = fileRoute('/(app)/(dashboard)/settings', '/settings', () => root)
    root.addChildren([auth.addChildren([login]), settings])
    const processed = processRouteTree(root as any)
    expect(findRouteMatch(processed, '/login')?.map((match) => match.route.id)).toEqual([
      '__root__',
      '/(auth)',
      '/(auth)/login',
    ])
    expect(findRouteMatch(processed, '/settings')?.map((match) => match.route.id)).toEqual([
      '__root__',
      '/(app)/(dashboard)/settings',
    ])
  })

  it('keeps sibling group layouts that share a URL prefix from overwriting each other', () => {
    const root = createRootRoute()
    // No `dashboard.tsx` parent: both group layouts keep public path `/dashboard`.
    const admin = fileRoute('/dashboard/(admin)', '/dashboard', () => root)
    const users = fileRoute('/users', '/users', () => admin)
    const viewer = fileRoute('/dashboard/(viewer)', '/dashboard', () => root)
    const stats = fileRoute('/stats', '/stats', () => viewer)
    root.addChildren([admin.addChildren([users]), viewer.addChildren([stats])])
    const processed = processRouteTree(root as any)
    expect(findRouteMatch(processed, '/dashboard/users')?.map((match) => match.route.id)).toEqual([
      '__root__',
      '/dashboard/(admin)',
      '/dashboard/(admin)/users',
    ])
    expect(findRouteMatch(processed, '/dashboard/stats')?.map((match) => match.route.id)).toEqual([
      '__root__',
      '/dashboard/(viewer)',
      '/dashboard/(viewer)/stats',
    ])
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

  it('keeps a flattened trailing-slash index instead of a pathful underscore sibling', () => {
    const root = createRootRoute()
    const postIndex = fileRoute('/$user/post/$postId/', '/$user/post/$postId/', () => root)
    const stats = fileRoute('/$user/post/$postId/_stats', '/$user/post/$postId', () => root)
    const likes = fileRoute('/likes', '/likes', () => stats)
    root.addChildren([stats.addChildren([likes]), postIndex])
    const processed = processRouteTree(root as any)

    expect(findRouteMatch(processed, '/alice/post/1')?.map((match) => match.route.id)).toEqual([
      '__root__',
      '/$user/post/$postId/',
    ])
    expect(
      findRouteMatch(processed, '/alice/post/1/likes')?.map((match) => match.route.id),
    ).toEqual(['__root__', '/$user/post/$postId/_stats', '/$user/post/$postId/_stats/likes'])
  })

  it('keeps a file-route profile index instead of a sibling auth layout', () => {
    const root = createRootRoute()
    const profile = fileRoute('/$username/_profile', '/$username', () => root)
    const profileIndex = fileRoute('/', '/', () => profile)
    const followers = fileRoute('/$username/_followers', '/$username', () => root)
    const followersList = fileRoute('/followers', '/followers', () => followers)
    root.addChildren([profile.addChildren([profileIndex]), followers.addChildren([followersList])])
    const processed = processRouteTree(root as any)
    expect(findRouteMatch(processed, '/jack')?.map((match) => match.route.id)).toEqual([
      '__root__',
      '/$username/_profile',
      '/$username/_profile/',
    ])
    expect(findRouteMatch(processed, '/jack/followers')?.map((match) => match.route.id)).toEqual([
      '__root__',
      '/$username/_followers',
      '/$username/_followers/followers',
    ])
  })

  it('does not treat a real underscore URL segment as a pathless layout', () => {
    const root = createRootRoute()
    const hidden = createRoute({ getParentRoute: () => root, path: '/_hidden' })
    root.addChildren([hidden])
    const processed = processRouteTree(root as any)
    expect(findRouteMatch(processed, '/_hidden')?.map((match) => match.route.id)).toEqual([
      '__root__',
      '/_hidden',
    ])
  })
})
