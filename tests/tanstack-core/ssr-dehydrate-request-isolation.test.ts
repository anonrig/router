// @vitest-environment node
import { createMemoryHistory } from '@tanstack/history'
import { describe, expect, test } from 'vitest'
import { BaseRootRoute, BaseRoute } from '@tanstack/router-core'
import { attachRouterServerSsrUtils } from '@tanstack/router-core/ssr/ssr-server'
import { createTestRouter } from './router-test-utils'

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

  const serializationDone = new Promise<void>((resolve) => {
    router.serverSsr!.onSerializationFinished(resolve)
  })
  await router.serverSsr!.dehydrate()
  await serializationDone

  const scripts = router.serverSsr!.takeBufferedScripts()?.children ?? ''
  router.serverSsr?.cleanup()
  return scripts
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
})
