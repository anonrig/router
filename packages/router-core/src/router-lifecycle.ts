import type { AnyRouteMatch as RouteMatch } from './matches'
import type { AnyRouter } from './router'

/** Run route lifecycle callbacks in leave/enter/stay phases. */
export function runRouteLifecycle(
  router: AnyRouter,
  previous: Array<RouteMatch>,
  matches: Array<RouteMatch>,
  isCurrent?: () => boolean,
): void {
  for (const match of previous) {
    if (isCurrent?.() === false) return
    if (!matches.some((candidate) => candidate.routeId === match.routeId)) {
      router.routesById[match.routeId]?.options.onLeave?.(match)
    }
  }
  for (const match of matches) {
    if (isCurrent?.() === false) return
    const route = router.routesById[match.routeId]
    if (!route) continue
    route.options[
      previous.some((candidate) => candidate.routeId === match.routeId) ? 'onStay' : 'onEnter'
    ]?.(match)
  }
}
