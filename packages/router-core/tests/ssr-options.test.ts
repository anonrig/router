import { describe, expect, it, vi } from 'vitest'
import { createMemoryHistory } from 'speedy-router-history'
import { createRootRoute, createRoute } from '../src/route'
import { notFound } from '../src/not-found'
import { redirect } from '../src/redirect'
import { createRouter, SearchParamError, setLoadServerRoute } from '../src/router'
import { createRequestHandler } from '../src/ssr/create-request-handler'
import { attachRouterServerSsrUtils } from '../src/ssr/ssr-server'
import { registerLoadServerRoute } from '../src/ssr/register-load-server'
import { loadServerRoute } from '../src/load-server'
import type { AnyRouter, SSROption } from '../src/router'

type SsrValue = SSROption | undefined

function loadServerResponse(router: AnyRouter, path: string) {
  return createRequestHandler({
    createRouter: () => router,
    request: new Request(`http://localhost${path}`),
  })(({ router: loaded, responseHeaders }) => {
    const result = (loaded as AnyRouter & { _serverResult?: any })._serverResult
    return new Response(null, {
      status: result?.type === 'redirect' ? result.redirect.status : (result?.status ?? 500),
      headers: responseHeaders,
    })
  })
}

function matchOf(router: AnyRouter, routeId: string) {
  return router.state.matches.find((match) => match.routeId === routeId)
}

function matchSsr(router: AnyRouter, routeId: string) {
  return matchOf(router, routeId)?.ssr
}

async function loadTree(options: {
  path?: string
  defaultSsr?: SSROption
  isShell?: boolean
  rootSsr?: SsrValue | ((ctx: any) => SsrValue | Promise<SsrValue>)
  childSsr?: SsrValue | ((ctx: any) => SsrValue | Promise<SsrValue>)
  grandSsr?: SsrValue | ((ctx: any) => SsrValue | Promise<SsrValue>)
  root?: Record<string, unknown>
  child?: Record<string, unknown>
  grand?: Record<string, unknown>
}) {
  const path = options.path ?? '/child/grand'
  const rootRoute = createRootRoute({
    ssr: options.rootSsr as any,
    ...options.root,
  })
  const childRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/child',
    ssr: options.childSsr as any,
    ...options.child,
  })
  const grandRoute = createRoute({
    getParentRoute: () => childRoute,
    path: '/grand',
    ssr: options.grandSsr as any,
    ...options.grand,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([childRoute.addChildren([grandRoute])]),
    history: createMemoryHistory({ initialEntries: [path] }),
    isServer: true,
    defaultSsr: options.defaultSsr,
    isShell: options.isShell,
  })
  const response = await loadServerResponse(router, path)
  return { router, response, rootRoute, childRoute, grandRoute }
}

describe('SSR loader registration', () => {
  it('prevents an older server load from overwriting a newer load', async () => {
    let release!: (value: string) => void
    let started!: () => void
    const didStart = new Promise<void>((resolve) => {
      started = resolve
    })
    const root = createRootRoute()
    const a = createRoute({
      getParentRoute: () => root,
      path: '/a',
      loader: () => {
        started()
        return new Promise<string>((resolve) => {
          release = resolve
        })
      },
    })
    const b = createRoute({
      getParentRoute: () => root,
      path: '/b',
      loader: () => 'B',
    })
    root.addChildren([a, b])
    const history = createMemoryHistory({ initialEntries: ['/a'] })
    const router = createRouter({ routeTree: root, history, isServer: true })

    const first = Promise.resolve(loadServerRoute(router))
    await didStart
    history.push('/b')
    await Promise.resolve(loadServerRoute(router))
    expect(router.state.location.pathname).toBe('/b')

    release('A')
    await first

    expect(router.state.location.pathname).toBe('/b')
    expect(matchOf(router, b.id)?.loaderData).toBe('B')
  })

  async function withStaleClientHook<T>(run: () => Promise<T>): Promise<T> {
    setLoadServerRoute(() => {
      throw new Error('client loader ran')
    })
    try {
      return await run()
    } finally {
      registerLoadServerRoute()
    }
  }

  it('SSR entry registration lets router.load set _serverResult', async () => {
    await withStaleClientHook(async () => {
      registerLoadServerRoute()
      const router = createRouter({
        routeTree: createRootRoute(),
        history: createMemoryHistory({ initialEntries: ['/'] }),
        isServer: true,
      })
      await router.load()
      expect(router._serverResult).toMatchObject({ type: 'render', status: 200 })
    })
  })

  it('attachRouterServerSsrUtils reinstalls the server loader', async () => {
    await withStaleClientHook(async () => {
      const router = createRouter({
        routeTree: createRootRoute(),
        history: createMemoryHistory({ initialEntries: ['/'] }),
        isServer: true,
      })
      attachRouterServerSsrUtils({ router, manifest: undefined })
      await router.load()
      expect(router._serverResult).toMatchObject({ type: 'render', status: 200 })
    })
  })

  it('createRequestHandler reinstalls the server loader', async () => {
    await withStaleClientHook(async () => {
      const { router, response } = await loadTree({ path: '/child' })
      expect(response.status).toBe(200)
      expect(router._serverResult).toMatchObject({ type: 'render', status: 200 })
    })
  })
})

