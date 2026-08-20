// Keep this filename free of a secondary extension so declaration generation
// can rewrite relative imports for both ESM and CJS.
import { isNotFound } from './not-found'
import { objectValues } from './utils'
import { isRedirect } from './redirect'
import { _getRenderedMatches, loadRouteChunk } from './load-chunk'
import { getLocationChangeInfo, matchParentContext, runRouteLifecycle } from './router'
import {
  findNotFoundBoundary,
  getRoute,
  navigateFrom,
  pendingRouteOptions,
  resolveRouteLoader,
} from './load-shared'
import type { ParsedLocation } from './location'
import type { AnyRouteMatch } from './matches'
import type { NotFoundError } from './not-found'
import type {
  AnyRoute,
  BeforeLoadContextOptions,
  LoaderFnContext,
  RouteContextOptions,
  RouteLoaderFn,
} from './route'
import type { AnyRedirect } from './redirect'
import type { AnyRouter } from './router'

export { getRoute, navigateFrom }

declare const lanePhase: unique symbol

type LanePhase = 'matched' | 'contextualized' | 'reduced' | 'projected'

/**
 * Lane matches carry their lane's phase so functions can demand evidence of
 * pipeline position (e.g. `commitMatches` only accepts a projected lane's
 * matches). The brand is phantom — it never exists at runtime.
 */
type LaneMatches<TPhase extends LanePhase> = Array<WorkMatch> & {
  readonly [lanePhase]?: TPhase
}

type Lane<TPhase extends LanePhase> = [
  location: ParsedLocation,
  matches: LaneMatches<TPhase>,
  background?: Array<BackgroundLoaderTask>,
  backgroundSettlement?: Promise<IndexedOutcome | undefined>,
] & { readonly [lanePhase]?: TPhase }

type MatchedLane = Lane<'matched'>
type ContextualizedLane = Lane<'contextualized'>
type ReducedLane = Lane<'reduced'>
type ProjectedLane = Lane<'projected'>

// Local numeric literals (matching `load-shared`) so the JIT mid-tier folds
// them as constants; imported bindings read through the module cell instead.
const SUCCESS = 0
const ERROR = 1
const NOT_FOUND = 2
// Control outcomes stay contiguous so the hot path can test them together.
const REDIRECTED = 3
const CANCELED = 4

type RedirectOutcome = [kind: typeof REDIRECTED, redirect: AnyRedirect, location?: ParsedLocation]

type LoaderOutcome =
  | [kind: typeof SUCCESS, data: unknown]
  | [kind: typeof ERROR, error: unknown]
  | [kind: typeof NOT_FOUND, error: NotFoundError]
  | RedirectOutcome
  | [kind: typeof CANCELED]

type IndexedOutcome = [index: number, outcome: LoaderOutcome, boundary?: number]

export type LoaderFlight = [
  outcome: Promise<LoaderOutcome>,
  controller: AbortController,
  leases: number,
]

type WorkMatch = AnyRouteMatch & {
  _flight?: LoaderFlight
}

declare const matchPhase: unique symbol

/**
 * A match whose loader outcome has been applied by `settleInto`, which is the
 * sole granter of this brand (phantom, zero-runtime). Consumers that require
 * it — e.g. `cacheLoaderMatch` — can only be reached after settlement, so the
 * compiler enforces the loader→settle→cache ordering. Sources that arrive
 * already settled (dehydrated server data) must cast at a named boundary.
 */
type SettledMatch = WorkMatch & { readonly [matchPhase]: 'settled' }

export type LoadTransaction = [
  controller: AbortController,
  redirects: number,
  location: ParsedLocation,
  matches: Array<AnyRouteMatch>,
  startedAt: number,
  done: Promise<void>,
  /**
   * Dev-only HMR refresh mode. Presence forces successor rematerialization
   * until this publication is acknowledged. The optional hydration handoff is
   * retired when the refresh publishes.
   */
  refresh?: [handoff: NonNullable<AnyRouter['_handoff']> | undefined],
]

export type CoordinatorRouter = AnyRouter & {
  /** Active speculative lanes retained for cancellation, invalidation, and cache clearing. */
  _preloads?: Map<AbortController, Array<AnyRouteMatch>>
  _refreshNextLoad?: boolean
}

type LoaderTask = [
  index: number,
  outcome: Promise<LoaderOutcome>,
  chunkFailure: Promise<IndexedOutcome | undefined>,
  candidate?: WorkMatch,
]

type BackgroundLoaderTask = [
  index: number,
  outcome: Promise<LoaderOutcome>,
  chunkFailure: Promise<IndexedOutcome | undefined>,
  candidate: WorkMatch,
]

type ExecuteLaneOptions = [
  controller: AbortController,
  redirects: number,
  isCurrent: () => boolean,
  base: Array<AnyRouteMatch>,
  preload?: boolean,
  sync?: boolean,
  forceStaleReload?: boolean,
  resolvedPrefix?: number,
  onReady?: () => void,
]

type ControlOutcome = RedirectOutcome | [kind: typeof CANCELED]

type LaneResult = ProjectedLane | ControlOutcome

// Same helpers as `load-match.ts` (hydrate-safe copy). Keep both in sync.
export function waitFor<T>(value: T | PromiseLike<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    return Promise.race([Promise.reject(signal), value])
  }
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal)
    signal.addEventListener('abort', abort, { once: true })
    Promise.resolve(value)
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', abort))
      .catch(reject)
  })
}

function releaseOwnedFlight(
  router: AnyRouter,
  match: WorkMatch,
  flight?: LoaderFlight,
): AbortController | undefined {
  if (!flight || --flight[2 /* leases */]) {
    return
  }
  const flights = router._flights
  if (flights && flights[match.id] === flight) {
    const current = router._tx
    if (
      current &&
      !current[0 /* controller */].signal.aborted &&
      !(process.env.NODE_ENV !== 'production' && current[6 /* refresh */]) &&
      !current[3 /* matches */].includes(match) &&
      current[3 /* matches */].some((candidate: AnyRouteMatch) => candidate.id === match.id) &&
      current[3 /* matches */].some(
        (candidate: AnyRouteMatch) => candidate.isFetching === 'beforeLoad',
      )
    ) {
      return
    }
    delete flights[match.id]
  }
  return flight[1 /* controller */]
}

function releaseFlight(router: AnyRouter, match: AnyRouteMatch): void {
  const work = match as WorkMatch
  const flight = work._flight
  work._flight = undefined
  releaseOwnedFlight(router, work, flight)?.abort()
}

export function transferMatchResources(
  router: AnyRouter,
  previous: Array<AnyRouteMatch>,
  next?: Array<AnyRouteMatch>,
  deferSameIdFlight?: true,
): void {
  const abort: Array<AbortController> = []
  for (const match of previous as Array<WorkMatch>) {
    if (!next?.includes(match)) {
      const flight = match._flight
      match._flight = undefined
      if (
        deferSameIdFlight &&
        flight?.[2 /* leases */] === 1 &&
        router._flights?.[match.id] === flight &&
        !(process.env.NODE_ENV !== 'production' && router._tx?.[6 /* refresh */]) &&
        next?.some((candidate) => candidate.id === match.id)
      ) {
        flight[2 /* leases */] = 0
      } else {
        const controller = releaseOwnedFlight(router, match, flight)
        if (controller) {
          abort.push(controller)
        }
      }
    }
  }
  for (const controller of abort) {
    controller.abort()
  }
}

