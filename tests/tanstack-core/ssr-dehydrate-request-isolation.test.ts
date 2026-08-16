// @vitest-environment node
import { createMemoryHistory } from '@tanstack/history'
import { describe, expect, test } from 'vitest'
import { BaseRootRoute, BaseRoute } from '@tanstack/router-core'
import { createRequestHandler } from '@tanstack/router-core/ssr/createRequestHandler'
import { attachRouterServerSsrUtils } from '@tanstack/router-core/ssr/ssr-server'
import { createTestRouter } from './router-test-utils'

async function takeDehydratedScripts(router: ReturnType<typeof createTestRouter>) {
  const serializationDone = new Promise<void>((resolve) => {
    router.serverSsr!.onSerializationFinished(resolve)
  })
  await router.serverSsr!.dehydrate()
  await serializationDone
  const scripts = router.serverSsr!.takeBufferedScripts()?.children ?? ''
  router.serverSsr?.cleanup()
  return scripts
}

async function dehydrateLoaderScripts(secret: string) {
  const rootRoute = new BaseRootRoute({})
  const indexRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    loader: () => ({ secret }),
    component: () => null,
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
    isServer: true,
  })

  attachRouterServerSsrUtils({ router, manifest: undefined })
  await router.load()
  return takeDehydratedScripts(router)
}

describe('SSR dehydrate request isolation', () => {
  test('does not replay another request’s loader data for the same match shape', async () => {
    const alice = await dehydrateLoaderScripts('ALICE_SECRET')
    const bob = await dehydrateLoaderScripts('BOB_SECRET')

    expect(alice).toContain('ALICE_SECRET')
    expect(alice).not.toContain('BOB_SECRET')
    expect(bob).toContain('BOB_SECRET')
    expect(bob).not.toContain('ALICE_SECRET')
  })

  test('a reused server router re-runs loaders and dehydrates only the current request', async () => {
    let secret = 'ALICE_SECRET'
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      loader: () => ({ secret }),
      component: () => null,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
      isServer: true,
    })

    attachRouterServerSsrUtils({ router, manifest: undefined })
    await router.load()
    const alice = await takeDehydratedScripts(router)

    secret = 'BOB_SECRET'
    attachRouterServerSsrUtils({ router, manifest: undefined })
    await router.load()
    const bob = await takeDehydratedScripts(router)

    expect(alice).toContain('ALICE_SECRET')
    expect(alice).not.toContain('BOB_SECRET')
    expect(bob).toContain('BOB_SECRET')
    expect(bob).not.toContain('ALICE_SECRET')
  })

  test('createRequestHandler on a singleton router does not serve another user’s data', async () => {
    let secret = 'ALICE_SECRET'
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      loader: () => ({ secret }),
      headers: ({ loaderData }) => ({
        'x-secret': String((loaderData as { secret?: string } | undefined)?.secret ?? ''),
      }),
      component: () => null,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
      isServer: true,
    })

    async function handleCurrentUser() {
      const handler = createRequestHandler({
        createRouter: () => router,
        request: new Request('http://localhost/'),
      })
      const response = await handler(async ({ router: requestRouter, responseHeaders }) => {
        // createRequestHandler already dehydrated this request.
        const scripts = requestRouter.serverSsr!.takeBufferedScripts()?.children ?? ''
        return new Response(scripts, { headers: responseHeaders })
      })
      return {
        body: await response.text(),
        secretHeader: response.headers.get('x-secret'),
      }
    }

    const alice = await handleCurrentUser()
    secret = 'BOB_SECRET'
    const bob = await handleCurrentUser()

    expect(alice.body).toContain('ALICE_SECRET')
    expect(alice.body).not.toContain('BOB_SECRET')
    expect(alice.secretHeader).toBe('ALICE_SECRET')
    expect(bob.body).toContain('BOB_SECRET')
    expect(bob.body).not.toContain('ALICE_SECRET')
    expect(bob.secretHeader).toBe('BOB_SECRET')
  })

  test('shared route trees do not leak loader data through match templates', async () => {
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      loader: () => ({ secret: 'ALICE_SECRET' }),
      component: () => null,
    })
    const routeTree = rootRoute.addChildren([indexRoute])

    const alice = createTestRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/'] }),
      isServer: true,
    })
    attachRouterServerSsrUtils({ router: alice, manifest: undefined })
    await alice.load()
    // Rematch after load would previously snapshot loaderData into the shared tree.
    alice.matchRoutes(alice.latestLocation)

    const bob = createTestRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/'] }),
      isServer: true,
    })
    const matches = bob.matchRoutes(bob.latestLocation)
    for (const match of matches) {
      expect(match.loaderData).toBeUndefined()
      expect(match.headers).toBeUndefined()
      expect(String(match.error ?? '')).not.toContain('ALICE_SECRET')
    }
  })

  test('ssr:false on a reused router does not keep the previous user’s loader data', async () => {
    let secret = 'ALICE_SECRET'
    let ssrEnabled = true
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      ssr: () => ssrEnabled,
      loader: () => ({ secret }),
      // Force the full server lane so functional `ssr` is honored.
      headers: () => ({ 'x-isolation': '1' }),
      component: () => null,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
      isServer: true,
    })

    attachRouterServerSsrUtils({ router, manifest: undefined })
    await router.load()
    const alice = await takeDehydratedScripts(router)

    secret = 'BOB_SECRET'
    ssrEnabled = false
    attachRouterServerSsrUtils({ router, manifest: undefined })
    await router.load()
    const bob = await takeDehydratedScripts(router)

    expect(alice).toContain('ALICE_SECRET')
    expect(bob).not.toContain('ALICE_SECRET')
    expect(bob).not.toContain('BOB_SECRET')
  })
})
