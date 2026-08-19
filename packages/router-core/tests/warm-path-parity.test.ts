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

  test('async loaders retain the context for their own route when children settle first', async () => {
    let resolveRoot!: () => void
    let resolvePosts!: () => void
    const router = createApp({
      root: {
        context: () => ({ scope: 'root' }),
        loader: () =>
          new Promise<void>((resolve) => {
            resolveRoot = resolve
          }),
      },
      posts: {
        context: ({ context }: { context: { scope: string } }) => ({
          scope: `${context.scope}:posts`,
        }),
        loader: () =>
          new Promise<void>((resolve) => {
            resolvePosts = resolve
          }),
      },
    })

    const navigation = router.navigate({ href: '/posts' } as any)
    resolvePosts()
    await Promise.resolve()
    resolveRoot()
    await navigation

    const [root, posts] = router.state.matches
    expect(root?.context.scope).toBe('root')
    expect(posts?.context.scope).toBe('root:posts')
    expect(root?.context).not.toBe(posts?.context)
  })

  test('parentMatchPromise resolves after parent loader data is written', async () => {
    const started: string[] = []
    let resolveRoot!: (value: string) => void
    let parentData: unknown
    const router = createApp({
      root: {
        loader: () => {
          started.push('root')
          return new Promise<string>((resolve) => {
            resolveRoot = resolve
          })
        },
      },
      posts: {
        loader: async (ctx: { parentMatchPromise?: Promise<any> }) => {
          started.push('posts')
          const parent = await ctx.parentMatchPromise
          parentData = parent?.loaderData
          return 'posts'
        },
      },
    })

    const navigation = router.navigate({ href: '/posts' } as any)
    expect(started).toEqual(['root', 'posts'])

    resolveRoot('root-data')
    await navigation

    expect(parentData).toBe('root-data')
    expect(router.state.matches.at(-1)?.loaderData).toBe('posts')
  })

  test('a child context throw cancels earlier in-flight warm loaders', async () => {
    const boom = new Error('context-boom')
    let resolveRoot!: (value: string) => void
    let rootSignal!: AbortSignal
    const router = createApp({
      root: {
        loader: ({ abortController }: { abortController: AbortController }) => {
          rootSignal = abortController.signal
          return new Promise<string>((resolve) => {
            resolveRoot = resolve
          })
        },
      },
      posts: {
        context: () => {
          throw boom
        },
        loader: () => 'posts',
      },
    })

    await expect(router.navigate({ href: '/posts' } as any)).resolves.toBeUndefined()

    const [root, posts] = router.state.matches
    expect(rootSignal.aborted).toBe(true)
    expect(root?.isFetching).toBe(false)
    expect(posts?.isFetching).toBe(false)
    expect(posts?.status).toBe('error')
    expect(posts?.error).toBe(boom)

    resolveRoot('late-root-data')
    await Promise.resolve()
    await Promise.resolve()
    expect(root?.loaderData).toBeUndefined()
    expect(root?.isFetching).toBe(false)
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

  test('a child that settles first is not kept when the parent loader later fails', async () => {
    const boom = new Error('root-boom')
    let rootCalls = 0
    let postsCalls = 0
    let rejectRoot!: (error: unknown) => void
    let resolvePosts!: (value: string) => void
    const router = createApp({
      root: {
        loader: () => {
          rootCalls++
          if (rootCalls > 1) return `root-${rootCalls}`
          return new Promise<string>((_resolve, reject) => {
            rejectRoot = reject
          })
        },
      },
      posts: {
        // Infinity keeps a successful match reusable, so a child published too
        // early would let the next warm navigation skip its loader.
        staleTime: Infinity,
        loader: () => {
          postsCalls++
          if (postsCalls > 1) return `posts-${postsCalls}`
          return new Promise<string>((resolve) => {
            resolvePosts = resolve
          })
        },
      },
    })

    const navigation = router.navigate({ href: '/posts' } as any)
    resolvePosts('posts-1')
    await Promise.resolve()
    rejectRoot(boom)
    await expect(navigation).resolves.toBeUndefined()

    const [root, posts] = router.state.matches
    expect(postsCalls).toBe(1)
    expect(root?.status).toBe('error')
    expect(root?.error).toBe(boom)
    expect(posts?.status).toBe('pending')
    expect(posts?.loaderData).toBeUndefined()
    expect(posts?.isFetching).toBe(false)
    expect(router.getMatch(posts!.id)?.status).not.toBe('success')

    await router.navigate({ href: '/about' } as any)
    await router.navigate({ href: '/posts' } as any)

    expect(postsCalls).toBe(2)
    expect(router.state.matches.at(-1)?.loaderData).toBe('posts-2')
  })
})