export function cacheLoaderMatch(
  router: AnyRouter,
  match: AnyRouteMatch,
  planned: AnyRouteMatch | undefined,
): void {
  const current = router._cache[match.id] as WorkMatch | undefined
  const settled = match as WorkMatch
  if (
    current !== planned ||
    router._committed.some(
      (candidate: AnyRouteMatch) =>
        candidate.id === match.id && (candidate as WorkMatch)._flight === settled._flight,
    )
  ) {
    return
  }
  const cached = {
    ...settled,
    _notFound: undefined,
    context: {},
  } as WorkMatch
  if (cached._flight) {
    cached._flight[2 /* leases */]++
  }
  router._cache[match.id] = cached
  if (current) {
    releaseFlight(router, current)
  }
}

export async function projectLane(
  router: AnyRouter,
  lane: [unknown, Array<AnyRouteMatch>, ...Array<unknown>],
  signal: AbortSignal,
  start = 0,
  end = lane[1 /* matches */].length,
): Promise<any> {
  const matches = lane[1 /* matches */]
  for (let index = start; index < end; index++) {
    const match = matches[index]!
    const routeOptions = getRoute(router, match).options
    if (routeOptions.head || routeOptions.scripts) {
      try {
        const context = {
          ssr: router.options.ssr,
          matches,
          match,
          params: match.params,
          loaderData: match.loaderData,
        }
        const [head, scripts] = await waitFor(
          Promise.all([routeOptions.head?.(context), routeOptions.scripts?.(context)]),
          signal,
        )
        match.meta = head?.meta
        match.links = head?.links
        match.headScripts = head?.scripts
        match.styles = head?.styles
        match.scripts = scripts
      } catch (cause) {
        if (cause === signal && signal.aborted) {
          break
        }
        console.error(cause)
      }
    }
    if (match.status !== 'success' || match._notFound) {
      break
    }
  }
  return lane
}

function isControl(result: Lane<any> | ControlOutcome): result is ControlOutcome {
  return typeof result[0 /* location or kind */] === 'number'
}

function normalize(value: unknown, rejected: boolean, routeId?: string): LoaderOutcome {
  if (isRedirect(value)) {
    return [REDIRECTED, value]
  }
  if (isNotFound(value)) {
    value.routeId ||= routeId
    return [NOT_FOUND, value]
  }
  if (rejected && typeof (value as any)?.then === 'function') {
    value = new Error('A Promise was thrown', { cause: value })
  }
  return rejected ? [ERROR, value] : [SUCCESS, value]
}

function normalizeError(route: AnyRoute, cause: unknown): LoaderOutcome {
  let outcome = normalize(cause, true, route.id)
  if (outcome[0 /* kind */] !== ERROR) {
    return outcome
  }
  try {
    route.options.onError?.(outcome[1 /* error */])
  } catch (onErrorCause) {
    outcome = normalize(onErrorCause, true, route.id)
  }
  return outcome
}

function normalizeLaneError(
  router: AnyRouter,
  lane: Lane<any>,
  route: AnyRoute,
  cause: unknown,
  options: ExecuteLaneOptions,
): LoaderOutcome {
  if (options[0 /* controller */].signal.aborted || !options[2 /* isCurrent */]()) {
    options[0 /* controller */].abort()
    return [CANCELED]
  }
  return materializeRedirect(router, lane, route, normalizeError(route, cause), options)
}

function materializeRedirect(
  router: AnyRouter,
  lane: Lane<any>,
  route: AnyRoute,
  outcome: LoaderOutcome,
  options: ExecuteLaneOptions,
  failed?: true,
): LoaderOutcome {
  while (outcome[0 /* kind */] === REDIRECTED) {
    const redirect = outcome[1 /* redirect */]
    if (
      redirect.options.reloadDocument ? options[4 /* preload */] : options[1 /* redirects */] >= 20
    ) {
      return outcome
    }
    try {
      if (redirect.options.href && redirect.options.reloadDocument) {
        router.resolveRedirect(redirect)
        return outcome
      }
      return [
        REDIRECTED,
        redirect,
        router.buildLocation({
          ...redirect.options,
          _fromLocation: lane[0 /* location */],
          _includeValidateSearch: true,
        }),
      ]
    } catch (cause) {
      outcome = failed ? [ERROR, cause] : normalizeError(route, cause)
      failed = true
    }
  }
  return outcome
}

/** Load deferred route options for generated stubs. Component-only `.lazy()` is unchanged. */
export function ensureRouteOptions(route: AnyRoute, signal?: AbortSignal): void | Promise<void> {
  const loading = pendingRouteOptions(route)
  if (!loading) return
  return signal ? waitFor(loading, signal) : loading
}

async function contextualize(
  router: AnyRouter,
  lane: MatchedLane,
  options: ExecuteLaneOptions,
  end: number,
  planSuccessfulLane: () => void,
  retainedEnd: number,
): Promise<IndexedOutcome | undefined> {
  const [location, matches] = lane
  const signal = options[0 /* controller */].signal
  const preload = !!options[4 /* preload */]
  for (let index = options[7 /* resolvedPrefix */] ?? 0; index < end; index++) {
    const match = matches[index]!
    const route = getRoute(router, match)
    try {
      const pendingOptions = ensureRouteOptions(route, signal)
      if (pendingOptions) await pendingOptions
    } catch (cause) {
      releaseFlight(router, match)
      return [index, normalizeLaneError(router, lane, route, cause, options)]
    }

    match.abortController = options[0 /* controller */]
    // Contextualization is serial, so the previous match already contains the
    // complete parent context for this route.
    const parentContext = matchParentContext(matches, index, match) ?? router.options.context ?? {}
    const common = {
      params: match.params,
      location,
      navigate: navigateFrom(router, location),
      buildLocation: router.buildLocation,
      cause: preload ? ('preload' as const) : match.cause,
      abortController: options[0 /* controller */],
      preload,
      matches,
      routeId: route.id,
    }
    let context
    try {
      let routeContext = match._ctx
      if (!routeContext && route.options.context) {
        routeContext = match._ctx =
          route.options.context({
            ...common,
            deps: match.loaderDeps,
            context: parentContext,
          } satisfies RouteContextOptions<any, any, any, any, any>) || {}
      }
      context = {
        ...parentContext,
        ...routeContext,
      }
      match.context = context
    } catch (cause) {
      releaseFlight(router, match)
      return [index, normalizeLaneError(router, lane, route, cause, options)]
    }
    if (signal.aborted || !options[2 /* isCurrent */]()) {
      options[0 /* controller */].abort()
      return [index, [CANCELED]]
    }
    const validationError = match.paramsError ?? match.searchError
    if (validationError !== undefined) {
      releaseFlight(router, match)
      return [index, normalizeLaneError(router, lane, route, validationError, options)]
    }
    const beforeLoad = route.options.beforeLoad
    if (!beforeLoad) {
      continue
    }

    const beforeLoadContext: BeforeLoadContextOptions<any, any, any, any, any, any, any, any, any> =
      {
        ...common,
        search: match.search,
        context,
        ...router.options.additionalContext,
      }

    const previousStatus = match.status
    if (index >= retainedEnd) {
      match.status = 'pending'
      options[8 /* onReady */]?.()
    }
    try {
      setFetching(router, match, 'beforeLoad', options[0 /* controller */])
      const result = await waitFor(beforeLoad(beforeLoadContext), signal)
      if (!options[2 /* isCurrent */]()) {
        options[0 /* controller */].abort()
        return [index, [CANCELED]]
      }
      const outcome = materializeRedirect(
        router,
        lane,
        route,
        normalize(result, false, route.id),
        options,
      )
      if (outcome[0 /* kind */] !== SUCCESS) {
        releaseFlight(router, match)
        return [index, outcome]
      }
      match.context = {
        ...context,
        ...result,
      }
    } catch (cause) {
      releaseFlight(router, match)
      return [index, normalizeLaneError(router, lane, route, cause, options)]
    } finally {
      if (match.status === 'pending') {
        match.status = previousStatus
      }
      setFetching(router, match, false, options[0 /* controller */])
    }
  }

  // Let a synchronous lane claim predecessor flights before this frame yields.
  planSuccessfulLane()
  return
}

