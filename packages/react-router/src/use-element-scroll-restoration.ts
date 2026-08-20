import { getElementScrollRestorationEntry } from 'speedy-router-core'
import type { ParsedLocation, ScrollRestorationEntry } from 'speedy-router-core'
import { useRouter } from './use-router'
import { useRouterState } from './use-router-state'

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

  if (!opts?.id && !opts?.getElement) return undefined
  return getElementScrollRestorationEntry(router, {
    id: opts.id,
    getElement: opts.getElement,
    getKey: opts.getKey,
  } as Parameters<typeof getElementScrollRestorationEntry>[1])
}
