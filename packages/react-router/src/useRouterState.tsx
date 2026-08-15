import { useRouter } from './useRouter'
import { useStore } from './useStore'
import type { RouterState } from '@anonrig/router-core'

export function useRouterState<TSelected = RouterState>(opts?: {
  select?: (state: RouterState) => TSelected
  structuralSharing?: boolean
}): TSelected {
  const router = useRouter()
  return useStore(router.stores.state, opts?.select ?? ((s) => s as TSelected))
}