function acquireMatchResources(matches: Array<AnyRouteMatch>): void {
  for (const match of matches as Array<WorkMatch>) {
    const flight = match._flight
    if (flight) {
      flight[2 /* leases */]++
    }
  }
}

function setFetching(
  router: AnyRouter,
  match: WorkMatch,
  value: AnyRouteMatch['isFetching'],
  owner?: AbortController,
): void {
  match.isFetching = value
  if (owner && router._tx?.[0 /* controller */] !== owner) {
    return
  }
  const store = router.stores.byRoute[match.routeId]
  const presented = store?.get()
  if (presented?.id === match.id) {
    store!.set({ ...presented, isFetching: value })
    const bag = router.stores.state?.get?.()
    if (bag) {
      router.stores.state.set({
        ...bag,
        matches: router.stores.matches.get(),
      })
    }
  }
}

function getLoaderContext(
  router: AnyRouter,
  lane: ContextualizedLane,
  match: WorkMatch,
  route: AnyRoute,
  controller: AbortController,
  parentMatchPromise: Promise<WorkMatch> | undefined,
  preload: boolean,
): LoaderFnContext {
  const location = lane[0 /* location */]
  return {
    params: match.params,
    location,
    navigate: navigateFrom(router, location),
    cause: preload ? ('preload' as const) : match.cause,
    abortController: controller,
    preload,
    deps: match.loaderDeps,
    parentMatchPromise: parentMatchPromise as any,
    context: match.context,
    route,
    ...router.options.additionalContext,
  }
}

async function loadResource(
  router: AnyRouter,
  lane: ContextualizedLane,
  match: WorkMatch,
  route: AnyRoute,
  loader: RouteLoaderFn<any> | undefined,
  parentMatchPromise: Promise<WorkMatch> | undefined,
  options: ExecuteLaneOptions,
  owner: AbortController,
): Promise<LoaderOutcome> {
  const preload = !!options[4 /* preload */]
  const signal = owner.signal
  if (signal.aborted) {
    return [CANCELED]
  }
  if (!loader) {
    return [SUCCESS, undefined]
  }

  let flight = match._flight
  setFetching(router, match, 'loader', owner)
  try {
    if (!flight) {
      const controller = new AbortController()
      flight = [
        Promise.resolve()
          .then(() =>
            loader(
              getLoaderContext(router, lane, match, route, controller, parentMatchPromise, preload),
            ),
          )
          .then(
            (value) => normalize(value, false, route.id),
            (cause) => normalize(cause, true, route.id),
          )
          .then((result): LoaderOutcome => {
            // The registry controls discovery; leases keep current consumers
            // sharing the same terminal outcome.
            const flights = router._flights
            if (result[0 /* kind */] !== SUCCESS && flights && flights[match.id] === flight) {
              delete flights[match.id]
              if (!flight![2 /* leases */]) {
                controller.abort()
              }
            }
            return result[0 /* kind */] === ERROR && flight![2 /* leases */]
              ? normalizeError(route, result[1 /* error */])
              : result
          }),
        controller,
        1,
      ]
      ;(router._flights ??= Object.create(null))[match.id] = flight
    }
    match._flight = flight
    match.abortController = flight[1 /* controller */]
    return materializeRedirect(
      router,
      lane,
      route,
      await waitFor(flight[0 /* outcome */], signal),
      options,
    )
  } catch (cause) {
    if (cause !== signal) {
      throw cause
    }
    releaseFlight(router, match)
    return [CANCELED]
  } finally {
    setFetching(router, match, false, owner)
  }
}

function settleInto(
  match: WorkMatch,
  result: LoaderOutcome,
  preload: boolean,
): asserts match is SettledMatch {
  if (result[0 /* kind */] === SUCCESS) {
    match.loaderData = result[1 /* data */]
    match.error = undefined
    match.status = 'success'
    match.invalid = false
    match.updatedAt = Date.now()
    match.preload = preload
  } else if (result[0 /* kind */] !== REDIRECTED) {
    // Reduction installs only the selected terminal failure. Every other
    // settled attempt remains a renderable, stale match in that lane.
    match.status = 'success'
    match.error = undefined
    match.invalid = true
  }
}

function getParentSnapshot(match: WorkMatch, outcome: LoaderOutcome): WorkMatch {
  if (outcome[0 /* kind */] === ERROR || outcome[0 /* kind */] === NOT_FOUND) {
    return {
      ...match,
      status: outcome[0 /* kind */] === ERROR ? 'error' : 'notFound',
      error: outcome[1 /* error */],
      _flight: undefined,
    }
  }
  return match
}