describe('fast server loader thenables', () => {
  it('awaits PromiseLike loader results', async () => {
    const { router, response, rootRoute } = await loadTree({
      root: {
        loader: () => {
          // The fast server lane must await PromiseLike results, not only Promises.
          // oxlint-disable-next-line unicorn/no-thenable
          return { then: (resolve: (value: string) => void) => resolve('resolved data') }
        },
      },
    })

    expect(response.status).toBe(200)
    expect(matchOf(router, rootRoute.id)?.loaderData).toBe('resolved data')
  })
})

describe('fast server loader failures', () => {
  it('commits rejected errors as 500 results', async () => {
    const error = new Error('async failure')
    const { router, response, rootRoute } = await loadTree({
      root: {
        loader: async () => {
          throw error
        },
      },
    })

    expect(response.status).toBe(500)
    expect(matchOf(router, rootRoute.id)?.status).toBe('error')
    expect(matchOf(router, rootRoute.id)?.error).toBe(error)
  })

  it('commits rejected not-found values as 404 results', async () => {
    const { router, response, rootRoute } = await loadTree({
      root: {
        loader: async () => {
          throw notFound()
        },
      },
    })

    expect(response.status).toBe(404)
    expect(matchOf(router, rootRoute.id)?.status).toBe('notFound')
  })

  it('commits resolved not-found values as 404 results', async () => {
    const notFoundValue = notFound()
    const { router, response, rootRoute } = await loadTree({
      root: { loader: async () => notFoundValue },
    })

    expect(response.status).toBe(404)
    expect(matchOf(router, rootRoute.id)?.status).toBe('notFound')
    expect(matchOf(router, rootRoute.id)?.error).toBe(notFoundValue)
  })

  it('commits resolved redirects', async () => {
    const { router, response } = await loadTree({
      root: { loader: async () => redirect({ to: '/child' }) },
    })

    expect(response.status).toBe(307)
    expect(router._serverResult).toMatchObject({ type: 'redirect' })
  })

  it('keeps resolved error instances as loader data', async () => {
    const value = new Error('not a failure')
    const { router, response, rootRoute } = await loadTree({
      root: { loader: async () => value },
    })

    expect(response.status).toBe(200)
    expect(matchOf(router, rootRoute.id)?.status).toBe('success')
    expect(matchOf(router, rootRoute.id)?.loaderData).toBe(value)
  })
})

describe('fast server request cancellation', () => {
  it('aborts route loaders and rejects without waiting for them', async () => {
    let started!: () => void
    const didStart = new Promise<void>((resolve) => {
      started = resolve
    })
    let routeSignal!: AbortSignal
    const root = createRootRoute({
      loader: ({ abortController }) => {
        routeSignal = abortController.signal
        started()
        return new Promise<void>(() => {})
      },
    })
    const router = createRouter({
      routeTree: root,
      history: createMemoryHistory({ initialEntries: ['/'] }),
      isServer: true,
    })
    const request = new AbortController()
    const reason = new Error('request canceled')

    const loading = Promise.resolve(loadServerRoute(router, { _signal: request.signal }))
    await didStart
    request.abort(reason)

    expect(routeSignal.aborted).toBe(true)
    await expect(loading).rejects.toBe(reason)
  })
})

