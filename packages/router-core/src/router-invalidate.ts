import type { AnyRouteMatch as RouteMatch } from './matches'
import type { AnyRoute } from './route'

function routeNeedsLoad(route: AnyRoute | undefined): unknown {
  return (
    route?.options?.loader ||
    route?.options?.beforeLoad ||
    route?.lazyFn ||
    (route?.options?.component as any)?.preload ||
    (route?.options?.pendingComponent as any)?.preload
  )
}

export function invalidateRouter(
  router: {
    _committed: RouteMatch[]
    state: { matches: RouteMatch[] }
    _preloads?: Map<AbortController, RouteMatch[]>
    _cache: Record<string, RouteMatch>
    _tx?: [unknown, unknown, unknown, RouteMatch[]]
    _flights?: { delete(id: string): void }
    routesById: Record<string, AnyRoute>
    shouldViewTransition: any
    _matchesByPath?: { clear(): void }
    load: (opts?: { sync?: boolean }) => Promise<void>
  },
  opts?: { filter?: (match: any) => boolean; forcePending?: boolean; sync?: boolean },
) {
  const filter = opts?.filter
  const committedMatches = router._committed.length ? router._committed : router.state.matches
  const preloads = router._preloads
  const invalidIds = new Set<string>()
  const consider = (match: RouteMatch | undefined) => {
    if (match && (!filter || filter(match as any))) invalidIds.add(match.id)
  }
  for (let i = 0; i < committedMatches.length; i++) consider(committedMatches[i])
  for (const id in router._cache) consider(router._cache[id])
  if (preloads) {
    for (const preloadMatches of preloads.values()) {
      for (let i = 0; i < preloadMatches.length; i++) consider(preloadMatches[i])
    }
  }
  const txMatches = router._tx?.[3]
  if (txMatches) {
    for (let i = 0; i < txMatches.length; i++) consider(txMatches[i])
  }
  const discardedPreloads: Array<AbortController> = []
  for (const [controller, matches] of preloads ?? []) {
    if (matches.some((match) => invalidIds.has(match.id))) {
      preloads!.delete(controller)
      discardedPreloads.push(controller)
    }
  }
  const invalidateMatch = (d: RouteMatch) => {
    if (invalidIds.has(d.id)) {
      const route = router.routesById[d.routeId] as AnyRoute
      const next = {
        ...d,
        invalid: true,
        ...((opts?.forcePending || d.status === 'error' || d.status === 'notFound') &&
        routeNeedsLoad(route)
          ? ({ status: 'pending', error: undefined } as const)
          : undefined),
      }
      ;(d as RouteMatch & { _flight?: any })._flight = undefined
      return next
    }
    return d
  }

  router._committed = committedMatches.map(invalidateMatch)
  for (const id in router._cache) {
    const match = router._cache[id]!
    if (invalidIds.has(id)) {
      match.invalid = true
      if (opts?.forcePending) match.status = 'pending'
    }
  }
  for (const id of invalidIds) {
    router._flights?.delete(id)
  }
  for (const controller of discardedPreloads) {
    controller.abort()
  }

  router.shouldViewTransition = false
  router._matchesByPath?.clear()
  return router.load({ sync: opts?.sync })
}