function createLoaderTask(
  router: AnyRouter,
  lane: ContextualizedLane,
  index: number,
  tasks: Array<LoaderTask>,
  semanticParent: Promise<WorkMatch> | undefined,
  options: ExecuteLaneOptions,
  retainedEnd: number,
): Promise<WorkMatch> {
  const match = lane[1 /* matches */][index]!
  const route = getRoute(router, match)
  const preload = !!options[4 /* preload */]
  const plannedCacheMatch = router._cache[match.id]
  let configured
  let reload = false
  let reloadFailure: LoaderOutcome | undefined
  try {
    if (match.status === 'success') {
      configured = route.options.shouldReload
      if (typeof configured === 'function') {
        configured = configured(
          getLoaderContext(
            router,
            lane,
            match,
            route,
            options[0 /* controller */],
            semanticParent,
            preload,
          ),
        )
      }
      if (!options[2 /* isCurrent */]()) {
        options[0 /* controller */].abort()
        reloadFailure = [CANCELED]
      }
    }
    if (!reloadFailure) {
      if (match.status !== 'success') {
        reload = true
      } else {
        const staleAge =
          options[4 /* preload */] || match.preload
            ? (route.options.preloadStaleTime ?? router.options.defaultPreloadStaleTime ?? 30_000)
            : (route.options.staleTime ?? router.options.defaultStaleTime ?? 0)
        reload = !!(
          match.invalid ||
          configured ||
          (configured === undefined &&
            Date.now() - match.updatedAt >= staleAge &&
            (options[6 /* forceStaleReload */] ||
              match.cause === 'enter' ||
              options[3 /* base */].some(
                (candidate) => candidate.routeId === match.routeId && candidate.id !== match.id,
              )))
        )
      }
    }
  } catch (cause) {
    match.invalid = true
    releaseFlight(router, match)
    reloadFailure = normalizeLaneError(router, lane, route, cause, options)
  }
  const routeLoader = route.options.loader
  const loader = resolveRouteLoader(routeLoader)
  let donor =
    (!preload || route.options.preload !== false) &&
    routeLoader &&
    !(process.env.NODE_ENV !== 'production' && router._tx?.[6 /* refresh */])
      ? router._flights?.[match.id]
      : undefined
  if (donor === match._flight || reloadFailure) {
    donor = undefined
  } else if (donor && !reload && !preload && configured === undefined) {
    // Normal cache policy accepts an already-running generation even when this
    // lane itself would not have started another loader.
    reload = true
  } else if (!reload) {
    donor = undefined
  }
  const background = !!(
    routeLoader &&
    reload &&
    match.status === 'success' &&
    !preload &&
    !options[5 /* sync */] &&
    ((typeof routeLoader === 'function' ? undefined : routeLoader?.staleReloadMode) ??
      router.options.defaultStaleReloadMode) !== 'blocking'
  )
  const loaded = reload && (!preload || route.options.preload !== false)
  const blocking = loaded && !background && (match.status !== 'success' || !!routeLoader)
  const onReady = index >= retainedEnd ? options[8 /* onReady */] : undefined
  const onLazyReady = route.lazyFn && route._lazy !== true ? onReady : undefined
  if (loaded && !routeLoader) {
    match.invalid = false
    match.updatedAt = Date.now()
  }
  if (donor) {
    donor[2 /* leases */]++
  }
  if (blocking) {
    const acceptedFlight = match._flight
    match._flight = donor
    releaseOwnedFlight(router, match, acceptedFlight)?.abort()
    // A mounted success remains renderable while its loader revalidates. Every
    // non-retained blocking generation presents pending state.
    if (index >= retainedEnd) {
      match.status = 'pending'
    }
    onReady?.()
  }
  if (!loaded) {
    match.isFetching = false
  }
  const rawOutcome = reloadFailure
    ? Promise.resolve(reloadFailure)
    : !blocking
      ? Promise.resolve<LoaderOutcome>([SUCCESS, match.loaderData])
      : loadResource(
          router,
          lane,
          match,
          route,
          loader,
          semanticParent,
          options,
          options[0 /* controller */],
        )
  const outcome = rawOutcome.then((result) => {
    if (blocking) {
      settleInto(match, result, preload)
      if (result[0 /* kind */] === SUCCESS) {
        // A settled generation can outlive its lane without keeping unresolved
        // navigation work alive.
        if (routeLoader && !options[0 /* controller */].signal.aborted) {
          cacheLoaderMatch(router, match, plannedCacheMatch)
        }
        // A route is renderable only after both its data and normal component
        // chunk are ready. Its loader data is already available to descendants.
        if (index >= retainedEnd) {
          match.status = 'pending'
        }
      }
    }
    return result
  })

  const rawChunkFailure = waitFor(
    Promise.resolve().then(() => loadRouteChunk(route, undefined, onLazyReady)),
    options[0 /* controller */].signal,
  ).then(
    () => undefined,
    (cause): IndexedOutcome => [index, normalizeLaneError(router, lane, route, cause, options)],
  )
  const chunkFailure = rawChunkFailure.then((failure) =>
    outcome.then((result) => {
      if (
        blocking &&
        !failure &&
        result[0 /* kind */] === SUCCESS &&
        match.status === 'pending' &&
        options[2 /* isCurrent */]()
      ) {
        match.status = 'success'
        onReady?.()
      }
      return failure
    }),
  )
  tasks.push([index, outcome, chunkFailure])
  if (!background) {
    return outcome.then((result) => getParentSnapshot(match, result))
  }
  const candidate: WorkMatch = {
    ...match,
    status: 'pending',
    preload: false,
    _flight: donor,
  }
  match.invalid = false
  match.isFetching = 'loader'
  const backgroundOutcome = loadResource(
    router,
    lane,
    candidate,
    route,
    loader,
    semanticParent,
    options,
    options[0 /* controller */],
  ).then((result) => {
    match.isFetching = false
    settleInto(candidate, result, false)
    return result
  })
  ;(lane[2 /* background */] ??= []).push([index, backgroundOutcome, chunkFailure, candidate])
  return backgroundOutcome.then((result) => getParentSnapshot(candidate, result))
}

function getNotFoundBoundary(
  router: AnyRouter,
  matches: Array<WorkMatch>,
  indexed: IndexedOutcome | undefined,
  signal: AbortSignal,
  fallback = 0,
): Promise<number> {
  return findNotFoundBoundary(
    router,
    matches,
    indexed,
    (loading) =>
      loading &&
      waitFor(loading, signal).catch((cause) => {
        // Chunk failures fall back to shallower boundaries; only aborts escape.
        if (cause === signal && signal.aborted) {
          throw cause
        }
      }),
    fallback,
  )
}

function discardBackground(router: AnyRouter, lane: Lane<any>): void {
  if (lane[2 /* background */]) {
    transferMatchResources(
      router,
      lane[2 /* background */].map((task) => task[3 /* candidate */]),
    )
    lane[2 /* background */] = undefined
  }
}

async function settleTasks(
  tasks: Array<LoaderTask>,
  serialFailure?: IndexedOutcome,
  redirectTasks?: Array<BackgroundLoaderTask>,
  gate?: number | Promise<number>,
): Promise<IndexedOutcome | undefined> {
  let loaderFailure: IndexedOutcome | undefined

  try {
    await Promise.all(
      tasks.map((task) =>
        task[1 /* outcome */].then(async (outcome) => {
          const taskIndex = task[0 /* index */]
          if (gate && taskIndex >= (await gate)) {
            return undefined
          }
          if (outcome[0 /* kind */] >= REDIRECTED) {
            throw [taskIndex, outcome] as IndexedOutcome
          }
          if (!loaderFailure && outcome[0 /* kind */] !== SUCCESS) {
            loaderFailure = [taskIndex, outcome]
            // Every started descendant must settle before an ordinary failure
            // wins because a redirect from any of them remains control flow.
            await Promise.all(
              (redirectTasks ?? [])
                .filter((nextTask) => nextTask[0 /* index */] > taskIndex)
                .map((nextTask) =>
                  nextTask[1 /* outcome */].then((nextOutcome) => {
                    if (nextOutcome[0 /* kind */] === REDIRECTED) {
                      throw [nextTask[0 /* index */], nextOutcome] as IndexedOutcome
                    }
                    return undefined
                  }),
                ),
            )
          }
          return undefined
        }),
      ),
    )
  } catch (cause) {
    return cause as IndexedOutcome
  }
  return serialFailure ?? loaderFailure
}