describe('route ssr option resolution', () => {
  it.each([
    { name: 'undefined defaults to true', ssr: undefined, expected: true },
    { name: 'true', ssr: true, expected: true },
    { name: 'false', ssr: false, expected: false },
    { name: 'data-only', ssr: 'data-only' as const, expected: 'data-only' },
  ])('root $name', async ({ ssr, expected }) => {
    const { router, response, rootRoute } = await loadTree({
      path: '/child',
      rootSsr: ssr,
    })
    expect(response.status).toBe(200)
    expect(matchSsr(router, rootRoute.id)).toBe(expected)
  })

  it.each([
    { parent: true, child: undefined, expected: true },
    { parent: true, child: true, expected: true },
    { parent: true, child: false, expected: false },
    { parent: true, child: 'data-only' as const, expected: 'data-only' },
    { parent: false, child: undefined, expected: false },
    { parent: false, child: true, expected: false },
    { parent: false, child: false, expected: false },
    { parent: false, child: 'data-only' as const, expected: false },
    { parent: 'data-only' as const, child: undefined, expected: 'data-only' },
    { parent: 'data-only' as const, child: true, expected: 'data-only' },
    { parent: 'data-only' as const, child: false, expected: false },
    { parent: 'data-only' as const, child: 'data-only' as const, expected: 'data-only' },
  ] satisfies Array<{ parent: SSROption; child: SsrValue; expected: SSROption }>)(
    'parent $parent + child $child resolves to $expected',
    async ({ parent, child, expected }) => {
      const { router, childRoute } = await loadTree({
        path: '/child',
        rootSsr: parent,
        childSsr: child,
      })
      expect(matchSsr(router, childRoute.id)).toBe(expected)
    },
  )

  it('cannot relax a false ancestor by setting a grandchild to data-only', async () => {
    const { router, grandRoute } = await loadTree({
      rootSsr: true,
      childSsr: false,
      grandSsr: 'data-only',
    })
    expect(matchSsr(router, grandRoute.id)).toBe(false)
  })

  it('can tighten data-only to false on a grandchild', async () => {
    const { router, childRoute, grandRoute } = await loadTree({
      rootSsr: true,
      childSsr: 'data-only',
      grandSsr: false,
    })
    expect(matchSsr(router, childRoute.id)).toBe('data-only')
    expect(matchSsr(router, grandRoute.id)).toBe(false)
  })

  it('does not invoke a child ssr() once a parent is false', async () => {
    const childSsr = vi.fn(() => true)
    const { router, childRoute } = await loadTree({
      path: '/child',
      rootSsr: false,
      childSsr,
    })
    expect(childSsr).not.toHaveBeenCalled()
    expect(matchSsr(router, childRoute.id)).toBe(false)
  })
})

describe('router defaultSsr', () => {
  it.each([
    { defaultSsr: undefined, expected: true },
    { defaultSsr: true, expected: true },
    { defaultSsr: false, expected: false },
    { defaultSsr: 'data-only' as const, expected: 'data-only' },
  ])('undefined route ssr uses defaultSsr=$defaultSsr', async ({ defaultSsr, expected }) => {
    const { router, rootRoute, childRoute } = await loadTree({
      path: '/child',
      defaultSsr,
    })
    expect(matchSsr(router, rootRoute.id)).toBe(expected)
    expect(matchSsr(router, childRoute.id)).toBe(expected)
  })

  it('explicit root ssr:true wins over defaultSsr:false for the root only', async () => {
    const { router, rootRoute, childRoute } = await loadTree({
      path: '/child',
      defaultSsr: false,
      rootSsr: true,
    })
    expect(matchSsr(router, rootRoute.id)).toBe(true)
    // Unset children still use defaultSsr, then inherit restrictively from the parent.
    expect(matchSsr(router, childRoute.id)).toBe(false)
  })

  it('explicit child ssr:true SSRs when the parent is true even if defaultSsr is false', async () => {
    const { router, childRoute } = await loadTree({
      path: '/child',
      defaultSsr: false,
      rootSsr: true,
      childSsr: true,
    })
    expect(matchSsr(router, childRoute.id)).toBe(true)
  })

  it('defaultSsr:false on the root blocks child ssr:true', async () => {
    const { router, rootRoute, childRoute } = await loadTree({
      path: '/child',
      defaultSsr: false,
      childSsr: true,
    })
    expect(matchSsr(router, rootRoute.id)).toBe(false)
    expect(matchSsr(router, childRoute.id)).toBe(false)
  })

  it('defaultSsr:data-only plus child ssr:true stays data-only', async () => {
    const { router, childRoute } = await loadTree({
      path: '/child',
      defaultSsr: 'data-only',
      childSsr: true,
    })
    expect(matchSsr(router, childRoute.id)).toBe('data-only')
  })
})

