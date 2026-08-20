import { hydrateSsrMatchId } from './ssr/ssr-match-id'
import { loadRouteChunk } from './load-chunk'
import { ABORT_REASON } from './abort-reason'
import { getRoute, navigateFrom } from './load-shared'
import { cacheLoaderMatch, projectLane, transferMatchResources, waitFor } from './load-match'
import { matchParentContext, type AnyRouter } from './router'
import type { GLOBAL_SEROVAL, GLOBAL_TSR } from './ssr/constants'
import type { AnySerializationAdapter } from './ssr/serializer/transformer-types'
import type { TsrSsrGlobal } from './ssr/types'
import type { AnyRouteMatch } from './matches'

declare global {
  interface Window {
    [GLOBAL_TSR]?: TsrSsrGlobal
    [GLOBAL_SEROVAL]?: any
  }
}

export async function hydrate(router: AnyRouter): Promise<void> {
  if (process.env.NODE_ENV !== 'production' && !window.$_TSR) {
    throw new Error(
      'Invariant failed: Expected to find bootstrap data on window.$_TSR, but we did not. Please file an issue!',
    )
  }
  const tsr = window.$_TSR!

  const adapters = router.options.serializationAdapters as
    | Array<AnySerializationAdapter>
    | undefined
  if (adapters?.length) {
    tsr.t = new Map(adapters.map((adapter) => [adapter.key, adapter.fromSerializable]))
    tsr.buffer.forEach((script) => script())
  }
  tsr.initialized = true

  const dehydratedRouter = tsr.router
  if (process.env.NODE_ENV !== 'production' && !dehydratedRouter) {
    throw new Error(
      'Invariant failed: Expected to find a dehydrated data on window.$_TSR.router, but we did not. Please file an issue!',
    )
  }
  router.ssr = { manifest: dehydratedRouter!.manifest }
  router.options.ssr = {
    nonce: (document.querySelector('meta[property="csp-nonce"]') as HTMLMetaElement | undefined)
      ?.content,
  }

  const dehydratedMatches = dehydratedRouter!.matches

  const controller = new AbortController()
  const previousPreflight = router._preflight
  router._preflight = controller
  previousPreflight?.abort(ABORT_REASON)
  const isCurrent = () => router._preflight === controller

  let location!: AnyRouter['latestLocation']
  let candidates!: Array<AnyRouteMatch>
  let handoffHistoryHref!: string
  let handoffHistoryState: unknown
  try {
    await waitFor(router.options.hydrate?.(dehydratedRouter!.dehydratedData), controller.signal)
    if (!isCurrent()) {
      return
    }
    const historyLocation = router.history.location
    handoffHistoryHref = historyLocation.href
    handoffHistoryState = historyLocation.state
    router.updateLatestLocation()
    location = router.latestLocation
    router.stores.location.set(location)
    candidates = router.matchRoutes(location, {
      _controller: controller,
    })
  } catch (cause) {
    if (isCurrent()) {
      router._preflight = undefined
    }
    controller.abort(cause)
    if (cause !== controller.signal) {
      throw cause
    }
  }
  if (!isCurrent()) {
    return
  }
  const committed: Array<AnyRouteMatch> = []
  let pendingBoundary: number | undefined
  let verifiedAssetEnd = 0
  const retryFrom = (index: number) => {
    verifiedAssetEnd = Math.min(verifiedAssetEnd, index + 1)
    const removed = committed.splice(index)
    for (const match of removed) {
      if (
        getRoute(router, match).options.loader &&
        (match.status === 'success' || (!match.invalid && 'loaderData' in match))
      ) {
        cacheLoaderMatch(
          router,
          {
            ...match,
            status: 'success',
            error: undefined,
            preload: true,
          },
          router._cache[match.id],
        )
      }
    }
    transferMatchResources(router, removed)
  }

  const shared =
    dehydratedMatches.length > candidates.length
      ? candidates.findIndex((match) => match._notFound) + 1
      : dehydratedMatches.length
  let isTerminal = false
  for (let index = 0; index < shared; index++) {
    const candidate = candidates[index]!
    const dehydrated = dehydratedMatches[index]!
    if (typeof dehydrated.i !== 'string' || hydrateSsrMatchId(dehydrated.i) !== candidate.id) {
      pendingBoundary ??= index
      break
    }
    verifiedAssetEnd = index + 1
    const route = getRoute(router, candidate)
    if (
      'l' in dehydrated ||
      (dehydrated.s === 'success' && dehydrated.e === undefined && route.options.loader)
    ) {
      candidate.loaderData = dehydrated.l
    }
    candidate.status = dehydrated.s
    candidate.ssr = dehydrated.ssr
    route.options.ssr = candidate.ssr
    candidate.updatedAt = dehydrated.u
    candidate.error = dehydrated.e
    candidate._notFound ||= dehydrated.g
    const terminal =
      candidate.status === 'error' || candidate.status === 'notFound' || candidate._notFound
    if (terminal) {
      isTerminal = true
      committed.push(candidate)
      if (candidate.ssr === false || candidate.ssr === 'data-only') {
        pendingBoundary ??= index
      }
      break
    }
    if (candidate.status === 'pending') {
      pendingBoundary ??= index
      break
    }

    committed.push(candidate)
    if (candidate.ssr === 'data-only') {
      pendingBoundary ??= index
    }
  }
  if (!isTerminal && committed.length === shared && shared < candidates.length) {
    pendingBoundary = shared
  }

  const chunks = committed.map(async (match) => {
    try {
      const route = getRoute(router, match)
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
      return true
    } catch {
      return false
    }
  })
  let chunkFailure = 0
  try {
    while (
      chunkFailure < chunks.length &&
      (await waitFor(chunks[chunkFailure]!, controller.signal))
    ) {
      chunkFailure++
    }
  } catch {
    return
  }
  if (!isCurrent()) {
    return
  }
  if (chunkFailure < committed.length) {
    retryFrom(chunkFailure)
  }

  const contextEnd = Math.max(
    pendingBoundary === committed.length ? committed.length + 1 : committed.length,
    chunkFailure < chunks.length ? chunkFailure : verifiedAssetEnd,
  )
  for (let index = 0; index < contextEnd; index++) {
    const match = candidates[index]!
    const route = getRoute(router, match)
    const parentContext =
      matchParentContext(candidates, index, match) ?? router.options.context ?? {}
    let routeContext
    if (route.options.context) {
      try {
        routeContext = match._ctx =
          route.options.context({
            deps: match.loaderDeps,
            params: match.params,
            context: parentContext,
            location,
            navigate: navigateFrom(router, location),
            buildLocation: router.buildLocation,
            cause: match.cause,
            abortController: controller,
            preload: false,
            matches: candidates,
            routeId: route.id,
          }) || {}
      } catch {
        if (!isCurrent()) {
          return
        }
        if (match.status !== 'error' && match.status !== 'notFound' && !match._notFound) {
          retryFrom(index)
          break
        }
      }
      if (!isCurrent()) {
        return
      }
    }
    match.context = {
      ...parentContext,
      ...routeContext,
      ...(committed[index] && dehydratedMatches[index]!.b),
    }
  }

  await projectLane(router, [location, candidates] as any, controller.signal, 0, verifiedAssetEnd)
  if (!isCurrent()) {
    return
  }
  const needsClientLoad = pendingBoundary !== undefined || committed.length < shared
  const committedMatches = isTerminal && committed.length === shared ? candidates : committed
  let presented = needsClientLoad ? candidates : committedMatches
  let dataOnlyAssetEnd: number | undefined
  if (needsClientLoad && pendingBoundary !== undefined) {
    const boundary = presented[pendingBoundary]!
    dataOnlyAssetEnd =
      boundary.ssr === 'data-only' && verifiedAssetEnd > pendingBoundary + 1
        ? verifiedAssetEnd
        : undefined
    presented = presented.slice()
    presented[pendingBoundary] = {
      ...boundary,
      status: 'pending',
      ssr: boundary.ssr === 'data-only' ? 'data-only' : false,
      _assetEnd: dataOnlyAssetEnd,
    }
  }

  const claim = () => {
    const historyLocation = router.history.location
    return needsClientLoad &&
      !router._tx &&
      historyLocation.href === handoffHistoryHref &&
      historyLocation.state === handoffHistoryState &&
      router._committed === committedMatches &&
      committedMatches.length &&
      !controller.signal.aborted
      ? controller
      : undefined
  }
  const handoff: NonNullable<AnyRouter['_handoff']> = [
    claim,
    (matches: AnyRouteMatch[] | undefined) => {
      if (router._handoff !== handoff) {
        return
      }
      router._handoff = undefined
      const prefix = committedMatches.length
      if (
        !matches ||
        !claim() ||
        committedMatches.some((match, index) => match.id !== matches[index]?.id)
      ) {
        controller.abort(ABORT_REASON)
        return
      }
      let handoffAssetEnd = dataOnlyAssetEnd
      if (handoffAssetEnd !== undefined) {
        for (let index = prefix; index < handoffAssetEnd; index++) {
          if (candidates[index]?.id !== matches[index]?.id) {
            handoffAssetEnd = index > pendingBoundary! + 1 ? index : undefined
            break
          }
        }
      }
      const clones = committedMatches.map((match) => ({ ...match }))
      if (handoffAssetEnd !== undefined) {
        clones[pendingBoundary!]!._assetEnd = handoffAssetEnd
      }
      transferMatchResources(router, matches.splice(0, prefix, ...clones))
      for (let index = prefix; index < matches.length; index++) {
        const match = matches[index]!
        const hydrated = candidates[index]
        if (hydrated?.id === match.id && hydrated?._ctx) {
          match._ctx = hydrated._ctx
        }
        match.abortController = controller
      }
      return prefix
    },
  ]
  router._committed = committedMatches
  router._handoff = handoff
  router._preflight = undefined
  router.batch(() => {
    router.stores.setMatches(presented)
    router.stores.status.set('idle')
    if (!needsClientLoad) {
      router.stores.resolvedLocation.set(router.stores.location.get())
    }
  })
}
