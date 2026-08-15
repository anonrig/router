import { hydrateSsrMatchId } from './ssr/ssr-match-id'
import type { GLOBAL_TSR } from './ssr/constants'
import type { AnySerializationAdapter } from './ssr/serializer/transformer-types'
import type { DehydratedMatch, TsrSsrGlobal } from './ssr/types'
import type { AnyRouteMatch } from './matches'
import type { AnyRoute } from './route'

type RouteComponentType = 'component' | 'pendingComponent' | 'errorComponent' | 'notFoundComponent'

declare global {
  interface Window {
    [GLOBAL_TSR]?: TsrSsrGlobal
  }
}

export function replaceRouteChunk(route: AnyRoute, lazyFn?: AnyRoute['lazyFn']): void {
  route.lazyFn = lazyFn ?? route.lazyFn
  route._lazy = undefined
}

function preloadComponent(route: AnyRoute, type: RouteComponentType): Promise<void> | undefined {
  return (route.options[type] as { preload?: () => Promise<void> } | undefined)?.preload?.()
}

function loadComponents(route: AnyRoute, onPendingReady?: () => void): Promise<void> | undefined {
  const component = preloadComponent(route, 'component')
  const pending = preloadComponent(route, 'pendingComponent')
  const pendingReady = onPendingReady && pending ? pending.then(onPendingReady) : pending
  if (onPendingReady && !pending) onPendingReady()
  if (component && pendingReady) {
    return Promise.all([component, pendingReady]).then(() => undefined)
  }
  return component ?? pendingReady
}

export function loadRouteChunk(
  route: AnyRoute,
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
  if (!route.lazyFn) return afterLazy()

  const promise = route.lazyFn().then(
    (lazyRoute: any) => {
      const { id: _id, ...options } = lazyRoute.options ?? lazyRoute
      Object.assign(route.options, options)
      route._lazy = true
      return undefined
    },
    (error: unknown) => {
      route._lazy = undefined
      throw error
    },
  )
  route._lazy = promise
  return promise.then(afterLazy)
}

export async function loadClientRoute(route: AnyRoute) {
  await loadRouteChunk(route)
}

export async function preloadClientRoute(route: AnyRoute) {
  await loadRouteChunk(route)
}

export async function refreshClientRoute(route: AnyRoute) {
  replaceRouteChunk(route)
  await loadRouteChunk(route)
}

export function _getRenderedMatches(matches: Array<AnyRouteMatch> = []): Array<AnyRouteMatch> {
  const end = matches.findIndex((match) => match.status !== 'success' || match._notFound) + 1
  return end && end < matches.length ? matches.slice(0, end) : matches
}

export function _getAssetMatches(matches: Array<AnyRouteMatch> = []): Array<AnyRouteMatch> {
  let end = matches.length
  for (let index = 0; index < end; index++) {
    const match = matches[index]!
    if (match._assetEnd !== undefined) {
      end = Math.min(end, Math.max(index + 1, match._assetEnd))
      continue
    }
    if (match.status !== 'success' || match._notFound) {
      end = index + 1
      break
    }
  }
  return end < matches.length ? matches.slice(0, end) : matches
}

function applyDehydrated(candidate: any, dehydrated: DehydratedMatch) {
  if ('l' in dehydrated) candidate.loaderData = dehydrated.l
  candidate.status = dehydrated.s
  candidate.ssr = dehydrated.ssr
  candidate.updatedAt = dehydrated.u
  candidate.error = dehydrated.e
  candidate._notFound ||= dehydrated.g
  if (dehydrated.b) candidate.__beforeLoadContext = dehydrated.b
}

export async function hydrate(router: any): Promise<void> {
  const tsr = typeof window !== 'undefined' ? window.$_TSR : undefined
  const adapters = router.options.serializationAdapters as
    | Array<AnySerializationAdapter>
    | undefined

  if (tsr) {
    if (adapters?.length) {
      tsr.t = new Map(adapters.map((adapter) => [adapter.key, adapter.fromSerializable]))
      tsr.buffer.forEach((script) => script())
    }
    tsr.initialized = true
  }

  const dehydratedRouter = tsr?.router ?? router.options.dehydratedData ?? router.ssr?.dehydrated
  if (dehydratedRouter?.manifest) {
    router.ssr = { ...(router.ssr ?? {}), manifest: dehydratedRouter.manifest }
  }

  if (typeof document !== 'undefined') {
    router.options.ssr = {
      ...(router.options.ssr ?? {}),
      nonce: (document.querySelector('meta[property="csp-nonce"]') as HTMLMetaElement | undefined)
        ?.content,
    }
  }

  if (router.options.hydrate && dehydratedRouter?.dehydratedData !== undefined) {
    await router.options.hydrate(dehydratedRouter.dehydratedData)
  }

  if (router.updateLatestLocation) router.updateLatestLocation()
  else if (router.history) {
    router.latestLocation = router.parseLocation(router.history.location, router.latestLocation)
  }

  const location = router.latestLocation ?? router.state?.location
  const dehydratedMatches: DehydratedMatch[] = dehydratedRouter?.matches ?? []

  let candidates: any[] = []
  if (location && typeof router.matchRoutes === 'function') {
    candidates = router.matchRoutes(location) ?? []
  } else if (location) {
    await router.load?.()
    candidates = [...(router.state?.matches ?? [])]
  }

  const committed: any[] = []
  const shared = Math.min(dehydratedMatches.length, candidates.length || dehydratedMatches.length)

  for (let index = 0; index < shared; index++) {
    const candidate = candidates[index]
    const dehydrated = dehydratedMatches[index]!
    if (!candidate) break
    if (typeof dehydrated.i === 'string' && hydrateSsrMatchId(dehydrated.i) !== candidate.id) {
      break
    }
    applyDehydrated(candidate, dehydrated)
    const route = router.routesById?.[candidate.routeId]
    if (route) route.options.ssr = candidate.ssr
    committed.push(candidate)
    if (
      candidate.status === 'error' ||
      candidate.status === 'notFound' ||
      candidate.status === 'pending' ||
      candidate._notFound
    ) {
      break
    }
  }

  if (committed.length) {
    const nextLocation = dehydratedRouter?.location ?? location ?? router.state.location
    router.stores?.state.set({
      ...router.state,
      matches: committed,
      pendingMatches: candidates.length > committed.length ? candidates : undefined,
      location: nextLocation,
      resolvedLocation: nextLocation,
      status: committed.every((m) => m.status === 'success') ? 'idle' : 'pending',
      isLoading: committed.some((m) => m.status === 'pending'),
    })
    router.stores?.matches?.set?.(committed)
    if (nextLocation) router.stores?.location?.set?.(nextLocation)
  }

  await Promise.all(
    committed.map(async (match) => {
      const route = router.routesById?.[match.routeId]
      if (!route) return
      if (match._notFound) {
        await Promise.all([loadRouteChunk(route), loadRouteChunk(route, 'notFoundComponent')])
      } else {
        await loadRouteChunk(
          route,
          match.status === 'error'
            ? 'errorComponent'
            : match.status === 'notFound'
              ? 'notFoundComponent'
              : undefined,
        )
      }
    }),
  )

  if (tsr) tsr.hydrated = true

  const needsClientLoad =
    !committed.length ||
    committed.some((m) => m.status === 'pending') ||
    (candidates.length > 0 && committed.length < candidates.length)

  if (needsClientLoad) await router.load?.()
}