describe('functional ssr()', () => {
  it.each([
    { result: true, expected: true },
    { result: false, expected: false },
    { result: 'data-only' as const, expected: 'data-only' },
    { result: undefined, expected: true },
  ])('sync return $result resolves to $expected', async ({ result, expected }) => {
    const { router, childRoute } = await loadTree({
      path: '/child',
      childSsr: () => result,
    })
    expect(matchSsr(router, childRoute.id)).toBe(expected)
  })

  it.each([
    { result: true, expected: true },
    { result: false, expected: false },
    { result: 'data-only' as const, expected: 'data-only' },
    { result: undefined, expected: true },
  ])('async return $result resolves to $expected', async ({ result, expected }) => {
    const { router, childRoute } = await loadTree({
      path: '/child',
      childSsr: async () => {
        await Promise.resolve()
        return result
      },
    })
    expect(matchSsr(router, childRoute.id)).toBe(expected)
  })

  it('undefined from ssr() uses defaultSsr', async () => {
    const { router, childRoute } = await loadTree({
      path: '/child',
      defaultSsr: 'data-only',
      childSsr: () => undefined,
    })
    expect(matchSsr(router, childRoute.id)).toBe('data-only')
  })

  it('inherits parent data-only when the function returns true', async () => {
    const { router, childRoute } = await loadTree({
      path: '/child',
      rootSsr: 'data-only',
      childSsr: () => true,
    })
    expect(matchSsr(router, childRoute.id)).toBe('data-only')
  })

  it('passes validated params, search, location, and matches to ssr()', async () => {
    const ssr = vi.fn(({ params, search, location, matches }) => {
      expect(params).toEqual({
        status: 'success',
        value: { postId: '42' },
      })
      expect(search).toEqual({
        status: 'success',
        value: { tab: 'meta' },
      })
      expect(location.pathname).toBe('/posts/42')
      expect(matches.map((item: { routeId: string }) => item.routeId)).toEqual([
        '__root__',
        '/posts/$postId',
      ])
      return 'data-only' as const
    })
    const rootRoute = createRootRoute()
    const postRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/posts/$postId',
      validateSearch: (input: Record<string, unknown>) => ({
        tab: String(input.tab ?? ''),
      }),
      ssr,
    })
    const router = createRouter({
      routeTree: rootRoute.addChildren([postRoute]),
      history: createMemoryHistory({ initialEntries: ['/posts/42?tab=meta'] }),
      isServer: true,
    })
    await loadServerResponse(router, '/posts/42?tab=meta')
    expect(ssr).toHaveBeenCalledTimes(1)
    expect(matchSsr(router, postRoute.id)).toBe('data-only')
  })

  it('passes search validation failures as status:error', async () => {
    const boom = new Error('bad search')
    const ssr = vi.fn(({ search }) => {
      expect(search.status).toBe('error')
      expect(search.error).toBeInstanceOf(SearchParamError)
      expect(search.error.cause).toBe(boom)
      return false
    })
    const rootRoute = createRootRoute()
    const searchRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/search',
      validateSearch: () => {
        throw boom
      },
      ssr,
    })
    const router = createRouter({
      routeTree: rootRoute.addChildren([searchRoute]),
      history: createMemoryHistory({ initialEntries: ['/search?q=1'] }),
      isServer: true,
    })
    const response = await loadServerResponse(router, '/search?q=1')
    expect(ssr).toHaveBeenCalledTimes(1)
    expect(response.status).toBe(500)
    expect(matchSsr(router, searchRoute.id)).toBe(false)
  })

  it.each(['sync', 'async'] as const)(
    'commits a %s ssr() failure with route context and returns 500',
    async (failureMode) => {
      const boom = new Error('feature flag lookup failed')
      const loader = vi.fn(() => 'reports data')
      const onError = vi.fn()
      const beforeLoad = vi.fn()
      const rootRoute = createRootRoute({
        context: () => ({ rootContext: true }),
        beforeLoad: () => ({ rootBeforeLoadContext: true }),
      })
      const reportsRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/reports',
        context: ({ context }) => ({
          reportsContext: (context as { rootBeforeLoadContext: boolean }).rootBeforeLoadContext,
        }),
        ssr: () => {
          if (failureMode === 'sync') {
            throw boom
          }
          return Promise.reject(boom)
        },
        beforeLoad,
        loader,
        onError,
      })
      const router = createRouter({
        routeTree: rootRoute.addChildren([reportsRoute]),
        history: createMemoryHistory({ initialEntries: ['/reports'] }),
        isServer: true,
        context: { routerContext: true },
      })
      const response = await loadServerResponse(router, '/reports')
      expect(loader).not.toHaveBeenCalled()
      expect(beforeLoad).not.toHaveBeenCalled()
      expect(response.status).toBe(500)
      expect(onError).toHaveBeenCalledTimes(1)
      expect(onError).toHaveBeenCalledWith(boom)
      expect(matchOf(router, reportsRoute.id)).toMatchObject({
        status: 'error',
        error: boom,
        context: {
          routerContext: true,
          rootContext: true,
          rootBeforeLoadContext: true,
          reportsContext: true,
        },
      })
    },
  )
})

