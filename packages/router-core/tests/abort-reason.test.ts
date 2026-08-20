import { describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from 'speedy-router-history'
import { createRootRoute, createRoute } from '../src/route'
import { createRouter } from '../src/router'

/**
 * `controller.abort()` with no reason makes the platform build a fresh
 * `AbortError` — and capture a stack trace — for every call. Router-owned
 * aborts happen several times per navigation, so they pass one shared reason
 * instead.
 */
function createApp() {
  const signals: AbortSignal[] = []
  const resolvers: Array<() => void> = []

  const root = createRootRoute()
  const post = createRoute({
    getParentRoute: () => root,
    path: '/posts/$id',
    loader: ({ abortController }: { abortController: AbortController }) => {
      signals.push(abortController.signal)
      return new Promise<string>((resolve) => {
        resolvers.push(() => resolve('post'))
      })
    },
  })

  const router = createRouter({
    routeTree: root.addChildren([post]) as any,
    history: createMemoryHistory({ initialEntries: ['/posts/1'] }) as any,
  })
  return { router, signals, resolvers }
}

/** Supersede two in-flight loaders so the router aborts both. */
async function collectAbortedSignals() {
  const { router, signals, resolvers } = createApp()

  // Settle the initial load first so the fixture does not depend on whether
  // `createRouter` starts the `/posts/1` loader on its own.
  const initial = router.load()
  await vi.waitFor(() => expect(signals.length).toBe(1))
  resolvers[0]!()
  await initial
  const settled = signals.length

  const first = router.navigate({ to: '/posts/$id', params: { id: '2' } })
  await vi.waitFor(() => expect(signals.length).toBe(settled + 1))
  const second = router.navigate({ to: '/posts/$id', params: { id: '3' } })
  await vi.waitFor(() => expect(signals.length).toBe(settled + 2))
  const third = router.navigate({ to: '/posts/$id', params: { id: '4' } })
  await vi.waitFor(() => {
    expect(signals.length).toBe(settled + 3)
    expect(signals[settled]!.aborted).toBe(true)
    expect(signals[settled + 1]!.aborted).toBe(true)
  })

  for (const resolve of resolvers) resolve()
  await Promise.allSettled([first, second, third])

  return [signals[settled]!, signals[settled + 1]!] as const
}

describe('router-owned abort reason', () => {
  test('reuses one reason instance across separate aborts', async () => {
    const [a, b] = await collectAbortedSignals()

    expect(a).not.toBe(b)
    expect(a.reason).toBe(b.reason)
  })

  test('keeps the shape of the platform default abort reason', async () => {
    // Compared against a live capture, not a literal: the default message is
    // engine specific ('This operation was aborted' on Node, 'signal is aborted
    // without reason' on Chrome and Safari).
    const platform = new AbortController()
    platform.abort()
    const [a] = await collectAbortedSignals()

    expect(a.reason.constructor).toBe(platform.signal.reason.constructor)
    expect(a.reason.name).toBe(platform.signal.reason.name)
    expect(a.reason.message).toBe(platform.signal.reason.message)
    expect(a.reason.code).toBe(platform.signal.reason.code)
  })
})
