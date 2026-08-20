// Shared by hydrate and the client coordinator. This module must not import
// `load-client.ts` so SSR `hydrate` can settle without the navigation graph
// (see tests/dce.test.ts).
import { getRoute } from './load-shared'
import type { AnyRouteMatch } from './matches'
import type { AnyRouter } from './router'

type MatchFlight = [outcome: Promise<unknown>, controller: AbortController, leases: number]

type WorkMatch = AnyRouteMatch & {
  _flight?: MatchFlight
}

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

export function releaseOwnedFlight(
  router: AnyRouter,
  match: WorkMatch,
  flight?: MatchFlight,
): AbortController | undefined {
  if (!flight || --flight[2 /* leases */]) {
    return
  }
  if (router._flights?.get(match.id) === flight) {
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
      // Keep work discoverable only while the current lane is still running
      // beforeLoad. Loader planning performs the matching zero-owner sweep.
      return
    }
    router._flights.delete(match.id)
  }
  return flight[1 /* controller */]
}

export function releaseFlight(router: AnyRouter, match: AnyRouteMatch): void {
  const work = match as WorkMatch
  const flight = work._flight
  work._flight = undefined
  releaseOwnedFlight(router, work, flight)?.abort()
}

/**
 * Not passing in a `next` ownership recipient
 * is equivalent to discarding the match resources
 */
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
        router._flights?.get(match.id) === flight &&
        !(process.env.NODE_ENV !== 'production' && router._tx?.[6 /* refresh */]) &&
        next?.some((candidate) => candidate.id === match.id)
      ) {
        // The successor has not made its same-ID reload decision yet.
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
