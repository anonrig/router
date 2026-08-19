import { createStore } from './store'
import type { ParsedLocation } from './location'
import type { RouterState } from './router'

export function createServerRouterStores(
  router: { batch: (fn: () => void) => void },
  location: ParsedLocation,
  stores: any,
  setMatches: (nextMatches: any[]) => void,
  batch: (fn: () => void) => void,
) {
  router.batch = batch
  const state = createStore<RouterState>({
    status: 'pending',
    isLoading: true,
    isTransitioning: false,
    matches: [],
    location,
    resolvedLocation: undefined,
    statusCode: 200,
  })
  const publishMatches = (nextMatches: any[]) => {
    setMatches(nextMatches)
    const current = state.get()
    if (!current) return
    const status = stores.status.get()
    const nextLocation = stores.location.get()
    const nextResolved = stores.resolvedLocation.get()
    const isLoading = status === 'pending'
    if (
      current.matches === nextMatches &&
      current.status === status &&
      current.location === nextLocation &&
      current.resolvedLocation === nextResolved &&
      current.isLoading === isLoading
    ) {
      return
    }
    state.set({
      ...current,
      matches: nextMatches,
      status,
      isLoading,
      isTransitioning: isLoading,
      location: nextLocation,
      resolvedLocation: nextResolved,
    })
  }
  return Object.assign(stores, {
    state,
    setMatches: publishMatches,
    commitIdleNavigation: (nextLocation: ParsedLocation, nextMatches: any[]) => {
      if (stores.status.get() !== 'idle') stores.status.set('idle')
      stores.location.set(nextLocation)
      stores.resolvedLocation.set(nextLocation)
      setMatches(nextMatches)
      const current = state.get()
      if (
        !current ||
        current.status !== 'idle' ||
        current.isLoading ||
        current.isTransitioning ||
        current.matches !== nextMatches ||
        current.location !== nextLocation ||
        current.resolvedLocation !== nextLocation ||
        current.statusCode !== 200 ||
        current.pendingMatches
      ) {
        state.set({
          status: 'idle',
          isLoading: false,
          isTransitioning: false,
          matches: nextMatches,
          pendingMatches: undefined,
          location: nextLocation,
          resolvedLocation: nextLocation,
          statusCode: 200,
        })
      }
    },
  })
}
