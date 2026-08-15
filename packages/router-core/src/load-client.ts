import type { AnyRouteMatch } from './router'

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

export const _getRenderedMatches = _getAssetMatches

export async function hydrate(router: any) {
  const dehydrated = router.options.dehydratedData ?? router.ssr?.dehydrated
  if (dehydrated?.matches) {
    router.stores.state.set({
      ...router.state,
      matches: dehydrated.matches,
      location: dehydrated.location ?? router.state.location,
      resolvedLocation: dehydrated.location ?? router.state.resolvedLocation,
      status: 'idle',
      isLoading: false,
    })
  }
  await router.load?.()
}

export async function loadClientRoute() {}
export async function loadRouteChunk() {}
export async function preloadClientRoute() {}
export async function refreshClientRoute() {}
export function replaceRouteChunk() {}
