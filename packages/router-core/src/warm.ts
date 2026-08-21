/**
 * Optional sync loader used when nothing has subscribed to router events
 * (no default scroll, no scroll restoration, no hydrate).
 *
 * SSR apps and any client that sets up default window scroll / scroll restoration
 * never take this path — they already download `load-client`. Import this
 * module only when you want the extra graph.
 */
import { findRouteMatch } from './match'
import { isNotFound } from './not-found'
import { isServer } from './is-server'
import { interpolatePath } from './path'
import { isRedirect, type AnyRedirect } from './redirect'
import type { ParsedLocation } from './location'
import type { AnyRoute } from './route'
import type { NavigateFn } from './router-provider'
import { validateSearch } from './router-search'
import { resolveRouteLoader } from './load-shared'
import { createStringMap, deepEqual, noopAbortController, rememberBounded } from './utils'
import {
  getLocationChangeInfo,
  importLoadClient,
  isWarmLoadBlocked,
  setWarmLoad,
  type RouteMatch,
} from './router'

const WARM_MATCH_CACHE_MAX = 64

type WarmResult = {
  match: RouteMatch
  route: AnyRoute
  context: Record<string, any>
  ok: boolean
  value: any
}

type WarmParallelState = {
  results: Array<WarmResult | undefined>
  pending: Promise<void>[]
  settled: RouteMatch[]
  canceled: boolean
}

function settleWarmSuccess(
  state: WarmParallelState,
  result: WarmResult,
  updatedAt: number,
  active: boolean,
) {
  if (
    state.canceled ||
    !active ||
    !result.ok ||
    isRedirect(result.value) ||
    isNotFound(result.value)
  ) {
    return
  }
  result.match.loaderData = result.value
  result.match.status = 'success'
  result.match.isFetching = false
  result.match.updatedAt = updatedAt
  result.match.context = result.context
  state.settled.push(result.match)
}

function abortWarmFetching(matches: RouteMatch[], state?: WarmParallelState) {
  if (state) state.canceled = true
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i]!
    if (match.isFetching) {
      match.abortController.abort()
      match.isFetching = false
    }
  }
}

function discardSettledWarmMatches(
  matches: RouteMatch[],
  state: WarmParallelState | undefined,
  failed: RouteMatch,
) {
  if (!state) return
  const failedIndex = matches.indexOf(failed)
  for (let i = 0; i < state.settled.length; i++) {
    const match = state.settled[i]!
    if (matches.indexOf(match) <= failedIndex) continue
    match.loaderData = undefined
    match.status = 'pending'
    match.isFetching = false
    match.updatedAt = 0
  }
}

function fillWarmLoaderContext(
  match: RouteMatch,
  location: ParsedLocation,
  navigate: NavigateFn,
  context: Record<string, any>,
  route: AnyRoute,
  matches: RouteMatch[],
  parentMatchPromise: Promise<RouteMatch> | undefined,
  additionalContext: Record<string, any> | undefined,
) {
  return {
    abortController: match.abortController,
    preload: false,
    params: match.params,
    rawParams: match.rawParams,
    cause: match.cause,
    location,
    navigate,
    search: match.search,
    context,
    route,
    matches,
    deps: match.loaderDeps,
    parentMatchPromise,
    ...additionalContext,
  }
}

function callWarmLoader(
  loader: (context: any) => any,
  context: any,
): { ok: true; value: any } | { ok: false; value: any } {
  try {
    return { ok: true, value: loader(context) }
  } catch (value) {
    return { ok: false, value }
  }
}

function warmLoaderDeps(route: AnyRoute, search: any): { deps: any; hash: string } | undefined {
  const fn = route.options.loaderDeps
  if (!fn) return { deps: '', hash: '' }
  try {
    const deps = fn({ search }) ?? ''
    return { deps, hash: deps ? JSON.stringify(deps) || '' : '' }
  } catch {
    return
  }
}

