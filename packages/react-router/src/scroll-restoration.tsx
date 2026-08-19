import { useEffect } from 'react'
import { useRouter } from './use-router'
import { useRouterState } from './use-router-state'

export function ScrollRestoration(_props?: any) {
  const router = useRouter()
  const href = useRouterState({ select: (s) => s.location.href })
  useEffect(() => {
    if (router.options.scrollRestoration === false) return
    window.scrollTo(0, 0)
  }, [href, router])
  return null
}
