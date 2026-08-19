import { describe, expect, test } from 'vitest'
import { createMemoryHistory } from 'speedy-router-history'
import { createRootRoute, createRoute } from '../src/route'
import { createRouter } from '../src/router'

function createOverlappingBlockerRouter() {
  const first = Promise.withResolvers<boolean>()
  const second = Promise.withResolvers<boolean>()
  let attempts = 0
  let otherLoads = 0
  const root = createRootRoute()
  const index = createRoute({ getParentRoute: () => root, path: '/' })
  const about = createRoute({ getParentRoute: () => root, path: '/about' })
  const other = createRoute({
    getParentRoute: () => root,
    path: '/other',
    loader: async () => {
      otherLoads++
      await new Promise((resolve) => {
        setTimeout(resolve, 10)
      })
      return 'other'
    },
  })
  root.addChildren([index, about, other] as any)
  const history = createMemoryHistory({ initialEntries: ['/'] })
  const router = createRouter({ routeTree: root as any, history, isServer: true })
  return {
    first,
    second,
    history,
    router,
    getOtherLoads: () => otherLoads,
    install: () => {
      history.block({
        blockerFn: () => (++attempts === 1 ? first.promise : second.promise),
      })
    },
  }
}

describe('overlapping blocked href commits', () => {
  test('older attempt settling first does not expose the later commit as external', async () => {
    ;(globalThis as any).document = {}
    const ctx = createOverlappingBlockerRouter()
    await ctx.router.load()
    ctx.install()

    const firstNav = ctx.router.navigate({ href: '/about' } as any)
    const secondNav = ctx.router.navigate({ href: '/other' } as any)

    // The superseded attempt releases its commit before the later resolver answers.
    ctx.first.resolve(true)
    await firstNav
    expect(ctx.history.location.pathname).toBe('/')

    ctx.second.resolve(false)
    await secondNav
    await new Promise((resolve) => {
      setTimeout(resolve, 20)
    })

    expect(ctx.history.location.pathname).toBe('/other')
    expect(ctx.router.state.location.pathname).toBe('/other')
    expect(ctx.getOtherLoads()).toBe(1)
    delete (globalThis as any).document
  })

  test('newer attempt settling first still lands once', async () => {
    ;(globalThis as any).document = {}
    const ctx = createOverlappingBlockerRouter()
    await ctx.router.load()
    ctx.install()

    const firstNav = ctx.router.navigate({ href: '/about' } as any)
    const secondNav = ctx.router.navigate({ href: '/other' } as any)

    ctx.second.resolve(false)
    ctx.first.resolve(true)
    await Promise.all([firstNav, secondNav])
    await new Promise((resolve) => {
      setTimeout(resolve, 20)
    })

    expect(ctx.history.location.pathname).toBe('/other')
    expect(ctx.router.state.location.pathname).toBe('/other')
    expect(ctx.getOtherLoads()).toBe(1)
    delete (globalThis as any).document
  })
})
