import { useEffect } from 'react'
import { useRouter } from './useRouter'
import { useRouterState } from './useRouterState'

export function ScrollRestoration(_props?: any) {
  const router = useRouter()
  const href = useRouterState({ select: (s) => s.location.href })
  useEffect(() => {
    if (router.options.scrollRestoration === false) return
    window.scrollTo(0, 0)
  }, [href, router])
  return null
}

export function useElementScrollRestoration(_opts?: any) {
  return undefined
}