function routeCanWarmLoad(route: AnyRoute): boolean {
  if (route.lazyFn && !route._lazy) return false
  const cached = route._warmLoad
  if (cached === 1) return true
  if (cached === 0) return false
  const options = route.options
  // `staleTime` is not a warm-path opt-out. Omitted staleTime is 0, the same
  // default as TanStack, and only controls whether a successful match reloads.
  const ok = !(
    options.beforeLoad ||
    options.onEnter ||
    options.onLeave ||
    options.onStay ||
    options.head ||
    options.headers ||
    options.scripts ||
    options.shouldReload ||
    (options.component as { preload?: unknown } | undefined)?.preload ||
    (options.pendingComponent as { preload?: unknown } | undefined)?.preload
  )
  route._warmLoad = ok ? 1 : 0
  return ok
}

/**
 * Same reload gate as the full client coordinator: a match reloads when it is
 * pending/invalid, or when it is stale and this navigation entered the route
 * or switched to a different match id of the same route. `staleTime` defaults
 * to `defaultStaleTime ?? 0`, so omitted staleTime is not a permanent cache.
 */
function warmMatchNeedsLoader(
  match: RouteMatch,
  route: AnyRoute,
  router: { options: { defaultStaleTime?: number } },
  prevMatches: RouteMatch[],
  now: number,
): boolean {
  if (!route.options.loader) return false
  if (match.status !== 'success' || match.invalid) return true
  const staleAge = route.options.staleTime ?? router.options.defaultStaleTime ?? 0
  if (staleAge === Infinity || now - match.updatedAt < staleAge) return false
  if (match.cause === 'enter') return true
  const routeId = match.routeId
  const matchId = match.id
  for (let i = 0; i < prevMatches.length; i++) {
    const prev = prevMatches[i]!
    if (prev.routeId === routeId && prev.id !== matchId) return true
  }
  return false
}

export function tryWarmLoad(
  router: any,
  location: ParsedLocation,
  id: number,
): boolean | Promise<void> {
  if (router._forcePending || router._handoff || router._tx || router._refreshNextLoad) return false
  if (isWarmLoadBlocked(router)) return false

  const cacheKey = location.searchStr
    ? `${location.pathname}\0${location.searchStr}`
    : location.pathname
  const cached = router._matchesByPath?.get(cacheKey)
  if (cached) {
    const prepared = prepareCachedWarmMatches(router, cached, location)
    if (prepared) {
      if (!prepared.needsLoader) {
        completeWarmLoad(router, location, cached)
        return true
      }
      const next = finishWarmMatches(router, location, id, cached, cacheKey, 0)
      return next ?? true
    }
  }

  const found = findRouteMatch(
    router.processedTree,
    location.pathname,
    router.options.caseSensitive ?? false,
  )
  if (!found) return false

  for (let i = 0; i < found.length; i++) {
    if (!routeCanWarmLoad(found[i]!.route as AnyRoute)) return false
  }
  if (router._preloads !== undefined && router._preloads.size > 0) return false

  const prevMatches = router._committed
  const prevByRoute = prevMatches.length > 4 ? null : prevMatches
  const prevMap: Record<string, RouteMatch> | null =
    prevMatches.length > 4 ? Object.create(null) : null
  if (prevMap) {
    for (let i = 0; i < prevMatches.length; i++) {
      const prev = prevMatches[i]!
      prevMap[prev.routeId] = prev
    }
  }

  const matches: RouteMatch[] = new Array(found.length)
  let search = location.search
  let strictSearch: Record<string, any> = {}

  for (let i = 0; i < found.length; i++) {
    const result = found[i]!
    const route = result.route as AnyRoute
    if (route.options.validateSearch) {
      try {
        const strict = validateSearch(route.options.validateSearch, { ...search }) ?? {}
        search = { ...search, ...strict }
        strictSearch = { ...strictSearch, ...strict }
      } catch {
        return false
      }
    }
    const matchStrictSearch = { ...strictSearch }
    const deps = warmLoaderDeps(route, search)
    if (!deps) return false
    let interpolatedPath = route.fullPath || location.pathname
    if (interpolatedPath.indexOf('$') !== -1) {
      interpolatedPath = interpolatePath({
        path: interpolatedPath,
        params: result.params,
        decoder: router.pathParamsDecoder,
      }).interpolatedPath
    }
    const matchId = route.id + interpolatedPath + deps.hash
    const prev = prevMap ? prevMap[route.id] : findPrevMatch(prevByRoute!, route.id)
    const cached = router._cache[matchId]
    if (cached !== undefined && cached.preload) return false
    const reusable =
      cached &&
      cached.routeId === route.id &&
      cached.status === 'success' &&
      !cached.invalid &&
      !cached.isFetching
        ? cached
        : prev && prev.id === matchId && deepEqual(prev.params, result.params) && !prev.invalid
          ? prev
          : undefined
    if (reusable) {
      reusable.index = i
      reusable.search = search
      reusable._strictSearch = matchStrictSearch
      reusable.loaderDeps = deps.deps
      reusable.cause = prev ? 'stay' : 'enter'
      reusable.publicHref = location.publicHref
      reusable._forcePending = reusable._forcePending || router._forcePending
      matches[i] = reusable
      continue
    }
    const options = route.options
    const needsLoad = !!options.loader
    matches[i] = {
      id: matchId,
      index: i,
      routeId: route.id,
      route,
      pathname: interpolatedPath,
      params: result.params,
      rawParams: result.rawParams,
      _strictParams: result.params,
      _strictSearch: matchStrictSearch,
      status: needsLoad ? 'pending' : 'success',
      isFetching: needsLoad ? 'loader' : false,
      error: undefined,
      context: {},
      search,
      loaderDeps: deps.deps,
      updatedAt: 0,
      abortController: needsLoad ? new AbortController() : noopAbortController,
      cause: prev ? ('stay' as const) : ('enter' as const),
      invalid: false,
      preload: false,
      staticData: options.staticData || {},
      fullPath: route.fullPath,
      ssr: (isServer ?? router.isServer) ? undefined : options.ssr,
      _forcePending: router._forcePending || prev?._forcePending,
      publicHref: location.publicHref,
    } as RouteMatch
  }

  const next = finishWarmMatches(router, location, id, matches, cacheKey, 0)
  return next ?? true
}