async function reduceLane(
  router: AnyRouter,
  lane: ContextualizedLane,
  tasks: Array<LoaderTask>,
  controller: AbortController,
  redirects: number,
  settlement: Promise<IndexedOutcome | undefined>,
  onReady?: () => void,
): Promise<ReducedLane | ControlOutcome> {
  const matches = lane[1 /* matches */]
  let failure = await settlement
  let redirectLimitExceeded = false
  const plannedBoundary = matches.findIndex((match) => match._notFound)
  const boundaryOf = (found: IndexedOutcome) =>
    found[1 /* outcome */][0 /* kind */] === NOT_FOUND
      ? getNotFoundBoundary(router, matches, found, controller.signal)
      : found[0 /* index */]
  let readinessEnd = plannedBoundary < 0 ? matches.length : plannedBoundary

  if ((failure?.[1 /* outcome */][0 /* kind */] ?? 0) >= REDIRECTED) {
    readinessEnd = 0
  } else if (failure) {
    readinessEnd = failure[2 /* boundary */] ??= await boundaryOf(failure)
    for (const task of tasks) {
      if (task[0 /* index */] >= readinessEnd) {
        break
      }
      const outcome = await task[1 /* outcome */]
      // Presence means a loader previously succeeded, even with `undefined`.
      if (
        outcome[0 /* kind */] !== SUCCESS &&
        outcome[0 /* kind */] < REDIRECTED &&
        !('loaderData' in matches[task[0 /* index */]]!)
      ) {
        failure = [task[0 /* index */], outcome]
        readinessEnd = failure[2 /* boundary */] = await boundaryOf(failure)
        break
      }
    }
  }

  for (const task of tasks) {
    if (task[0 /* index */] >= readinessEnd) {
      break
    }
    const chunkFailure = await task[2 /* chunkFailure */]
    if (!chunkFailure) {
      continue
    }
    failure = chunkFailure
    break
  }

  if ((failure?.[1 /* outcome */][0 /* kind */] ?? 0) >= REDIRECTED) {
    const outcome = failure![1 /* outcome */]
    if (
      outcome[0 /* kind */] !== REDIRECTED ||
      outcome[1 /* redirect */].options.reloadDocument ||
      outcome[2 /* location */]
    ) {
      discardBackground(router, lane)
      return outcome as ControlOutcome
    }
    redirectLimitExceeded = true
    failure = [0, [ERROR, new Error('Too many redirects')]]
  }

  const boundary = failure
    ? (failure[2 /* boundary */] ?? (await boundaryOf(failure)))
    : plannedBoundary
  if (boundary >= 0) {
    const outcome = failure?.[1 /* outcome */]
    const kind = outcome?.[0 /* kind */]
    const match = matches[boundary]!
    const cause = outcome?.[1 /* error or redirect */]
    const install = () => {
      if (outcome) {
        match._notFound = undefined
        if (kind === ERROR) {
          match.status = 'error'
        } else {
          ;(cause as NotFoundError).routeId = match.routeId
          if (match.routeId === router.routeTree.id) {
            match.status = 'success'
            match._notFound = true
          } else {
            match.status = 'notFound'
          }
        }
        match.error = cause
        match.isFetching = false
      }
    }
    install()
    if (!outcome) {
      onReady?.()
    }
    const route = getRoute(router, match)
    try {
      await waitFor<unknown>(
        outcome
          ? Promise.resolve().then(() =>
              loadRouteChunk(route, kind === ERROR ? 'errorComponent' : 'notFoundComponent'),
            )
          : Promise.all([loadRouteChunk(route), loadRouteChunk(route, 'notFoundComponent')]),
        controller.signal,
      )
    } catch (cause) {
      if (cause === controller.signal && controller.signal.aborted) {
        discardBackground(router, lane)
        return [CANCELED]
      }
    }
    if (!outcome) {
      match.status = 'success'
    } else if (redirectLimitExceeded) {
      controller.abort()
      await Promise.all([
        ...tasks.map((task) => task[1 /* outcome */]),
        ...tasks.map((task) => task[2 /* chunkFailure */]),
        ...(lane[2 /* background */] ?? []).map((task) => task[1 /* outcome */]),
      ])
      discardBackground(router, lane)
      transferMatchResources(router, matches)
      install()
    }
  }

  return lane as ReducedLane
}

async function executeClientLane(
  router: AnyRouter,
  location: ParsedLocation,
  matches: Array<AnyRouteMatch>,
  options: ExecuteLaneOptions,
): Promise<LaneResult> {
  const matched = [location, matches as Array<WorkMatch>] as MatchedLane
  const presented = router.stores.matches.get()
  let plannedBoundary = matches.findIndex((match) => match._notFound)
  if (router.options.notFoundMode !== 'root' && plannedBoundary >= 0) {
    const boundary = await getNotFoundBoundary(
      router,
      matched[1 /* matches */],
      undefined,
      options[0 /* controller */].signal,
      plannedBoundary,
    )
    if (boundary !== plannedBoundary) {
      matches[plannedBoundary]!._notFound = undefined
      matches[boundary]!._notFound = true
    }
    plannedBoundary = boundary
  }
  let end = plannedBoundary < 0 ? matches.length : plannedBoundary + 1
  let retainedEnd = 0
  while (retainedEnd < end && retainedEnd !== plannedBoundary) {
    const match = matches[retainedEnd]!
    const committed = options[3 /* base */][retainedEnd]
    const visible = presented[retainedEnd]
    if (
      committed?.id !== match.id ||
      committed.status !== 'success' ||
      committed._notFound ||
      match.preload ||
      visible?.id !== match.id ||
      visible.status !== 'success' ||
      visible._notFound
    ) {
      break
    }
    retainedEnd++
  }
  const tasks: Array<LoaderTask> = []
  const start = options[7 /* resolvedPrefix */] ?? 0
  let semanticParent = start ? Promise.resolve(matched[1 /* matches */][start - 1]!) : undefined
  const planSuccessfulLane = () => {
    for (let index = start; index < end; index++) {
      if (options[0 /* controller */].signal.aborted) {
        break
      }
      semanticParent = createLoaderTask(
        router,
        matched as ContextualizedLane,
        index,
        tasks,
        semanticParent,
        options,
        retainedEnd,
      )
    }
  }
  // From here on `matched` is contextualized: `contextualize` communicates
  // through mutation plus a failure return, so the phase brand is asserted at
  // the two use sites below rather than granted by a (byte-costing) return.
  const failure = await contextualize(
    router,
    matched,
    options,
    end,
    planSuccessfulLane,
    retainedEnd,
  )
  if (failure) {
    options[5 /* sync */] = true
    end = failure[0 /* index */]
    if (failure[1 /* outcome */][0 /* kind */] === NOT_FOUND) {
      failure[2 /* boundary */] = await getNotFoundBoundary(
        router,
        matched[1 /* matches */],
        failure,
        options[0 /* controller */].signal,
      )
      end = Math.min(end, failure[2 /* boundary */] + 1)
    } else if (failure[1 /* outcome */][0 /* kind */] >= REDIRECTED) {
      end = 0
    }
    planSuccessfulLane()
  }
  if (options[2 /* isCurrent */]() && !options[4 /* preload */]) {
    const abort: Array<AbortController> = []
    const flights = router._flights
    if (flights) {
      for (const id in flights) {
        const flight = flights[id]!
        if (!flight[2 /* leases */]) {
          delete flights[id]
          abort.push(flight[1 /* controller */])
        }
      }
    }
    for (const controller of abort) {
      controller.abort()
    }
  }
  let reduced: ReducedLane | ControlOutcome
  try {
    const reduction = reduceLane(
      router,
      matched as ContextualizedLane,
      tasks,
      options[0 /* controller */],
      options[1 /* redirects */],
      settleTasks(tasks, failure, matched[2 /* background */]),
      options[8 /* onReady */],
    )
    if (matched[2 /* background */]?.length) {
      matched[3 /* backgroundSettlement */] = settleTasks(
        matched[2 /* background */],
        undefined,
        undefined,
        reduction.then(
          (foreground) =>
            isControl(foreground) ? 0 : _getRenderedMatches(foreground[1 /* matches */]).length,
          () => 0,
        ),
      )
    }
    reduced = await reduction
  } catch (cause) {
    discardBackground(router, matched)
    throw cause
  }
  if (isControl(reduced)) {
    return reduced
  }
  return projectLane(
    router,
    reduced,
    options[0 /* controller */].signal,
    options[7 /* resolvedPrefix */] === reduced[1 /* matches */].length
      ? options[7 /* resolvedPrefix */]
      : 0,
  )
}

