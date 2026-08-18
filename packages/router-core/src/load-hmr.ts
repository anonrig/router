import { awaitCurrent, loadClientRoute, type CoordinatorRouter } from './load-client'

export async function refreshClientRoute(router: CoordinatorRouter): Promise<void> {
  const pending = router._tx
  if (pending && !pending[6 /* refresh */] && router.stores.status.get() === 'pending') {
    await pending[5 /* done */]
    if (router._tx !== pending) {
      await awaitCurrent(router, pending)
    }
  }
  // Existing owners remain presented but cannot donate stale work.
  router._flights?.clear()
  router.clearCache()
  router._refreshNextLoad = true
  await loadClientRoute(router, { sync: true })
}