export function finishWarmMatches(
  router: any,
  location: ParsedLocation,
  id: number,
  matches: RouteMatch[],
  cacheKey: string,
  start: number,
): void | Promise<void> {
  const now = Date.now()
  let context = {
    ...((start === 0
      ? router.options.context
      : (matches[start - 1]?.context ?? router.options.context)) ?? {}),
  }
  let parallel: WarmParallelState | undefined
  let parentMatchPromise: Promise<RouteMatch> | undefined
  for (let i = start; i < matches.length; i++) {
    if (id !== router.loadId) return
    const match = matches[i]!
    const route = router.routesById[match.routeId]!
    const opts = route.options
    if (opts.context) {
      try {
        const routeContext =
          opts.context({
            params: match.params,
            search: match.search,
            context,
            location,
            navigate: router.navigate,
            buildLocation: router.buildLocation,
            cause: match.cause,
            abortController: match.abortController,
            preload: false,
            matches,
            routeId: route.id,
            deps: match.loaderDeps,
          } as any) || {}
        context = { ...context, ...routeContext }
      } catch (cause) {
        abortWarmFetching(matches, parallel)
        discardSettledWarmMatches(matches, parallel, match)
        return settleWarmFailure(router, location, id, matches, match, route, cause)
      }
    } else {
      context = { ...context }
    }
    match.context = context
    const matchContext = context
    if (!warmMatchNeedsLoader(match, route, router, router._committed, now)) {
      parentMatchPromise = undefined
      continue
    }
    const loader = resolveRouteLoader(opts.loader)
    if (!loader) {
      match.status = 'success'
      match.isFetching = false
      parentMatchPromise = undefined
      continue
    }

    const data = callWarmLoader(
      loader,
      fillWarmLoaderContext(
        match,
        location,
        router.navigate,
        matchContext,
        route,
        matches,
        i > 0 ? (parentMatchPromise ?? Promise.resolve(matches[i - 1]!)) : undefined,
        router.options.additionalContext,
      ),
    )
    if (
      data.ok &&
      data.value != null &&
      typeof (data.value as { then?: unknown }).then === 'function'
    ) {
      parallel ??= { results: [], pending: [], settled: [], canceled: false }
      const state = parallel
      const resultIndex = state.results.length
      state.results.push(undefined)
      const resultPromise = Promise.resolve(data.value).then(
        (value): WarmResult => ({ match, route, context: matchContext, ok: true, value }),
        (value): WarmResult => ({ match, route, context: matchContext, ok: false, value }),
      )
      const matchPromise = resultPromise.then((result) => {
        state.results[resultIndex] = result
        settleWarmSuccess(state, result, Date.now(), id === router.loadId)
        return match
      })
      parentMatchPromise = matchPromise
      state.pending.push(matchPromise.then(() => undefined))
    } else if (parallel) {
      const result = { match, route, context: matchContext, ok: data.ok, value: data.value }
      parallel.results.push(result)
      settleWarmSuccess(parallel, result, now, id === router.loadId)
      parentMatchPromise = undefined
    } else if (!data.ok || isRedirect(data.value) || isNotFound(data.value)) {
      parallel = {
        results: [{ match, route, context: matchContext, ok: data.ok, value: data.value }],
        pending: [],
        settled: [],
        canceled: false,
      }
      parentMatchPromise = undefined
    } else {
      match.loaderData = data.value
      match.status = 'success'
      match.isFetching = false
      match.updatedAt = now
      match.context = matchContext
      parentMatchPromise = undefined
    }
  }

  if (!parallel) {
    leaveWarmMatches(router, matches)
    completeWarmLoad(router, location, matches)
    rememberWarmMatches(router, cacheKey, matches)
    return
  }

  const state = parallel
  const settle = () => {
    if (id !== router.loadId) return
    for (let i = 0; i < state.results.length; i++) {
      const result = state.results[i]!
      if (!result.ok) {
        abortWarmFetching(matches, state)
        discardSettledWarmMatches(matches, state, result.match)
        return settleWarmFailure(
          router,
          location,
          id,
          matches,
          result.match,
          result.route,
          result.value,
        )
      }
      if (isRedirect(result.value)) {
        abortWarmFetching(matches, state)
        discardSettledWarmMatches(matches, state, result.match)
        return followWarmRedirect(router, location, id, matches, result.match, result.value)
      }
      if (isNotFound(result.value)) {
        abortWarmFetching(matches, state)
        discardSettledWarmMatches(matches, state, result.match)
        return importLoadClient(router)
      }
    }
    leaveWarmMatches(router, matches)
    completeWarmLoad(router, location, matches)
    rememberWarmMatches(router, cacheKey, matches)
  }

  return state.pending.length ? Promise.all(state.pending).then(settle) : settle()
}

