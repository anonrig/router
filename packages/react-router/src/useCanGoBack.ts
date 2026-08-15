import { useRouter } from './useRouter'
import { useRouterState } from './useRouterState'

export function useCanGoBack() {
  const router = useRouter()
  useRouterState({ select: (s) => s.location.state?.__TSR_index })
  return router.canGoBack()
}