describe('isShell SPA mode', () => {
  it('forces only the root match to ssr:true and descendants to false', async () => {
    const childSsr = vi.fn(() => 'data-only' as const)
    const { router, rootRoute, childRoute, grandRoute } = await loadTree({
      isShell: true,
      rootSsr: false,
      childSsr,
      grandSsr: 'data-only',
    })
    expect(childSsr).not.toHaveBeenCalled()
    expect(matchSsr(router, rootRoute.id)).toBe(true)
    expect(matchSsr(router, childRoute.id)).toBe(false)
    expect(matchSsr(router, grandRoute.id)).toBe(false)
  })
})

describe('ssr option lifecycle', () => {
  it('ssr:true runs beforeLoad, loader, and component preload', async () => {
    const beforeLoad = vi.fn(() => ({ fromBeforeLoad: true }))
    const loader = vi.fn(() => 'full')
    const preload = vi.fn(() => Promise.resolve())
    const pendingPreload = vi.fn(() => Promise.resolve())
    const { router, response, childRoute } = await loadTree({
      path: '/child',
      childSsr: true,
      child: {
        beforeLoad,
        loader,
        component: Object.assign(() => null, { preload }),
        pendingComponent: Object.assign(() => null, { preload: pendingPreload }),
      },
    })
    expect(response.status).toBe(200)
    expect(beforeLoad).toHaveBeenCalledTimes(1)
    expect(loader).toHaveBeenCalledTimes(1)
    expect(preload).toHaveBeenCalledTimes(1)
    expect(pendingPreload).toHaveBeenCalledTimes(1)
    expect(matchOf(router, childRoute.id)).toMatchObject({
      ssr: true,
      status: 'success',
      loaderData: 'full',
      context: expect.objectContaining({ fromBeforeLoad: true }),
    })
  })

  it('ssr:data-only runs beforeLoad and loader but not component preload', async () => {
    const beforeLoad = vi.fn(() => ({ fromBeforeLoad: true }))
    const loader = vi.fn(() => 'payload')
    const preload = vi.fn(() => Promise.resolve())
    const pendingPreload = vi.fn(() => Promise.resolve())
    const { router, childRoute } = await loadTree({
      path: '/child',
      childSsr: 'data-only',
      child: {
        beforeLoad,
        loader,
        component: Object.assign(() => null, { preload }),
        pendingComponent: Object.assign(() => null, { preload: pendingPreload }),
      },
    })
    expect(beforeLoad).toHaveBeenCalledTimes(1)
    expect(loader).toHaveBeenCalledTimes(1)
    expect(preload).not.toHaveBeenCalled()
    expect(pendingPreload).not.toHaveBeenCalled()
    expect(matchOf(router, childRoute.id)).toMatchObject({
      ssr: 'data-only',
      status: 'success',
      loaderData: 'payload',
      context: expect.objectContaining({ fromBeforeLoad: true }),
    })
  })

  it('ssr:false skips beforeLoad, loader, and component preload but still runs context', async () => {
    const context = vi.fn(() => ({ fromContext: true }))
    const beforeLoad = vi.fn(() => ({ fromBeforeLoad: true }))
    const loader = vi.fn(() => 'should-not-run')
    const preload = vi.fn(() => Promise.resolve())
    const { router, childRoute } = await loadTree({
      path: '/child',
      childSsr: false,
      child: {
        context,
        beforeLoad,
        loader,
        component: Object.assign(() => null, { preload }),
      },
    })
    expect(context).toHaveBeenCalledTimes(1)
    expect(beforeLoad).not.toHaveBeenCalled()
    expect(loader).not.toHaveBeenCalled()
    expect(preload).not.toHaveBeenCalled()
    expect(matchOf(router, childRoute.id)).toMatchObject({
      ssr: false,
      status: 'pending',
      context: expect.objectContaining({ fromContext: true }),
    })
    expect(matchOf(router, childRoute.id)?.loaderData).toBeUndefined()
  })

  it('executes assets at the first ssr:false boundary but not below it', async () => {
    const rootHead = vi.fn(() => ({ meta: [{ title: 'server root' }] }))
    const rootHeaders = vi.fn(() => ({ 'x-server-root': 'projected' }))
    const parentHead = vi.fn(() => ({ meta: [{ title: 'client-only parent' }] }))
    const parentHeaders = vi.fn(() => ({ 'x-client-only-parent': 'projected' }))
    const childHead = vi.fn(() => ({ meta: [{ title: 'client-only child' }] }))
    const childHeaders = vi.fn(() => ({ 'x-client-only-child': 'unexpected' }))
    const { router, response, childRoute, grandRoute } = await loadTree({
      childSsr: false,
      grandSsr: true,
      root: { head: rootHead, headers: rootHeaders },
      child: { head: parentHead, headers: parentHeaders },
      grand: { head: childHead, headers: childHeaders },
    })
    expect(response.status).toBe(200)
    expect(rootHead).toHaveBeenCalledTimes(1)
    expect(rootHeaders).toHaveBeenCalledTimes(1)
    expect(parentHead).toHaveBeenCalledTimes(1)
    expect(parentHeaders).toHaveBeenCalledTimes(1)
    expect(response.headers.get('x-server-root')).toBe('projected')
    expect(response.headers.get('x-client-only-parent')).toBe('projected')
    expect(matchOf(router, childRoute.id)).toMatchObject({
      meta: [{ title: 'client-only parent' }],
      headers: { 'x-client-only-parent': 'projected' },
    })
    expect(childHead).not.toHaveBeenCalled()
    expect(childHeaders).not.toHaveBeenCalled()
    expect(response.headers.get('x-client-only-child')).toBeNull()
    expect(matchOf(router, grandRoute.id)?.meta).toBeUndefined()
  })

  it('projects assets for a data-only branch using loader data', async () => {
    const head = vi.fn(({ loaderData }) => ({
      meta: [{ title: `report: ${loaderData}` }],
    }))
    const headers = vi.fn(({ loaderData }) => ({
      'x-report': String(loaderData),
    }))
    const { router, response, childRoute } = await loadTree({
      path: '/child',
      childSsr: 'data-only',
      child: {
        loader: () => 'server data',
        head,
        headers,
      },
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('x-report')).toBe('server data')
    expect(matchOf(router, childRoute.id)).toMatchObject({
      ssr: 'data-only',
      meta: [{ title: 'report: server data' }],
      headers: { 'x-report': 'server data' },
    })
    expect(head).toHaveBeenCalledTimes(1)
    expect(headers).toHaveBeenCalledTimes(1)
  })

  it('passes router.options.ssr.nonce into route asset callbacks', async () => {
    const head = vi.fn(({ ssr }) => {
      expect(ssr).toEqual({ nonce: 'csp-nonce' })
      return { meta: [{ title: 'n' }] }
    })
    const rootRoute = createRootRoute({ head })
    const router = createRouter({
      routeTree: rootRoute,
      history: createMemoryHistory({ initialEntries: ['/'] }),
      isServer: true,
      ssr: { nonce: 'csp-nonce' },
    })
    const response = await loadServerResponse(router, '/')
    expect(response.status).toBe(200)
    expect(head).toHaveBeenCalledTimes(1)
    expect(router.state.matches[0]).toMatchObject({
      meta: [{ title: 'n' }],
    })
  })
})