export function settleWarmFailure(
  router: any,
  location: ParsedLocation,
  id: number,
  matches: RouteMatch[],
  match: RouteMatch,
  route: AnyRoute,
  cause: unknown,
): void | Promise<void> {
  if (isRedirect(cause)) {
    return followWarmRedirect(router, location, id, matches, match, cause)
  }
  if (isNotFound(cause)) return importLoadClient(router)
  let error = cause
  try {
    route.options.onError?.(error)
  } catch (onErrorCause) {
    if (isRedirect(onErrorCause)) {
      return followWarmRedirect(router, location, id, matches, match, onErrorCause)
    }
    if (isNotFound(onErrorCause)) return importLoadClient(router)
    error = onErrorCause
  }
  match.status = 'error'
  match.error = error
  match.isFetching = false
  match.updatedAt = Date.now()
  for (let i = matches.indexOf(match) + 1; i < matches.length; i++) {
    const child = matches[i]!
    child.isFetching = false
  }
  if (id !== router.loadId) return
  leaveWarmMatches(router, matches)
  completeWarmLoad(router, location, matches)
}

export function followWarmRedirect(
  router: any,
  location: ParsedLocation,
  id: number,
  matches: RouteMatch[],
  match: RouteMatch,
  redirect: AnyRedirect,
): void | Promise<void> {
  if (id !== router.loadId) return
  const redirects = (location as ParsedLocation & { _redirects?: number })._redirects ?? 0
  if (redirects >= 20) {
    match.status = 'error'
    match.error = new Error('Too many redirects')
    match.isFetching = false
    match.updatedAt = Date.now()
    for (let i = matches.indexOf(match) + 1; i < matches.length; i++) {
      matches[i]!.isFetching = false
    }
    leaveWarmMatches(router, matches)
    completeWarmLoad(router, location, matches)
    return
  }
  return router.navigate({
    ...redirect.options,
    _redirects: redirects + 1,
    replace: true,
    ignoreBlocker: true,
  } as any)
}

