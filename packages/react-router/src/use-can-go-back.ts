import { useRouter } from './use-router'
import { useRouterState } from './use-router-state'

export function useCanGoBack() {
  const router = useRouter()
  useRouterState({ select: (s) => s.location.state?.__TSR_index })
  return router.canGoBack()
}
