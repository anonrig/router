// Leaf helpers shared by the client and server load pipelines. This module
// must not import `load-client.ts` or `load-server.ts` so each loader stays
// out of the other's bundle graph (see tests/dce.test.ts).
import { isNotFound } from './not-found'
import { isRedirect } from './redirect'
import { loadRouteChunk } from './load-chunk'
import type { ParsedLocation } from './location'
import type { AnyRouteMatch } from './matches'
import type { NotFoundError } from './not-found'
import type { AnyRedirect } from './redirect'
import type { AnyRoute } from './route'
import type { AnyRouter } from './router'

export const SUCCESS = 0
export const ERROR = 1
export const NOT_FOUND = 2
// Control outcomes stay contiguous so the hot path can test them together.
export const REDIRECTED = 3

/**
 * Terminal loader outcomes shared by both pipelines. Each side extends this
 * with its own control kind (client `CANCELED`, server `SKIPPED`).
 */
export type SharedLoaderOutcome =
  | [kind: typeof SUCCESS, data: unknown]
  | [kind: typeof ERROR, error: unknown]
  | [kind: typeof NOT_FOUND, error: NotFoundError]
  | [kind: typeof REDIRECTED, redirect: AnyRedirect]

export function getRoute(router: AnyRouter, match: AnyRouteMatch): AnyRoute {
  return (router.routesById as Record<string, AnyRoute>)[match.routeId]!
}

export function navigateFrom(router: AnyRouter, location: ParsedLocation) {
  return (opts: any) =>
    router.navigate({
      ...opts,
      _fromLocation: location,
    })
}

/** Route loaders accept either a bare function or a `{ handler }` object. */
export function resolveRouteLoader(routeLoader: AnyRoute['options']['loader']) {
  return typeof routeLoader === 'function' ? routeLoader : routeLoader?.handler
}

export function normalize(
  value: unknown,
  rejected: boolean,
  routeId?: string,
): SharedLoaderOutcome {
  if (isRedirect(value)) {
    return [REDIRECTED, value]
  }
  if (isNotFound(value)) {
    if (routeId) value.routeId ||= routeId
    return [NOT_FOUND, value]
  }
  if (rejected && typeof (value as any)?.then === 'function') {
    value = new Error('A Promise was thrown', { cause: value })
  }
  return rejected ? [ERROR, value] : [SUCCESS, value]
}

/**
 * Deferred route options that must resolve before the route is usable.
 * Component-only `.lazy()` routes have no such pending work.
 */
export function pendingRouteOptions(route: AnyRoute): Promise<void> | undefined {
  if (!route._lazyOptions || !route.lazyFn || route._lazy === true) return
  return loadRouteChunk(route, false) || undefined
}

/**
 * Walks up from the failure (or planned) index to the closest route with a
 * `notFoundComponent`, awaiting lazy chunks through the side-specific
 * `awaitChunk` adapter (which owns abort semantics).
 */
export async function findNotFoundBoundary(
  router: AnyRouter,
  matches: Array<AnyRouteMatch>,
  indexed: readonly [number, ReadonlyArray<unknown>, ...Array<unknown>] | undefined,
  awaitChunk: (loading: Promise<unknown> | undefined) => void | Promise<unknown>,
  fallback = 0,
): Promise<number> {
  const cause = indexed?.[1][1] as NotFoundError | undefined
  let index = cause?.routeId
    ? matches.findIndex((match) => match.routeId === cause.routeId)
    : (indexed?.[0] ?? matches.length - 1)
  if (index < 0) {
    index = 0
  }
  for (let i = index; i >= 0; i--) {
    const route = getRoute(router, matches[i]!)
    const pending = awaitChunk(loadRouteChunk(route, false) || undefined)
    if (pending) await pending
    if (route.options.notFoundComponent) {
      return i
    }
  }
  return cause?.routeId ? index : fallback
}