/**
 * Waits for `pendingMs`, then presents the complete lane. Rendering applies the
 * selected boundary cutoff while retaining every match's structural state.
 * A replacement load for the same match keeps the timer; choosing a different
 * match resets it. `pendingMinMs` starts after the fallback renders.
 */
function offerPending(router: CoordinatorRouter, tx: LoadTransaction): void {
  if (router._tx !== tx) {
    return
  }
  const matches = tx[3 /* matches */]
  const presented = router.stores.matches.get()
  let session = router._pending
  for (let index = 0; index < matches.length; index++) {
    const match = matches[index]!
    const success = match.status === 'success' && !match._notFound
    const presentedPending =
      presented[index]?.id === match.id && presented[index]?.status === 'pending'
    if (success && !presentedPending) {
      continue
    }
    const route = getRoute(router, match as WorkMatch)
    const delay =
      (success && presentedPending) || match.invalid
        ? 0
        : (route.options.pendingMs ?? router.options.defaultPendingMs)
    const component =
      route.options.pendingComponent ?? (router.options as any).defaultPendingComponent
    if (!component || typeof delay !== 'number' || delay === Infinity) {
      // A pending-ineligible boundary (no fallback, or infinite delay) owns
      // presentation here. Retire any deeper pendingMinMs so a successor can
      // commit as soon as this earlier match settles. Do not mark a deeper
      // session as already-acked — that would skip a later pending offer if
      // the leftover reveal never painted. Always cancel the leftover timer.
      if (session) {
        clearTimeout(session[3 /* revealTimer */])
        session[3 /* revealTimer */] = undefined
        session[0 /* generation */] = tx
        session[2 /* deadline */] = 0
        if (session[1 /* boundaryId */] === match.id) {
          session[4 /* ack */] = true
        }
      }
      return
    }
    const min = route.options.pendingMinMs ?? router.options.defaultPendingMinMs ?? 0
    let tookOver = false
    if (session?.[1 /* boundaryId */] === match.id) {
      tookOver = session[0 /* generation */] !== tx
      session[0 /* generation */] = tx
    } else {
      clearTimeout(session?.[3 /* revealTimer */])
      router._pending = session = undefined
    }
    if (!session) {
      // Hydration and redirects can preserve pending presentation without a session.
      // Do not delay it again; conservatively start pendingMinMs from now.
      router._pending = session = [
        tx,
        match.id,
        presentedPending ? Date.now() + min : tx[4 /* startedAt */] + delay,
        undefined,
        presentedPending || undefined,
        component,
      ]
    }
    if (session[4 /* ack */] && !tookOver && session[5 /* component */] === component) {
      return
    }
    session[5 /* component */] = component
    if (!session[4 /* ack */]) {
      clearTimeout(session[3 /* revealTimer */])
      const remaining = session[2 /* deadline */] - Date.now()
      if (remaining > 0) {
        session[3 /* revealTimer */] = setTimeout(() => offerPending(router, tx), remaining)
        return
      }
      session[2 /* deadline */] = 0
    }
    const offered = matches.map((candidate) => ({
      ...candidate,
      _flight: undefined,
    }))
    offered[index]!.status = 'pending'
    const ack = (session[4 /* ack */] = router
      .startTransition(() => router.stores.setMatches(offered), offered)
      .then((rendered) => {
        if (
          rendered &&
          router._pending === session &&
          session![4 /* ack */] === ack &&
          !session![2 /* deadline */]
        ) {
          session![2 /* deadline */] = Date.now() + min
        }
        return rendered
      }))
    return
  }
}

/**
 * Cancels pending UI timing unless the current successor can take over the
 * same boundary that remains painted.
 */
function finishPending(router: CoordinatorRouter, tx: LoadTransaction): void {
  const session = router._pending
  if (
    router._tx === tx ||
    !router._tx?.[3 /* matches */].some(
      (match: AnyRouteMatch) => match.id === session?.[1 /* boundaryId */],
    )
  ) {
    clearTimeout(session?.[3 /* revealTimer */])
    router._pending = undefined
  }
}

async function awaitPendingMinimum(router: CoordinatorRouter, tx: LoadTransaction): Promise<void> {
  const session = router._pending
  if (!session) {
    return
  }
  clearTimeout(session[3 /* revealTimer */])
  // Only an acknowledged fallback owns a minimum. An in-flight ack means the
  // offer has not painted, so a terminal successor must not wait for it.
  const remaining = session[2 /* deadline */] - Date.now()
  if (
    !session[4 /* ack */] ||
    remaining <= 0 ||
    !_getRenderedMatches(tx[3 /* matches */]).some(
      (match) => match.id === session[1 /* boundaryId */],
    )
  ) {
    return
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await waitFor(
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, remaining)
      }),
      tx[0 /* controller */].signal,
    )
  } catch {}
  clearTimeout(timer)
}

function publishMatches(router: CoordinatorRouter, matches: Array<AnyRouteMatch>): void {
  router._committed = matches
  router.stores.setMatches(matches)
}

function discardLane(router: AnyRouter, lane: ProjectedLane): void {
  transferMatchResources(router, lane[1 /* matches */])
  discardBackground(router, lane)
}

function commitMatches(
  router: CoordinatorRouter,
  tx: LoadTransaction,
  matches: LaneMatches<'projected'>,
  resolvedPrefix?: number,
): void {
  const previous = router._committed
  const previousCached = router._cache
  for (const match of matches) {
    match.preload = false
    if (resolvedPrefix) {
      match._assetEnd = undefined
    }
  }
  const cut = _getRenderedMatches(matches).length
  const cached: Record<string, AnyRouteMatch> = Object.create(null)
  const now = Date.now()
  for (const match of [...previous, ...objectValues(previousCached)]) {
    // Rendered-prefix ids and settled successes anywhere in the lane are
    // authoritative: retaining an older same-id generation would shadow them
    // at the next planning pass. Unsettled beyond-boundary matches are not —
    // they must not evict a newer same-id preload.
    if (
      match.status !== 'success' ||
      matches.some(
        (candidate, index) =>
          candidate.id === match.id && (index < cut || candidate.status === 'success'),
      )
    ) {
      continue
    }
    const work = match as WorkMatch
    const route = getRoute(router, work)
    if (
      !route.options.loader ||
      now - match.updatedAt >=
        (match.preload
          ? (route.options.preloadGcTime ?? router.options.defaultPreloadGcTime ?? 300_000)
          : (route.options.gcTime ?? router.options.defaultGcTime ?? 300_000))
    ) {
      continue
    }
    cached[match.id] =
      previousCached[match.id] === match
        ? match
        : ({
            ...match,
            _flight: undefined,
            isFetching: false,
            context: {},
          } as WorkMatch)
  }
  // The lane becomes committed before publication can synchronously reenter.
  tx[3 /* matches */] = []
  router._cache = cached
  publishMatches(router, matches)
  transferMatchResources(
    router,
    [...objectValues(previousCached), ...previous],
    [...matches, ...objectValues(cached)],
  )
  if (process.env.NODE_ENV !== 'production') {
    const handoff = tx[6 /* refresh */]?.[0 /* handoff */]
    if (handoff && router._handoff === handoff) {
      handoff[1 /* finish */]()
    }
  }
  runRouteLifecycle(router, previous, matches, () => router._tx === tx)
}

