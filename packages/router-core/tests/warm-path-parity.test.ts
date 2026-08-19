import { describe, expect, test } from 'vitest'
import { createMemoryHistory } from 'speedy-router-history'
import { redirect } from '../src/redirect'
import { createRootRoute, createRoute } from '../src/route'
import { createRouter, setWarmLoad } from '../src/router'
import { tryWarmLoad } from '../src/warm'

function deferred<T>() {
  let fulfill!: (value: T) => void
  const promise = new Promise<T>((resolve) => {
    fulfill = resolve
  })
  return { promise, resolve: fulfill }
}

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
  test('load invokes the installed warm loader and bumps loadId', async () => {
    const generations: number[] = []
    setWarmLoad((router, location, id) => {
      generations.push(id)
      return tryWarmLoad(router, location, id)
    })
    try {
      const router = createApp({})
      expect(router.loadId).toBeUndefined()
      await router.navigate({ href: '/about' } as any)
      expect(generations.length).toBeGreaterThan(0)
      expect(router.loadId).toBe(generations.at(-1))
      expect(router.state.location.pathname).toBe('/about')
    } finally {
      setWarmLoad(tryWarmLoad)
    }
  })

  test('does not replay a loader that returns a redirect', async () => {
    let calls = 0
    const router = createApp({
      posts: {
        loader: () => {
          calls++
          return redirect({ to: '/about' })
        },
      },
    })

    await router.navigate({ href: '/posts' } as any)

    expect(calls).toBe(1)
    expect(router.state.location.pathname).toBe('/about')
  })

  test.each(['before', 'after'] as const)(
    'an async warm redirect settling %s a newer load cannot replace it',
    async (order) => {
      const staleLoader = deferred<ReturnType<typeof redirect>>()
      const newerLoader = deferred<string>()
      const root = createRootRoute()
      const posts = createRoute({
        getParentRoute: () => root,
        path: '/posts',
        loader: () => staleLoader.promise,
      })
      const newer = createRoute({
        getParentRoute: () => root,
        path: '/newer',
        loader: () => newerLoader.promise,
      })
      const staleTarget = createRoute({
        getParentRoute: () => root,
        path: '/stale-target',
      })
      root.addChildren([posts, newer, staleTarget])
      const router = createRouter({
        routeTree: root,
        history: createMemoryHistory({ initialEntries: ['/'] }),
        isServer: true,
      })

      const staleNavigation = router.navigate({ href: '/posts' } as any)
      const newerNavigation = router.navigate({ href: '/newer' } as any)

      if (order === 'before') {
        staleLoader.resolve(redirect({ to: '/stale-target' }))
        await staleNavigation
        newerLoader.resolve('newer')
        await newerNavigation
      } else {
        newerLoader.resolve('newer')
        await newerNavigation
        staleLoader.resolve(redirect({ to: '/stale-target' }))
        await staleNavigation
      }

      expect(router.state.location.pathname).toBe('/newer')
      expect(router.state.matches.at(-1)?.loaderData).toBe('newer')
    },
  )

  test('stops a warm redirect cycle after 20 hops', async () => {
    let calls = 0
    const reachedLimit = deferred<void>()
    const countCall = () => {
      calls++
      if (calls === 21) reachedLimit.resolve()
    }
    const root = createRootRoute()
    const routeA = createRoute({
      getParentRoute: () => root,
      path: '/a',
      loader: () => {
        countCall()
        return redirect({ to: '/b' })
      },
    })
    const routeB = createRoute({
      getParentRoute: () => root,
      path: '/b',
      loader: () => {
        countCall()
        return redirect({ to: '/a' })
      },
    })
    root.addChildren([routeA, routeB])
    const router = createRouter({
      routeTree: root,
      history: createMemoryHistory({ initialEntries: ['/'] }),
      isServer: true,
    })

    const navigation = router.navigate({ href: '/a' } as any)
    await reachedLimit.promise
    await navigation

    expect(calls).toBe(21)
    expect(router.state.location.pathname).toBe('/a')
    expect(router.state.matches.at(-1)?.status).toBe('error')
    expect(router.state.matches.at(-1)?.error).toEqual(new Error('Too many redirects'))
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

  test('nested loaders start in parallel before either awaits', async () => {
    let parentStarted = 0
    let childStarted = 0
    let childSeenParent = false
    let bothStarted!: () => void
    const started = new Promise<void>((resolve) => {
      bothStarted = resolve
    })
    let releaseParent!: () => void
    let releaseChild!: () => void
    const parentGate = new Promise<void>((resolve) => {
      releaseParent = resolve
    })
    const childGate = new Promise<void>((resolve) => {
      releaseChild = resolve
    })

    const root = createRootRoute()
    const posts = createRoute({
      getParentRoute: () => root,
      path: '/posts',
      loader: async () => {
        parentStarted += 1
        if (parentStarted && childStarted) bothStarted()
        await parentGate
        return { who: 'parent' }
      },
    })
    const post = createRoute({
      getParentRoute: () => posts,
      path: '/$postId',
      loader: async () => {
        childStarted += 1
        childSeenParent = parentStarted > 0
        if (parentStarted && childStarted) bothStarted()
        await childGate
        return { who: 'child' }
      },
    })
    root.addChildren([posts.addChildren([post])])
    const router = createRouter({
      routeTree: root,
      history: createMemoryHistory({ initialEntries: ['/'] }),
      isServer: true,
    })

    const navigation = router.navigate({ href: '/posts/1' } as any)
    await started
    expect(parentStarted).toBe(1)
    expect(childStarted).toBe(1)
    expect(childSeenParent).toBe(true)
    releaseParent()
    releaseChild()
    await navigation

    const child = router.state.matches.at(-1)
    const parent = router.state.matches.find((match) => match.routeId === posts.id)
    expect(parent?.loaderData).toEqual({ who: 'parent' })
    expect(child?.loaderData).toEqual({ who: 'child' })
  })

  test('child loader parentMatchPromise waits for the parent loader result', async () => {
    let childParentMatch: { loaderData?: unknown } | undefined
    let childStarted!: () => void
    const childBegan = new Promise<void>((resolve) => {
      childStarted = resolve
    })
    let releaseParent!: () => void
    const parentGate = new Promise<void>((resolve) => {
      releaseParent = resolve
    })

    const root = createRootRoute()
    const posts = createRoute({
      getParentRoute: () => root,
      path: '/posts',
      loader: async () => {
        await parentGate
        return { who: 'parent' }
      },
    })
    const post = createRoute({
      getParentRoute: () => posts,
      path: '/$postId',
      loader: async ({
        parentMatchPromise,
      }: {
        parentMatchPromise?: Promise<{ loaderData?: unknown }>
      }) => {
        childStarted()
        childParentMatch = await parentMatchPromise
        return { who: 'child' }
      },
    })
    root.addChildren([posts.addChildren([post])])
    const router = createRouter({
      routeTree: root,
      history: createMemoryHistory({ initialEntries: ['/'] }),
      isServer: true,
    })

    const navigation = router.navigate({ href: '/posts/1' } as any)
    await childBegan
    expect(childParentMatch).toBeUndefined()
    releaseParent()
    await navigation
    expect(childParentMatch?.loaderData).toEqual({ who: 'parent' })
    expect(router.state.matches.at(-1)?.loaderData).toEqual({ who: 'child' })
  })

  test('child is discarded when the parent loader fails after both start', async () => {
    let childStarted = 0
    const boom = new Error('parent boom')
    let bothStarted!: () => void
    const started = new Promise<void>((resolve) => {
      bothStarted = resolve
    })
    let releaseParent!: () => void
    const parentGate = new Promise<void>((resolve) => {
      releaseParent = resolve
    })

    const root = createRootRoute()
    const posts = createRoute({
      getParentRoute: () => root,
      path: '/posts',
      loader: async () => {
        if (childStarted) bothStarted()
        await parentGate
        throw boom
      },
    })
    const post = createRoute({
      getParentRoute: () => posts,
      path: '/$postId',
      loader: async () => {
        childStarted += 1
        bothStarted()
        return { who: 'child' }
      },
    })
    root.addChildren([posts.addChildren([post])])
    const router = createRouter({
      routeTree: root,
      history: createMemoryHistory({ initialEntries: ['/'] }),
      isServer: true,
    })

    const navigation = router.navigate({ href: '/posts/1' } as any)
    await started
    releaseParent()
    await expect(navigation).resolves.toBeUndefined()
    expect(childStarted).toBe(1)

    const parent = router.state.matches.find((match) => match.routeId === posts.id)
    const child = router.state.matches.find((match) => match.routeId === post.id)
    expect(parent?.status).toBe('error')
    expect(parent?.error).toBe(boom)
    expect(child?.isFetching).toBe(false)
    expect(child?.loaderData).toBeUndefined()
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

  test('a parent loader throw does not leave child matches fetching', async () => {
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
