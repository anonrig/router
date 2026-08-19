import { describe, expect, it } from 'vitest'
import { createRootRoute, createRoute } from '../src/route'
import { processRouteTree, findSingleMatch, findRouteMatch } from '../src/match-compat'

describe('segment-tree deep optional bitmask', () => {
  it('keeps shallow optional params when a deep optional is skipped', () => {
    const root = createRootRoute()
    const statics = Array.from({ length: 31 }, (_, i) => `s${i}`).join('/')
    const pattern = `/{-$p0}/${statics}/{-$p32}/tail`
    root.addChildren([createRoute({ getParentRoute: () => root, path: pattern })] as any)
    const { processedTree } = processRouteTree(root as any)
    const match = findSingleMatch(pattern, false, false, `/value/${statics}/tail`, processedTree)
    expect(match?.rawParams).toEqual({ p0: 'value' })
  })

  it('still binds an optional when 33 optionals precede /tail', () => {
    const root = createRootRoute()
    const segments = Array.from({ length: 33 }, (_, i) => `{-$p${i}}`)
    const pattern = `/${segments.join('/')}/tail`
    root.addChildren([createRoute({ getParentRoute: () => root, path: pattern })] as any)
    const { processedTree } = processRouteTree(root as any)
    const match = findSingleMatch(pattern, false, false, '/value/tail', processedTree)
    expect(match?.rawParams).not.toEqual({})
    expect(Object.keys(match?.rawParams ?? {})).toHaveLength(1)
  })

  it('matches pathless route groups and slot layouts with param parsers in segment tree', () => {
    const root = createRootRoute()
    const auth = createRoute({
      getParentRoute: () => root,
      id: '(auth)',
      params: {
        parse: (params: any) => params,
      },
    })
    const login = createRoute({
      getParentRoute: () => auth,
      path: '/login',
    })
    root.addChildren([auth.addChildren([login])])
    const { processedTree } = processRouteTree(root as any)
    const match = findRouteMatch('/login', processedTree)
    expect(match).not.toBeNull()
    expect(match?.route.id).toBe('/(auth)/login')
    expect(match?.branch.map((r: any) => r.id)).toEqual(['__root__', '/(auth)', '/(auth)/login'])
  })
})