export async function awaitCurrent(
  router: CoordinatorRouter,
  owner?: LoadTransaction,
): Promise<void> {
  let current = router._tx
  while (current && current !== owner) {
    await current[5 /* done */]
    if (router._tx === current) {
      return
    }
    current = router._tx
  }
}

async function followRedirect(
  router: CoordinatorRouter,
  tx: LoadTransaction,
  outcome: RedirectOutcome,
): Promise<void> {
  const redirect = outcome[1 /* redirect */]
  const location = outcome[2 /* location */]
  if (!location) {
    await router.navigate({
      ...redirect.options,
      replace: true,
      ignoreBlocker: true,
    } as any)
    return
  }
  if (redirect.options.reloadDocument) {
    await router.navigate({
      href: location.publicHref,
      reloadDocument: true,
      replace: true,
      ignoreBlocker: true,
    } as any)
    return
  }
  ;(location as ParsedLocation & { _redirects?: number })._redirects = tx[1 /* redirects */] + 1
  router._pendingLocation = location
  const committed = router.commitLocation({
    ...location,
    viewTransition: redirect.options.viewTransition,
    replace: true,
    resetScroll: redirect.options.resetScroll,
    hashScrollIntoView: redirect.options.hashScrollIntoView,
    ignoreBlocker: true,
  })
  queueMicrotask(() => {
    if (router._pendingLocation === location) {
      router._pendingLocation = undefined
    }
  })
  await committed
}

function restoreCommitted(router: CoordinatorRouter, tx: LoadTransaction): void {
  finishPending(router, tx)
  tx[0 /* controller */].abort()
  transferMatchResources(router, tx[3 /* matches */])
  tx[3 /* matches */] = []
  if (router._tx !== tx) {
    return
  }
  router.batch(() => {
    router.stores.status.set('idle')
    router.stores.setMatches(router._committed)
  })
  if (router._tx === tx) {
    router._commitPromise?.resolve()
    router._commitPromise = undefined
  }
}

async function runBackground(
  router: CoordinatorRouter,
  tx: LoadTransaction,
  base: Array<AnyRouteMatch>,
  tasks: Array<BackgroundLoaderTask>,
  settlement: Promise<IndexedOutcome | undefined>,
): Promise<void> {
  const next = base.map((match) => ({ ...match }))
  acquireMatchResources(next)
  for (const task of tasks) {
    releaseFlight(router, next[task[0 /* index */]]!)
    next[task[0 /* index */]] = task[3 /* candidate */]
  }
  // Phase jump: the clones inherit beforeLoad context from the committed
  // foreground lane, which already ran `contextualize` for these matches.
  const lane = [tx[2 /* location */], next] as ContextualizedLane
  let reduced: ReducedLane | ControlOutcome
  try {
    reduced = await reduceLane(
      router,
      lane,
      tasks,
      tx[0 /* controller */],
      tx[1 /* redirects */],
      settlement,
    )
  } catch (cause) {
    transferMatchResources(router, next)
    throw cause
  }
  if (isControl(reduced)) {
    transferMatchResources(router, next)
    if (reduced[0 /* kind */] === REDIRECTED && router._tx === tx && router._committed === base) {
      await followRedirect(router, tx, reduced)
    }
    return
  }
  const projected = await projectLane(router, reduced, tx[0 /* controller */].signal)
  if (router._tx !== tx || router._committed !== base) {
    transferMatchResources(router, projected[1 /* matches */])
    return
  }
  for (const match of projected[1 /* matches */] as Array<WorkMatch>) {
    const cached = router._cache[match.id] as WorkMatch | undefined
    if (cached?._flight && cached._flight === match._flight) {
      delete router._cache[match.id]
      releaseFlight(router, cached)
    }
  }
  publishMatches(router, projected[1 /* matches */])
  transferMatchResources(router, base, projected[1 /* matches */])
}

async function runClientTransaction(
  router: CoordinatorRouter,
  tx: LoadTransaction,
  forceStaleReload: boolean,
  onReady?: () => void,
  sync?: boolean,
  resolvedPrefix?: number,
): Promise<void> {
  const options: ExecuteLaneOptions = [
    tx[0 /* controller */],
    tx[1 /* redirects */],
    () => router._tx === tx && !!tx[3 /* matches */].length,
    router._committed,
    undefined,
    sync,
    forceStaleReload,
    resolvedPrefix,
    onReady,
  ]
  const result = await executeClientLane(router, tx[2 /* location */], tx[3 /* matches */], options)

  if (isControl(result)) {
    const follow = result[0 /* kind */] === REDIRECTED && router._tx === tx
    if (!follow || result[1 /* redirect */].options.reloadDocument) {
      finishPending(router, tx)
    }
    transferMatchResources(router, tx[3 /* matches */])
    tx[3 /* matches */] = []
    if (!follow) {
      return
    }
    if (router._tx !== tx) {
      finishPending(router, tx)
      return
    }
    if (process.env.NODE_ENV !== 'production' && tx[6 /* refresh */]) {
      router._refreshNextLoad = true
    }
    await followRedirect(router, tx, result)
    return
  }
  const abandoned = () => {
    if (router._tx === tx) {
      return false
    }
    finishPending(router, tx)
    discardLane(router, result)
    return true
  }
  if (abandoned()) return
  await awaitPendingMinimum(router, tx)
  if (abandoned()) return
  const toLocation = tx[2 /* location */]
  const changeInfo = getLocationChangeInfo(toLocation, router.stores.resolvedLocation.get())
  const background = result[2 /* background */]
  await router.startViewTransition(async () => {
    if (abandoned()) return
    await awaitPendingMinimum(router, tx)
    if (abandoned()) return
    const commit = () => {
      finishPending(router, tx)
      commitMatches(router, tx, result[1 /* matches */], resolvedPrefix)
      if (router._tx !== tx) {
        return
      }
      router.emit({ type: 'onLoad', ...changeInfo })
      if (router._tx === tx) {
        router.emit({ type: 'onBeforeRouteMount', ...changeInfo })
      }
    }
    const rendered = await router.startTransition(commit, result[1 /* matches */])
    if (process.env.NODE_ENV !== 'production' && tx[6 /* refresh */]) {
      tx[6 /* refresh */] = undefined
    }
    if (router._tx !== tx) {
      discardBackground(router, result)
      return
    }
    if (background?.length) {
      // Publish refreshes only after the foreground render acknowledgement.
      // Otherwise a fast refresh can replace the acknowledged generation
      // before the framework commits it and strand the navigation.
      runBackground(
        router,
        tx,
        result[1 /* matches */],
        background,
        result[3 /* backgroundSettlement */]!,
      ).catch(console.error)
    }
    router.batch(() => {
      router.stores.resolvedLocation.set(toLocation)
      router.stores.status.set('idle')
      if (router._tx === tx) {
        router.emit({ type: 'onResolved', ...changeInfo })
      }
      if (rendered && router._tx === tx) {
        router.emit({ type: 'onRendered', ...changeInfo })
      }
    })
    if (router._tx !== tx) {
      return
    }
    router._commitPromise?.resolve()
    router._commitPromise = undefined
  })
}