export function prepareCachedWarmMatches(
  router: any,
  matches: RouteMatch[],
  location: ParsedLocation,
): { needsLoader: boolean } | undefined {
  const prevMatches = router._committed
  const now = Date.now()
  let needsLoader = false
  const prevLen = prevMatches.length
  let allStay = prevLen === matches.length && prevLen > 0
  if (allStay) {
    for (let i = 0; i < prevLen; i++) {
      if (prevMatches[i]!.routeId !== matches[i]!.routeId) {
        allStay = false
        break
      }
    }
  }
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i]!
    if (match.status !== 'success' || match.invalid || match.isFetching) return
    const route = router.routesById[match.routeId]
    if (route === undefined || !routeCanWarmLoad(route)) return
    match.cause = allStay || findPrevMatch(prevMatches, match.routeId) ? 'stay' : 'enter'
    match.publicHref = location.publicHref
    if (warmMatchNeedsLoader(match, route, router, prevMatches, now)) needsLoader = true
  }
  return { needsLoader }
}

export function leaveWarmMatches(router: any, matches: RouteMatch[]) {
  const prevMatches = router._committed
  const prevLen = prevMatches.length
  if (prevLen === matches.length) {
    let sameRoutes = true
    for (let i = 0; i < prevLen; i++) {
      if (prevMatches[i]!.routeId !== matches[i]!.routeId) {
        sameRoutes = false
        break
      }
    }
    if (sameRoutes) return
  }
  for (let i = 0; i < prevMatches.length; i++) {
    const left = prevMatches[i]!
    const hook = router.routesById[left.routeId]?.options.onLeave
    if (!hook) continue
    let still = false
    for (let j = 0; j < matches.length; j++) {
      if (matches[j]!.routeId === left.routeId) {
        still = true
        break
      }
    }
    if (still) continue
    hook({
      params: left.params,
      search: left.search,
      context: left.context,
      cause: 'leave',
    } as any)
  }
}

export function completeWarmLoad(router: any, location: ParsedLocation, matches: RouteMatch[]) {
  const prevResolved = router.stores.resolvedLocation.get()
  router._committed = matches
  for (let i = 0; i < matches.length; i++) {
    router._cache[matches[i]!.id] = matches[i]!
  }
  router.batch(() => {
    router.stores.commitIdleNavigation!(location, matches)
  })
  if (router.subscribers.size) {
    const change = getLocationChangeInfo(location, prevResolved)
    router.emit({ type: 'onLoad', ...change })
    router.emit({ type: 'onResolved', ...change })
    router.emit({ type: 'onRendered', ...change })
  }
  const rendered = router._rendered
  if (rendered?.[1]) {
    const settle = rendered[1]
    rendered.length = 0
    settle(true)
  }
}

function findPrevMatch(matches: RouteMatch[], routeId: string) {
  for (let i = 0; i < matches.length; i++) {
    if (matches[i]!.routeId === routeId) return matches[i]
  }
  return undefined
}

function rememberWarmMatches(
  router: { _matchesByPath?: ReturnType<typeof createStringMap<RouteMatch[]>> },
  key: string,
  matches: RouteMatch[],
) {
  const cache = (router._matchesByPath ??= createStringMap<RouteMatch[]>())
  if (cache.get(key) === matches) return
  rememberBounded(cache, key, matches, WARM_MATCH_CACHE_MAX)
}

setWarmLoad(tryWarmLoad)
