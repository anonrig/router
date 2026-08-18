import { getElementScrollRestorationEntry } from 'speedy-router-core'
import type { ParsedLocation, ScrollRestorationEntry } from 'speedy-router-core'
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

export type UseElementScrollRestorationOptions = {
  id?: string
  getElement?: () => Window | Element | undefined | null
  getKey?: (location: ParsedLocation) => string
}

export function useElementScrollRestoration(
  opts?: UseElementScrollRestorationOptions,
): ScrollRestorationEntry | undefined {
  const router = useRouter()
  useRouterState({
    select: (state) => state.location.state.__TSR_key ?? state.location.href,
  })

  if (opts?.id) {
    return getElementScrollRestorationEntry(router, {
      id: opts.id,
      getElement: opts.getElement,
      getKey: opts.getKey,
    })
  }
  if (opts?.getElement) {
    return getElementScrollRestorationEntry(router, {
      getElement: opts.getElement,
      getKey: opts.getKey,
    })
  }
  return undefined
}