export async function loadClientRoute(
  router: CoordinatorRouter,
  opts?: { sync?: boolean },
): Promise<void> {
  if (
    !router._handoff &&
    !router._tx &&
    !router._refreshNextLoad &&
    !router._forcePending &&
    router.stores?.status?.get() === 'idle'
  ) {
    const resolved = router.stores.resolvedLocation.get()
    const location = router.latestLocation
    if (resolved && location && resolved.href === location.href) {
      const matches = router.stores.matches.get()
      if (matches?.length) {
        let ready = true
        for (let i = 0; i < matches.length; i++) {
          const match = matches[i]!
          if (match.status !== 'success' || match.invalid || match.isFetching) {
            ready = false
            break
          }
          const shouldReload = router.routesById[match.routeId]?.options?.shouldReload
          if (shouldReload === true || typeof shouldReload === 'function') {
            ready = false
            break
          }
        }
        if (ready) {
          router._commitPromise?.resolve()
          router._commitPromise = undefined
          return
        }
      }
    }
  }
  let rematerialize = false
  if (process.env.NODE_ENV !== 'production') {
    rematerialize = !!router._refreshNextLoad || !!router._tx?.[6 /* refresh */]
  }
  const previousOwner = router._tx
  const resolvedLocation = router.stores.resolvedLocation.get()
  const previousLocation = resolvedLocation ?? router.stores.location.get()
  const location = router.latestLocation
  const pendingLocation = router._pendingLocation as
    | (ParsedLocation & { _redirects?: number })
    | undefined
  const redirects = pendingLocation?.href === location.href ? (pendingLocation._redirects ?? 0) : 0
  const handoff = router._handoff
  const hydrationController = rematerialize ? undefined : handoff?.[0 /* claim */]()
  const preflight = new AbortController()
  const previousPreflight = router._preflight
  router._preflight = preflight
  if (!rematerialize && !hydrationController) {
    handoff?.[1 /* finish */]()
  }
  previousPreflight?.abort()
  // The preflight controller is not exposed to route hooks. Every replacement
  // aborts its predecessor, so a live signal is the sole authority here.
  if (preflight.signal.aborted) {
    await awaitCurrent(router, previousOwner)
    return
  }

  const changeInfo = getLocationChangeInfo(location, resolvedLocation)
  router.emit({ type: 'onBeforeNavigate', ...changeInfo })
  if (!preflight.signal.aborted) {
    router.emit({ type: 'onBeforeLoad', ...changeInfo })
  }
  if (preflight.signal.aborted) {
    await awaitCurrent(router, previousOwner)
    return
  }
  const sameHref = previousLocation.href === location.href
  let matches: Array<AnyRouteMatch>
  let controller = preflight
  try {
    matches =
      process.env.NODE_ENV !== 'production' && rematerialize
        ? router.matchRoutes(location, {
            _controller: preflight,
            _rematerialize: true,
          })
        : router.matchRoutes(location, { _controller: preflight })
    acquireMatchResources(matches)
  } catch (cause) {
    preflight.abort()
    if (!isRedirect(cause)) {
      if (process.env.NODE_ENV !== 'production' && rematerialize) {
        router._refreshNextLoad = undefined
      }
      await awaitCurrent(router)
      router._commitPromise?.resolve()
      router._commitPromise = undefined
      return
    }
    await router.navigate({
      ...cause.options,
      replace: true,
      ignoreBlocker: true,
    })
    await awaitCurrent(router, previousOwner)
    return
  }
  const resolvedPrefix = hydrationController ? handoff![1 /* finish */](matches) : undefined
  if (resolvedPrefix) {
    controller = hydrationController!
  } else {
    hydrationController?.abort()
  }
  if (preflight.signal.aborted) {
    transferMatchResources(router, matches)
    await awaitCurrent(router, previousOwner)
    return
  }
  router._preflight = undefined

  const tx: LoadTransaction = [
    controller,
    redirects,
    location,
    matches,
    Date.now(),
    Promise.resolve()
      .then(() =>
        runClientTransaction(
          router,
          tx,
          sameHref,
          () => offerPending(router, tx),
          opts?.sync,
          resolvedPrefix,
        ),
      )
      .catch(() => {
        if (router._tx === tx) {
          restoreCommitted(router, tx)
        }
      }),
  ]
  if (process.env.NODE_ENV !== 'production' && rematerialize) {
    tx[6 /* refresh */] = [handoff]
    router._refreshNextLoad = undefined
  }
  router._tx = tx
  if (previousOwner) {
    for (const match of router.stores.matches.get() as Array<WorkMatch>) {
      if (router._tx !== tx) {
        break
      }
      if (match.isFetching) {
        setFetching(router, match, false)
      }
    }
    previousOwner[0 /* controller */].abort()
    transferMatchResources(router, previousOwner[3 /* matches */], tx[3 /* matches */], true)
  }
  if (router._tx !== tx) {
    transferMatchResources(router, tx[3 /* matches */])
    tx[3 /* matches */] = []
    await awaitCurrent(router, tx)
    return
  }
  router.batch(() => {
    router.stores.status.set('pending')
    router.stores.location.set(location)
  })
  // Cold loads have no committed UI to retain, but provisional not-found
  // matches must wait for lazy routes to place the final boundary.
  if (resolvedPrefix || (!router._committed.length && !matches.some((match) => match._notFound))) {
    offerPending(router, tx)
  }
  try {
    await tx[5 /* done */]
  } finally {
    await awaitCurrent(router, tx)
  }
}

export async function preloadClientRoute(
  router: CoordinatorRouter,
  opts: any,
  redirects = 0,
  builtLocation?: ParsedLocation,
): Promise<Array<AnyRouteMatch> | undefined> {
  if (
    process.env.NODE_ENV !== 'production' &&
    (router._refreshNextLoad || router._tx?.[6 /* refresh */])
  ) {
    return
  }
  const location = builtLocation ?? opts._builtLocation ?? router.buildLocation(opts)
  const base = router._committed
  const controller = new AbortController()
  let matches: Array<AnyRouteMatch>
  try {
    matches = router.matchRoutes(location, {
      _controller: controller,
    })
    acquireMatchResources(matches)
  } catch (cause) {
    controller.abort()
    if (!isNotFound(cause)) {
      console.error(cause)
    }
    return
  }
  ;(router._preloads ??= new Map()).set(controller, matches)
  let active: boolean
  try {
    let result: LaneResult
    try {
      result = await executeClientLane(router, location, matches, [
        controller,
        redirects,
        // Preload lanes run to completion even when unrelated navigations commit:
        // finished work seeds the cache.
        () => true,
        base,
        true,
      ])
    } finally {
      active = router._preloads.delete(controller)
      transferMatchResources(router, matches)
      controller.abort()
    }
    if (!isControl(result)) {
      return result[1 /* matches */]
    }
    if (
      active &&
      result[0 /* kind */] === REDIRECTED &&
      !result[1 /* redirect */].options.reloadDocument
    ) {
      return preloadClientRoute(
        router,
        result[1 /* redirect */].options,
        redirects + 1,
        result[2 /* location */],
      )
    }
  } catch (cause) {
    if (!isNotFound(cause)) {
      console.error(cause)
    }
  }
  return
}
