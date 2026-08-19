import { describe, expect, it } from 'vitest'
import { createMemoryHistory } from 'speedy-router-history'
import { createRootRoute, createRoute } from '../src/route'
import { createRouter } from '../src/router'
import { loadServerRoute } from '../src/load-server'

function lazyRoute(opts: {
  id: string
  path?: string
  parent: () => any
  load: () => Promise<{ options?: Record<string, unknown> }>
}) {
  const route = createRoute({ getParentRoute: opts.parent })
  route.update(
    (opts.path === undefined
      ? { id: opts.id, getParentRoute: opts.parent }
      : { id: opts.id, path: opts.path, getParentRoute: opts.parent }) as any,
  )
  const lazy = route.lazy(async () => {
    const loaded = await opts.load()
    return { options: { id: opts.id, ...loaded.options } } as any
  })
  ;(lazy as any)._lazyOptions = true
  return lazy
}

describe('lazy file routes', () => {
  it('reduces rejected lazy options into client route errors', async () => {
    const error = new Error('lazy chunk failed')
    const root = createRootRoute()
    const lazy = lazyRoute({
      id: '/lazy',
      path: '/lazy',
      parent: () => root,
      load: async () => {
        throw error
      },
    })
    const history = createMemoryHistory({ initialEntries: ['/'] })
    const router = createRouter({
      routeTree: root.addChildren([lazy]),
      history,
    })
    await router.load()

    await router.navigate({ to: '/lazy' })

    expect(history.location.pathname).toBe('/lazy')
    expect(router.state.location.pathname).toBe('/lazy')
    expect(router.state.matches.at(-1)).toMatchObject({
      status: 'error',
      error,
    })
  })

  it('stamps lane ownership and inherited context on rejected lazy options', async () => {
    const error = new Error('lazy chunk failed')
    const root = createRootRoute({ context: () => ({ rootContext: true }) })
    const lazy = lazyRoute({
      id: '/lazy',
      path: '/lazy',
      parent: () => root,
      load: async () => {
        throw error
      },
    })
    const router = createRouter({
      routeTree: root.addChildren([lazy]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
      context: { routerContext: true },
    })
    await router.load()

    await router.navigate({ to: '/lazy' })

    const errored = router.state.matches.at(-1)!
    expect(errored).toMatchObject({ status: 'error', error })
    expect(errored.context).toEqual({ routerContext: true, rootContext: true })
    expect(errored.abortController).toBe(router.state.matches[0]!.abortController)
  })

  it('stamps the inherited ssr default on rejected lazy options', async () => {
    const error = new Error('lazy chunk failed')
    let attempts = 0
    let errorComponentLoaded = false
    const root = createRootRoute()
    const lazy = lazyRoute({
      id: '/lazy',
      path: '/lazy',
      parent: () => root,
      load: async () => {
        if (++attempts === 1) {
          throw error
        }
        return {
          options: {
            errorComponent: Object.assign(() => null, {
              preload: async () => {
                errorComponentLoaded = true
              },
            }),
          },
        }
      },
    })
    const router = createRouter({
      routeTree: root.addChildren([lazy]),
      history: createMemoryHistory({ initialEntries: ['/lazy'] }),
      isServer: true,
    })

    await loadServerRoute(router)

    expect(router.state.matches.at(-1)).toMatchObject({
      status: 'error',
      error,
      ssr: true,
    })
    expect(errorComponentLoaded).toBe(true)
  })

  it('reduces rejected lazy options into server error results', async () => {
    const error = new Error('lazy chunk failed')
    const root = createRootRoute()
    const lazy = lazyRoute({
      id: '/lazy',
      path: '/lazy',
      parent: () => root,
      load: async () => {
        throw error
      },
    })
    const router = createRouter({
      routeTree: root.addChildren([lazy]),
      history: createMemoryHistory({ initialEntries: ['/lazy'] }),
      isServer: true,
    })

    await expect(Promise.resolve(loadServerRoute(router))).resolves.toBeUndefined()
    expect((router as any)._serverResult).toMatchObject({
      type: 'render',
      status: 500,
    })
    expect(router.state.matches.at(-1)).toMatchObject({
      status: 'error',
      error,
    })
  })

  it('matches without importing unused route modules', async () => {
    const loaded: Array<string> = []
    const root = createRootRoute()
    const indexRoute = lazyRoute({
      id: '/',
      path: '/',
      parent: () => root,
      load: async () => {
        loaded.push('/')
        return { options: { loader: () => ({ page: 'home' }) } }
      },
    })
    const aboutRoute = lazyRoute({
      id: '/about',
      path: '/about',
      parent: () => root,
      load: async () => {
        loaded.push('/about')
        return { options: { loader: () => ({ page: 'about' }) } }
      },
    })
    const postRoute = lazyRoute({
      id: '/posts/$postId',
      path: '/posts/$postId',
      parent: () => root,
      load: async () => {
        loaded.push('/posts/$postId')
        return {
          options: {
            loader: ({ params }: { params: { postId: string } }) => ({
              page: params.postId,
            }),
          },
        }
      },
    })

    const router = createRouter({
      routeTree: root.addChildren([indexRoute, aboutRoute, postRoute]),
      history: createMemoryHistory({ initialEntries: ['/about'] }),
    })

    expect(loaded).toEqual([])
    await router.load()
    expect(loaded).toEqual(['/about'])
    expect(router.state.matches.at(-1)?.loaderData).toEqual({ page: 'about' })

    await router.navigate({ to: '/posts/$postId', params: { postId: '42' } } as any)
    expect(loaded).toEqual(['/about', '/posts/$postId'])
    expect(router.state.matches.at(-1)?.loaderData).toEqual({ page: '42' })
  })

  it('nests pathless layouts without consuming URL segments', async () => {
    const root = createRootRoute()
    const authRoute = lazyRoute({
      id: '/_auth',
      parent: () => root,
      load: async () => ({
        options: { beforeLoad: () => ({ authed: true }) },
      }),
    })
    const loginRoute = lazyRoute({
      id: '/login',
      path: '/login',
      parent: () => authRoute,
      load: async () => ({
        options: {
          loader: ({ context }: { context: { authed: boolean } }) => context,
        },
      }),
    })

    const router = createRouter({
      routeTree: root.addChildren([authRoute.addChildren([loginRoute])]),
      history: createMemoryHistory({ initialEntries: ['/login'] }),
    })
    await router.load()
    expect(router.state.location.pathname).toBe('/login')
    expect(router.state.matches.map((match) => match.routeId)).toEqual([
      '__root__',
      '/_auth',
      '/_auth/login',
    ])
    expect(router.state.matches.at(-1)?.loaderData).toEqual({ authed: true })
  })

  it('matches sibling pathful underscore layouts by their children', async () => {
    const root = createRootRoute()
    const profile = lazyRoute({
      id: '/$username/_profile',
      path: '/$username',
      parent: () => root,
      load: async () => ({ options: { loader: () => ({ layout: 'profile' }) } }),
    })
    const profileIndex = lazyRoute({
      id: '/',
      path: '/',
      parent: () => profile,
      load: async () => ({ options: { loader: () => ({ page: 'posts' }) } }),
    })
    const followers = lazyRoute({
      id: '/$username/_followers',
      path: '/$username',
      parent: () => root,
      load: async () => ({ options: { loader: () => ({ layout: 'followers' }) } }),
    })
    const followersList = lazyRoute({
      id: '/followers',
      path: '/followers',
      parent: () => followers,
      load: async () => ({ options: { loader: () => ({ page: 'followers' }) } }),
    })

    const router = createRouter({
      routeTree: root.addChildren([
        profile.addChildren([profileIndex]),
        followers.addChildren([followersList]),
      ]),
      history: createMemoryHistory({ initialEntries: ['/jack'] }),
    })
    await router.load()
    expect(router.state.matches.map((match) => match.routeId)).toEqual([
      '__root__',
      '/$username/_profile',
      '/$username/_profile/',
    ])
    expect(router.state.matches.at(-1)?.params).toEqual({ username: 'jack' })

    await router.navigate({ to: '/$username/followers', params: { username: 'jack' } } as any)
    expect(router.state.matches.map((match) => match.routeId)).toEqual([
      '__root__',
      '/$username/_followers',
      '/$username/_followers/followers',
    ])
    expect(router.state.matches.at(-1)?.params).toEqual({ username: 'jack' })
  })
})
