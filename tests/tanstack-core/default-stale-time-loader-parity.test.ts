// @vitest-environment node
import { createMemoryHistory } from '@tanstack/history'
import { describe, expect, test } from 'vitest'
import { BaseRootRoute, BaseRoute } from '@tanstack/router-core'
import '@tanstack/router-core/warm'
import { createTestRouter } from './router-test-utils'

/**
 * Default `staleTime` is 0, matching TanStack. The warm path may reuse match
 * objects, but it must rerun loaders on enter and when params change. These
 * counts are the same probe published in TanStack/router#8087.
 */
const typedDestinations = [
  { to: '/' },
  { to: '/posts' },
  { to: '/posts/$id', params: { id: '1' } },
  { to: '/posts/$id', params: { id: '2' } },
  { to: '/about' },
] as const

function createApp(counter: { calls: number }, staleTime?: number, defaultStaleTime?: number) {
  const root = new BaseRootRoute({})
  const index = new BaseRoute({ getParentRoute: () => root, path: '/' })
  const posts = new BaseRoute({ getParentRoute: () => root, path: '/posts' })
  const post = new BaseRoute({
    getParentRoute: () => root,
    path: '/posts/$id',
    staleTime,
    loader: () => {
      counter.calls++
      return { title: 'Post' }
    },
  })
  const about = new BaseRoute({ getParentRoute: () => root, path: '/about' })
  return createTestRouter({
    routeTree: root.addChildren([index, posts, post, about]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
    defaultStaleTime,
  })
}

async function runTyped(router: { navigate: (options: any) => Promise<void> }) {
  for (let index = 0; index < 100; index++) {
    await router.navigate(typedDestinations[index % typedDestinations.length])
  }
}

async function runChangingParams(router: { navigate: (options: any) => Promise<void> }) {
  for (let index = 0; index < 100; index++) {
    await router.navigate({
      to: '/posts/$id',
      params: { id: String((index % 50) + 1) },
    })
  }
}

describe('default staleTime loader parity', () => {
  test('omitted staleTime reruns loaders on enter and param changes', async () => {
    const sequential = { calls: 0 }
    const router = createApp(sequential)
    await runTyped(router)
    const typed = sequential.calls
    await runChangingParams(router)
    const changingAfterTyped = sequential.calls - typed

    const fresh = { calls: 0 }
    await runChangingParams(createApp(fresh))

    expect({
      typed,
      changingParamsAfterTyped: changingAfterTyped,
      changingParamsFreshRouter: fresh.calls,
    }).toEqual({
      typed: 40,
      changingParamsAfterTyped: 100,
      changingParamsFreshRouter: 100,
    })
  })

  test('explicit staleTime 0 matches the omitted default', async () => {
    const counter = { calls: 0 }
    await runTyped(createApp(counter, 0))
    expect(counter.calls).toBe(40)
  })

  test('staleTime Infinity reuses successful loader data', async () => {
    const counter = { calls: 0 }
    await runTyped(createApp(counter, Infinity))
    expect(counter.calls).toBe(2)
  })

  test('router defaultStaleTime Infinity reuses successful loader data', async () => {
    const counter = { calls: 0 }
    await runTyped(createApp(counter, undefined, Infinity))
    expect(counter.calls).toBe(2)
  })
})
