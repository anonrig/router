import type { AnyRouteMatch } from './matches'
import type { AnyRoute } from './route'

type RouteComponentType = 'component' | 'pendingComponent' | 'errorComponent' | 'notFoundComponent'

export function replaceRouteChunk(route: AnyRoute, lazyFn: AnyRoute['lazyFn']): void {
  route.lazyFn = lazyFn ?? route.lazyFn
  route._lazy = undefined
}

function preloadComponent(route: AnyRoute, type: RouteComponentType): Promise<void> | undefined {
  return (route.options[type] as any)?.preload?.()
}

function loadComponents(route: AnyRoute, onPendingReady?: () => void): Promise<void> | undefined {
  const component = preloadComponent(route, 'component')
  const pending = preloadComponent(route, 'pendingComponent')
  const pendingReady = onPendingReady && pending ? pending.then(onPendingReady) : pending
  if (onPendingReady && !pending) {
    onPendingReady()
  }
  if (component && pendingReady) {
    return Promise.all([component, pendingReady]).then(() => undefined)
  }
  return component ?? pendingReady
}

export function loadRouteChunk(
  route: AnyRoute,
  // `false` waits only for lazy route options, before a boundary is selected.
  componentType?: 'errorComponent' | 'notFoundComponent' | false,
  onPendingReady?: () => void,
): Promise<void> | undefined {
  const afterLazy = () =>
    componentType === false
      ? undefined
      : componentType
        ? preloadComponent(route, componentType)
        : loadComponents(route, onPendingReady)
  const current = route._lazy
  if (current) {
    return current === true ? afterLazy() : current.then(afterLazy)
  }
  if (!route.lazyFn) {
    return afterLazy()
  }

  const promise = route.lazyFn().then(
    (lazyRoute) => {
      // HMR clears the owner before an obsolete import can settle.
      if (process.env.NODE_ENV === 'production' || route._lazy === promise) {
        const { id: _id, ...options } = lazyRoute.options
        Object.assign(route.options, options)
        route._lazy = true
      }
      return undefined
    },
    (error) => {
      if (process.env.NODE_ENV === 'production' || route._lazy === promise) {
        route._lazy = undefined
      }
      throw error
    },
  )
  route._lazy = promise
  return promise.then(afterLazy)
}

/** Return the structural lane through the first terminal render boundary. */
export function _getRenderedMatches(matches: Array<AnyRouteMatch>): Array<AnyRouteMatch> {
  const end = matches.findIndex((match) => match.status !== 'success' || match._notFound) + 1
  return end && end < matches.length ? matches.slice(0, end) : matches
}

/** Return the lane whose document assets belong to the current presentation. */
export function _getAssetMatches(matches: Array<AnyRouteMatch>): Array<AnyRouteMatch> {
  let end = matches.length
  for (let index = 0; index < end; index++) {
    const match = matches[index]!
    // `_assetEnd` is only ever set on hydration presentation clones that are
    // `status: 'pending'`, `ssr: 'data-only'`, error-free, and not not-found
    // (see hydrate.ts), and commits clear it — so its presence alone is the guard.
    if (match._assetEnd !== undefined) {
      end = Math.min(end, Math.max(index + 1, match._assetEnd))
      continue
    }
    if (match.status !== 'success' || match._notFound) {
      end = index + 1
      break
    }
  }
  // `end` only ever shrinks to `index + 1 >= 1`, so no zero guard is needed.
  return end < matches.length ? matches.slice(0, end) : matches
}
