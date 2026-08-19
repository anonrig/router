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
  it('requires affixed parameters to consume a value', () => {
    const root = createRootRoute()
    const normal = createRoute({
      getParentRoute: () => root,
      path: '/pre{$id}suf',
    })
    const overlapping = createRoute({
      getParentRoute: () => root,
      path: '/ab{$id}bc',
    })
    root.addChildren([normal, overlapping])
    const tree = processRouteTree(root as any)

    expect(findRouteMatch(tree, '/presuf')).toBeNull()
    expect(findRouteMatch(tree, '/abc')).toBeNull()
    expect(findRouteMatch(tree, '/preXsuf')?.at(-1)?.params.id).toBe('X')
    expect(findRouteMatch(tree, '/abXbc')?.at(-1)?.params.id).toBe('X')
  })

  it('prefers earlier static segments between optional routes', () => {
    const root = createRootRoute()
    const lateStatic = createRoute({
      getParentRoute: () => root,
      path: '/{-$a}/b',
    })
    const earlyStatic = createRoute({
      getParentRoute: () => root,
      path: '/a/{-$b}',
    })
    root.addChildren([lateStatic, earlyStatic])

    const match = findRouteMatch(processRouteTree(root as any), '/a/b')

    expect(match?.at(-1)?.route.id).toBe('/a/{-$b}')
  })

  it('rejects malformed percent encoding in dynamic segments', () => {
    const root = createRootRoute()
    const dynamic = createRoute({
      getParentRoute: () => root,
      path: '/$id',
    })
    root.addChildren([dynamic])
    const tree = processRouteTree(root as any)

    expect(findRouteMatch(tree, '/%')).toBeNull()
    expect(findRouteMatch(tree, '/%E0%A4%A')).toBeNull()
  })

  it('still matches a static path that contains a literal percent', () => {
    const root = createRootRoute()
    const sale = createRoute({
      getParentRoute: () => root,
      path: '/100%off',
    })
    root.addChildren([sale])
    const tree = processRouteTree(root as any)

    expect(findRouteMatch(tree, '/100%off')?.at(-1)?.route.id).toBe('/100%off')
  })

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

  it('honors caseSensitive on individual static routes', () => {
    const root = createRootRoute()
    const strict = createRoute({
      getParentRoute: () => root,
      path: '/Exact',
      caseSensitive: true,
    })
    const loose = createRoute({
      getParentRoute: () => root,
      path: '/loose',
      caseSensitive: false,
    })
    root.addChildren([strict, loose])
    const tree = processRouteTree(root as any)

    expect(findRouteMatch(tree, '/Exact')?.at(-1)?.route.id).toBe('/Exact')
    expect(findRouteMatch(tree, '/exact')).toBeNull()
    expect(findRouteMatch(tree, '/LOOSE')?.at(-1)?.route.id).toBe('/loose')
  })

  it('prefers an exact sensitive route over an insensitive sibling', () => {
    const root = createRootRoute()
    const strict = createRoute({
      getParentRoute: () => root,
      path: '/FOO',
      caseSensitive: true,
    })
    const loose = createRoute({
      getParentRoute: () => root,
      path: '/foo',
      caseSensitive: false,
    })
    root.addChildren([strict, loose])
    const tree = processRouteTree(root as any)

    expect(findRouteMatch(tree, '/FOO')?.at(-1)?.route.id).toBe('/FOO')
    expect(findRouteMatch(tree, '/Foo')?.at(-1)?.route.id).toBe('/foo')
    expect(findRouteMatch(tree, '/foo')?.at(-1)?.route.id).toBe('/foo')
  })

  it('matches static routes when the whole tree is case sensitive', () => {
    const root = createRootRoute()
    const posts = createRoute({ getParentRoute: () => root, path: '/Posts' })
    const detail = createRoute({ getParentRoute: () => posts, path: '/Detail' })
    posts.addChildren([detail])
    root.addChildren([posts])
    const tree = processRouteTree(root as any, true)

    expect(findRouteMatch(tree, '/Posts', true)?.map((m) => m.route.id)).toEqual([
      '__root__',
      '/Posts',
    ])
    expect(findRouteMatch(tree, '/Posts/Detail', true)?.at(-1)?.route.id).toBe('/Posts/Detail')
    expect(findRouteMatch(tree, '/posts', true)).toBeNull()
    expect(findRouteMatch(tree, '/Posts/detail', true)).toBeNull()
  })

  it('keeps sensitive and insensitive siblings out of each other match chain', () => {
    const root = createRootRoute()
    const strict = createRoute({
      getParentRoute: () => root,
      path: '/FOO',
      caseSensitive: true,
    })
    const strictChild = createRoute({
      getParentRoute: () => strict,
      path: '/bar',
      caseSensitive: true,
    })
    const loose = createRoute({
      getParentRoute: () => root,
      path: '/foo',
      caseSensitive: false,
    })
    const looseChild = createRoute({
      getParentRoute: () => loose,
      path: '/baz',
      caseSensitive: false,
    })
    strict.addChildren([strictChild])
    loose.addChildren([looseChild])
    root.addChildren([strict, loose])
    const tree = processRouteTree(root as any)

    expect(findRouteMatch(tree, '/FOO/baz')?.map((m) => m.route.id)).toEqual([
      '__root__',
      '/foo',
      '/foo/baz',
    ])
    expect(findRouteMatch(tree, '/FOO/bar')?.map((m) => m.route.id)).toEqual([
      '__root__',
      '/FOO',
      '/FOO/bar',
    ])
    expect(findRouteMatch(tree, '/Foo/baz')?.map((m) => m.route.id)).toEqual([
      '__root__',
      '/foo',
      '/foo/baz',
    ])
    expect(findRouteMatch(tree, '/Foo/bar')).toBeNull()
  })

  it('lets a route opt out of a case sensitive tree default', () => {
    const root = createRootRoute()
    const strict = createRoute({ getParentRoute: () => root, path: '/Strict' })
    const loose = createRoute({
      getParentRoute: () => root,
      path: '/loose',
      caseSensitive: false,
    })
    const looseChild = createRoute({
      getParentRoute: () => loose,
      path: '/Deep',
      caseSensitive: false,
    })
    loose.addChildren([looseChild])
    root.addChildren([strict, loose])
    const tree = processRouteTree(root as any, true)

    expect(findRouteMatch(tree, '/Strict', true)?.at(-1)?.route.id).toBe('/Strict')
    expect(findRouteMatch(tree, '/strict', true)).toBeNull()
    expect(findRouteMatch(tree, '/LOOSE', true)?.at(-1)?.route.id).toBe('/loose')
    expect(findRouteMatch(tree, '/Loose/DEEP', true)?.at(-1)?.route.id).toBe('/loose/Deep')
  })

  it('honors route-level case sensitivity for dynamic affixes', () => {
    const root = createRootRoute()
    const dynamic = createRoute({
      getParentRoute: () => root,
      path: '/pre{$id}suf',
      caseSensitive: true,
    })
    root.addChildren([dynamic])
    const tree = processRouteTree(root as any)

    expect(findRouteMatch(tree, '/preXsuf')?.at(-1)?.route.id).toBe('/pre{$id}suf')
    expect(findRouteMatch(tree, '/PREXsUF')).toBeNull()
  })

  it('keeps a case-sensitive dynamic parent in the match chain of its children', () => {
    const root = createRootRoute()
    const parent = createRoute({
      getParentRoute: () => root,
      path: '/pre{$id}suf',
      caseSensitive: true,
    })
    const index = createRoute({ getParentRoute: () => parent, path: '/' })
    const child = createRoute({ getParentRoute: () => parent, path: '/edit' })
    const layout = createRoute({ getParentRoute: () => parent, id: '_layout' })
    const layoutChild = createRoute({ getParentRoute: () => layout, path: '/settings' })
    root.addChildren([parent.addChildren([index, child, layout.addChildren([layoutChild])])])
    const tree = processRouteTree(root as any)

    expect(findRouteMatch(tree, '/preXsuf/edit')?.map((m) => m.route.id)).toEqual([
      '__root__',
      '/pre{$id}suf',
      '/pre{$id}suf/edit',
    ])
    expect(findRouteMatch(tree, '/preXsuf/edit')?.at(-1)?.params).toEqual({ id: 'X' })
    expect(findRouteMatch(tree, '/preXsuf')?.map((m) => m.route.id)).toEqual([
      '__root__',
      '/pre{$id}suf',
      '/pre{$id}suf/',
    ])
    expect(findRouteMatch(tree, '/preXsuf/settings')?.map((m) => m.route.id)).toEqual([
      '__root__',
      '/pre{$id}suf',
      '/pre{$id}suf/_layout',
      '/pre{$id}suf/_layout/settings',
    ])
  })

  it('does not let children widen a case-sensitive dynamic parent', () => {
    const root = createRootRoute()
    const parent = createRoute({
      getParentRoute: () => root,
      path: '/pre{$id}suf',
      caseSensitive: true,
    })
    const child = createRoute({ getParentRoute: () => parent, path: '/edit' })
    root.addChildren([parent.addChildren([child])])
    const tree = processRouteTree(root as any)

    expect(findRouteMatch(tree, '/PREXSUF/edit')).toBeNull()
    expect(findRouteMatch(tree, '/PREXSUF')).toBeNull()
  })

  it('keeps a case-sensitive optional dynamic parent in the match chain of its children', () => {
    const root = createRootRoute()
    const parent = createRoute({
      getParentRoute: () => root,
      path: '/pre{-$id}suf',
      caseSensitive: true,
    })
    const child = createRoute({ getParentRoute: () => parent, path: '/edit' })
    root.addChildren([parent.addChildren([child])])
    const tree = processRouteTree(root as any)

    expect(findRouteMatch(tree, '/preXsuf/edit')?.map((m) => m.route.id)).toEqual([
      '__root__',
      '/pre{-$id}suf',
      '/pre{-$id}suf/edit',
    ])
    expect(findRouteMatch(tree, '/PREXSUF/edit')).toBeNull()
  })

  it('keeps a case-insensitive dynamic parent usable by a case-sensitive child', () => {
    const root = createRootRoute()
    const parent = createRoute({ getParentRoute: () => root, path: '/pre{$id}suf' })
    const child = createRoute({
      getParentRoute: () => parent,
      path: '/pre{$sub}suf',
      caseSensitive: true,
    })
    root.addChildren([parent.addChildren([child])])
    const tree = processRouteTree(root as any)

    const matches = findRouteMatch(tree, '/PREXSUF/preYsuf')
    expect(matches?.map((m) => m.route.id)).toEqual([
      '__root__',
      '/pre{$id}suf',
      '/pre{$id}suf/pre{$sub}suf',
    ])
    expect(matches?.at(-1)?.params).toEqual({ id: 'X', sub: 'Y' })
    expect(findRouteMatch(tree, '/PREXSUF/PREYSUF')).toBeNull()
  })

  it('does not include optional sibling routes in the selected chain', () => {
    const root = createRootRoute()
    const single = createRoute({
      getParentRoute: () => root,
      path: '/{-$id}',
    })
    const pair = createRoute({
      getParentRoute: () => root,
      path: '/{-$a}/{-$b}',
    })
    root.addChildren([single, pair])

    const matches = findRouteMatch(processRouteTree(root as any), '/')

    expect(matches?.map((match) => match.route.id)).toEqual(['__root__', '/{-$a}/{-$b}'])
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
