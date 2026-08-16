import type { ParsedLocation } from './location'
import type { AnyRouteMatch } from './matches'
import type { AnyRouter } from './router'

export function runRouteLifecycle(
  router: AnyRouter,
  previous: Array<AnyRouteMatch>,
  matches: Array<AnyRouteMatch>,
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

export function getLocationChangeInfo(location: ParsedLocation, resolvedLocation?: ParsedLocation) {
  return {
    fromLocation: resolvedLocation,
    toLocation: location,
    pathChanged: resolvedLocation?.pathname !== location.pathname,
    hrefChanged: resolvedLocation?.href !== location.href,
    hashChanged: resolvedLocation?.hash !== location.hash,
  }
}
