import { expect, test, vi } from 'vitest'
import { createMemoryHistory } from 'speedy-router-history'
import { createRootRoute, createRoute } from '../src/route'
import { createRouter } from '../src/router'

test('cached warm matches use updated router context', async () => {
  const root = createRootRoute()
  const first = createRoute({ getParentRoute: () => root, path: '/first' })
  const second = createRoute({ getParentRoute: () => root, path: '/second' })
  root.addChildren([first, second])
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory(),
    isServer: true,
    context: { version: 1 },
  })

  await router.navigate({ href: '/first' } as any)
  router.update({ context: { version: 2 } })
  await router.navigate({ href: '/second' } as any)
  await router.navigate({ href: '/first' } as any)

  expect(router.state.matches.at(-1)?.context.version).toBe(2)
})

function createLoaderRouter(context: Record<string, unknown>) {
  const loader = vi.fn(({ context: matchContext }: any) => ({
    version: matchContext.version,
  }))
  const root = createRootRoute()
  const home = createRoute({ getParentRoute: () => root, path: '/' })
  const reports = createRoute({
    getParentRoute: () => root,
    path: '/reports',
    staleTime: Infinity,
    loader,
  })
  root.addChildren([home, reports])
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ['/'] }),
    context,
  })
  return { loader, router }
}

// `RouterContextProvider` builds a fresh `context` object on every render, so a
// reference change alone must not drop warm matches or their loader data.
test('a new context object with unchanged values keeps cached loader data', async () => {
  const { loader, router } = createLoaderRouter({ version: 1 })

  await router.load()
  await router.navigate({ to: '/reports' })
  await router.navigate({ to: '/' })
  expect(loader).toHaveBeenCalledTimes(1)

  router.update({ context: { version: 1 } })
  await router.navigate({ to: '/reports' })

  expect(loader).toHaveBeenCalledTimes(1)
  expect(router.state.matches.at(-1)?.loaderData).toEqual({ version: 1 })
})

test('a changed context value clears cached loader data', async () => {
  const { loader, router } = createLoaderRouter({ version: 1 })

  await router.load()
  await router.navigate({ to: '/reports' })
  await router.navigate({ to: '/' })
  expect(loader).toHaveBeenCalledTimes(1)

  router.update({ context: { version: 2 } })
  await router.navigate({ to: '/reports' })

  expect(loader).toHaveBeenCalledTimes(2)
  expect(router.state.matches.at(-1)?.loaderData).toEqual({ version: 2 })
})

// A finished preload keeps a lease on its loader flight, so its cache entry
// must still be dropped when the context value it loaded with is gone.
test('a changed context value clears preloaded loader data', async () => {
  const { loader, router } = createLoaderRouter({ version: 1 })

  await router.load()
  await router.preloadRoute({ to: '/reports' })
  expect(loader).toHaveBeenCalledTimes(1)

  router.update({ context: { version: 2 } })
  await router.navigate({ to: '/reports' })

  expect(loader).toHaveBeenCalledTimes(2)
  expect(router.state.matches.at(-1)?.loaderData).toEqual({ version: 2 })
})

test('a new context object with unchanged values keeps preloaded loader data', async () => {
  const { loader, router } = createLoaderRouter({ version: 1 })

  await router.load()
  await router.preloadRoute({ to: '/reports' })
  expect(loader).toHaveBeenCalledTimes(1)

  router.update({ context: { version: 1 } })
  await router.navigate({ to: '/reports' })

  expect(loader).toHaveBeenCalledTimes(1)
  expect(router.state.matches.at(-1)?.loaderData).toEqual({ version: 1 })
})

test('a nested context value keeps cached loader data while its values match', async () => {
  const { loader, router } = createLoaderRouter({ user: { id: 1, roles: { admin: true } } })

  await router.load()
  await router.navigate({ to: '/reports' })
  await router.navigate({ to: '/' })
  expect(loader).toHaveBeenCalledTimes(1)

  router.update({ context: { user: { id: 1, roles: { admin: true } } } })
  await router.navigate({ to: '/reports' })
  expect(loader).toHaveBeenCalledTimes(1)

  await router.navigate({ to: '/' })
  router.update({ context: { user: { id: 1, roles: { admin: false } } } })
  await router.navigate({ to: '/reports' })
  expect(loader).toHaveBeenCalledTimes(2)
})

test('an unrelated update option leaves cached loader data in place', async () => {
  const { loader, router } = createLoaderRouter({ version: 1 })

  await router.load()
  await router.navigate({ to: '/reports' })
  await router.navigate({ to: '/' })
  expect(loader).toHaveBeenCalledTimes(1)

  router.update({ defaultPreload: 'intent' })
  await router.navigate({ to: '/reports' })

  expect(loader).toHaveBeenCalledTimes(1)
})

// Router context may hold cyclic values, so the comparison must terminate.
test('a cyclic context value is compared without overflowing the stack', async () => {
  const first: Record<string, unknown> = {}
  first.self = first
  const { loader, router } = createLoaderRouter({ value: first })

  await router.load()
  await router.navigate({ to: '/reports' })
  await router.navigate({ to: '/' })
  expect(loader).toHaveBeenCalledTimes(1)

  const second: Record<string, unknown> = {}
  second.self = second
  router.update({ context: { value: second } })
  await router.navigate({ to: '/reports' })

  expect(loader).toHaveBeenCalledTimes(2)
})

// A context value that is not a plain object cannot be compared by value, so a
// new instance must still count as a change.
test('a replaced non-plain context value clears cached loader data', async () => {
  const { loader, router } = createLoaderRouter({ client: new Map([['id', 1]]) })

  await router.load()
  await router.navigate({ to: '/reports' })
  await router.navigate({ to: '/' })
  expect(loader).toHaveBeenCalledTimes(1)

  router.update({ context: { client: new Map([['id', 1]]) } })
  await router.navigate({ to: '/reports' })

  expect(loader).toHaveBeenCalledTimes(2)
})
