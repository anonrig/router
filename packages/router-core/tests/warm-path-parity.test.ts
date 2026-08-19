import { describe, expect, test } from 'vitest'
import { createMemoryHistory } from 'speedy-router-history'
import { createRootRoute, createRoute } from '../src/route'
import { createRouter } from '../src/router'

function createApp(opts: {
  root?: Record<string, any>
  posts?: Record<string, any>
  initial?: string
}) {
  const root = createRootRoute(opts.root as any)
  const about = createRoute({ getParentRoute: () => root, path: '/about' })
  const posts = createRoute({
    getParentRoute: () => root,
    path: '/posts',
    ...(opts.posts as any),
  })
  root.addChildren([about, posts])
  return createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: [opts.initial ?? '/about'] }),
    isServer: true,
  })
}

describe('warm-path TanStack behavior parity', () => {
  test('starts matched async loaders in parallel', async () => {
    const started: string[] = []
    let resolveRoot!: () => void
    let resolvePosts!: () => void
    const router = createApp({
      root: {
        loader: () => {
          started.push('root')
          return new Promise<void>((resolve) => {
            resolveRoot = resolve
          })
        },
      },
      posts: {
        loader: () => {
          started.push('posts')
          return new Promise<void>((resolve) => {
            resolvePosts = resolve
          })
        },
      },
    })

    const navigation = router.navigate({ href: '/posts' } as any)
    await Promise.resolve()

    expect(started).toEqual(['root', 'posts'])

    let settled = false
    void navigation.then(() => {
      settled = true
    })
    resolvePosts()
    await Promise.resolve()
    expect(settled).toBe(false)

    resolveRoot()
    await navigation
  })

  test('loaderDeps changes reload the loader and store deps on the match', async () => {
    const seen: unknown[] = []
    const router = createApp({
      posts: {
        loaderDeps: ({ search }: { search: { mode?: string } }) => ({ mode: search.mode }),
        loader: (ctx: { deps: { mode?: string } }) => {
          seen.push(ctx.deps)
          return ctx.deps
        },
      },
    })

    await router.navigate({ href: '/posts?mode=a' } as any)
    await router.navigate({ href: '/posts?mode=b' } as any)

    const match = router.state.matches.at(-1)
    expect(seen).toEqual([{ mode: 'a' }, { mode: 'b' }])
    expect(match?.loaderDeps).toEqual({ mode: 'b' })
    expect(match?.loaderData).toEqual({ mode: 'b' })
    expect(match?.id).toContain('{"mode":"b"}')
  })

  test('nested loaders receive distinct mutable context objects', async () => {
    const refs: { who: string; ctx: Record<string, any> }[] = []
    const router = createApp({
      root: {
        loader: (ctx: { context: Record<string, any> }) => {
          refs.push({ who: 'root', ctx: ctx.context })
          ctx.context.fromRoot = true
          return 'root'
        },
      },
      posts: {
        loader: (ctx: { context: Record<string, any> }) => {
          refs.push({ who: 'posts', ctx: ctx.context })
          return 'posts'
        },
      },
    })

    await router.navigate({ href: '/posts' } as any)

    expect(refs.map((entry) => entry.who)).toEqual(['root', 'posts'])
    expect(refs[0]!.ctx).not.toBe(refs[1]!.ctx)
    expect(Object.isFrozen(refs[0]!.ctx)).toBe(false)
    expect(refs[0]!.ctx.fromRoot).toBe(true)
  })

  test('a synchronous loader throw runs once, calls onError, and commits an error match', async () => {
    let calls = 0
    const onError = { n: 0, err: null as unknown }
    const boom = new Error('sync-boom')
    const router = createApp({
      posts: {
        loader: () => {
          calls++
          throw boom
        },
        onError: (err: unknown) => {
          onError.n++
          onError.err = err
        },
      },
    })

    await expect(router.navigate({ href: '/posts' } as any)).resolves.toBeUndefined()

    const match = router.state.matches.at(-1)
    expect(calls).toBe(1)
    expect(onError.n).toBe(1)
    expect(onError.err).toBe(boom)
    expect(match?.status).toBe('error')
    expect(match?.error).toBe(boom)
  })

  test('additionalContext is passed through to warm loaders', async () => {
    const root = createRootRoute()
    const posts = createRoute({
      getParentRoute: () => root,
      path: '/posts',
      loader: (ctx: { extra?: string }) => ctx.extra,
    })
    root.addChildren([posts])
    const router = createRouter({
      routeTree: root,
      history: createMemoryHistory({ initialEntries: ['/'] }),
      additionalContext: { extra: 'from-router' },
      isServer: true,
    } as any)

    await router.navigate({ href: '/posts' } as any)
    expect(router.state.matches.at(-1)?.loaderData).toBe('from-router')
  })

  test('warm matches expose TanStack identity fields and parentMatchPromise', async () => {
    const seen: { parent?: { routeId?: string } }[] = []
    const router = createApp({
      root: {
        staticData: { kind: 'root' },
        loader: () => 'root',
      },
      posts: {
        staticData: { kind: 'posts' },
        loader: async (ctx: { parentMatchPromise?: Promise<any> }) => {
          seen.push({
            parent: ctx.parentMatchPromise ? await ctx.parentMatchPromise : undefined,
          })
          return 'posts'
        },
      },
    })

    await router.navigate({ href: '/posts' } as any)

    const match = router.state.matches.at(-1)
    expect(seen).toHaveLength(1)
    expect(seen[0]!.parent?.routeId).toBe(router.state.matches[0]!.routeId)
    expect(match?.index).toBe(1)
    expect(match?.fullPath).toBe('/posts')
    expect(match?.preload).toBe(false)
    expect(match?.staticData).toEqual({ kind: 'posts' })
  })

  test('an async loader rejection calls onError and commits an error match', async () => {
    let calls = 0
    const onError = { n: 0 }
    const boom = new Error('async-boom')
    const router = createApp({
      posts: {
        loader: async () => {
          calls++
          throw boom
        },
        onError: () => {
          onError.n++
        },
      },
    })

    await expect(router.navigate({ href: '/posts' } as any)).resolves.toBeUndefined()

    const match = router.state.matches.at(-1)
    expect(calls).toBe(1)
    expect(onError.n).toBe(1)
    expect(match?.status).toBe('error')
    expect(match?.error).toBe(boom)
  })

  test('cached warm matches keep validateSearch defaults', async () => {
    const router = createApp({
      posts: {
        validateSearch: (search: { page?: number }) => ({ page: search.page ?? 1 }),
        loader: ({ search }: { search: { page?: number } }) => search,
      },
    })

    await router.navigate({ href: '/posts' } as any)
    expect(router.state.matches.at(-1)?.search).toEqual({ page: 1 })

    await router.navigate({ href: '/about' } as any)
    await router.navigate({ href: '/posts' } as any)

    const match = router.state.matches.at(-1)
    expect(match?.search).toEqual({ page: 1 })
    expect(match?.loaderData).toEqual({ page: 1 })
  })

  test('warm _strictSearch only includes validateSearch output', async () => {
    const router = createApp({
      posts: {
        validateSearch: (search: { foo?: string }) => ({ foo: search.foo }),
        loader: () => 'posts',
      },
    })

    await router.navigate({ href: '/posts?foo=hello&extra=1' } as any)

    const [root, posts] = router.state.matches
    expect(root?._strictSearch).toEqual({})
    expect(posts?._strictSearch).toEqual({ foo: 'hello' })
    expect(posts?.search).toMatchObject({ foo: 'hello', extra: 1 })
    expect(root?._strictSearch).not.toBe(posts?._strictSearch)
  })

  test('a parent loader throw still settles concurrently started child matches', async () => {
    const boom = new Error('root-boom')
    let postsCalls = 0
    const router = createApp({
      root: {
        loader: () => {
          throw boom
        },
      },
      posts: {
        loader: () => {
          postsCalls++
          return 'posts'
        },
      },
    })

    await expect(router.navigate({ href: '/posts' } as any)).resolves.toBeUndefined()

    const [root, posts] = router.state.matches
    expect(root?.status).toBe('error')
    expect(root?.error).toBe(boom)
    expect(root?.isFetching).toBe(false)
    expect(postsCalls).toBe(1)
    expect(posts?.isFetching).toBe(false)
  })
})
