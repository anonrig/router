import { describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '@tanstack/router-core'
import { createTestRouter, loadServerResponse } from './router-test-utils'
import type { SSROption } from '@tanstack/router-core'

type SsrValue = SSROption | undefined

function matchSsr(router: ReturnType<typeof createTestRouter>, routeId: string) {
  return router.state.matches.find((match) => match.routeId === routeId)?.ssr
}

async function loadTree(options: {
  path?: string
  defaultSsr?: SSROption
  isShell?: boolean
  rootSsr?: SsrValue | ((ctx: any) => SsrValue | Promise<SsrValue>)
  childSsr?: SsrValue | ((ctx: any) => SsrValue | Promise<SsrValue>)
}) {
  const path = options.path ?? '/child'
  const rootRoute = new BaseRootRoute({
    ssr: options.rootSsr as any,
  })
  const childRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/child',
    ssr: options.childSsr as any,
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([childRoute]),
    history: createMemoryHistory({ initialEntries: [path] }),
    isServer: true,
    defaultSsr: options.defaultSsr,
    isShell: options.isShell,
  })
  const response = await loadServerResponse(router, path)
  return { router, response, rootRoute, childRoute }
}

describe('official Selective SSR option resolution', () => {
  test.each([
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
        rootSsr: parent,
        childSsr: child,
      })
      expect(matchSsr(router, childRoute.id)).toBe(expected)
    },
  )

  test.each([
    { defaultSsr: undefined, expected: true },
    { defaultSsr: true, expected: true },
    { defaultSsr: false, expected: false },
    { defaultSsr: 'data-only' as const, expected: 'data-only' },
  ])('unset routes use defaultSsr=$defaultSsr', async ({ defaultSsr, expected }) => {
    const { router, rootRoute, childRoute } = await loadTree({ defaultSsr })
    expect(matchSsr(router, rootRoute.id)).toBe(expected)
    expect(matchSsr(router, childRoute.id)).toBe(expected)
  })

  test('defaultSsr:false on the root blocks child ssr:true', async () => {
    const { router, rootRoute, childRoute } = await loadTree({
      defaultSsr: false,
      childSsr: true,
    })
    expect(matchSsr(router, rootRoute.id)).toBe(false)
    expect(matchSsr(router, childRoute.id)).toBe(false)
  })

  test('isShell forces only the root match to ssr:true', async () => {
    const childSsr = vi.fn(() => true)
    const { router, rootRoute, childRoute } = await loadTree({
      isShell: true,
      rootSsr: false,
      childSsr,
    })
    expect(childSsr).not.toHaveBeenCalled()
    expect(matchSsr(router, rootRoute.id)).toBe(true)
    expect(matchSsr(router, childRoute.id)).toBe(false)
  })

  test.each([true, false, 'data-only'] as const)(
    'functional ssr() returning %s is inherited like a literal',
    async (result) => {
      const { router, childRoute } = await loadTree({
        childSsr: async () => result,
      })
      expect(matchSsr(router, childRoute.id)).toBe(result)
    },
  )
})
