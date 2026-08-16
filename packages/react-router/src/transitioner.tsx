import {
  startTransition as reactStartTransition,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react'
import { getLocationChangeInfo, trimPathRight } from '@anonrig/router-core'
import { useLayoutEffect } from './utils'
import { useRouter } from './use-router'
import type { AnyRouter } from '@anonrig/router-core'

export function settleOwner(owner: NonNullable<AnyRouter['_rendered']>, rendered: boolean) {
  const settle = owner[1]
  owner.length = 0
  settle?.(rendered)
}

export function Transitioner({ t }: { t?: Dispatch<SetStateAction<AnyRouter | undefined>> }) {
  const router = useRouter()
  const acknowledgement = (router._rendered ??= [])
  const mountedFor = useRef<AnyRouter | undefined>(undefined)

  router.startTransition = (fn: () => void, expected?: any) =>
    new Promise((resolve, reject) => {
      settleOwner(acknowledgement, false)
      acknowledgement.push(expected, resolve)
      t?.(router)
      reactStartTransition(() => {
        try {
          fn()
        } catch (cause) {
          if (acknowledgement[1] === resolve) acknowledgement.length = 0
          reject(cause)
        }
      })
    })

  if (process.env.NODE_ENV !== 'production') {
    ;(router as typeof router & { _cancelTransition?: () => void })._cancelTransition = () =>
      settleOwner(acknowledgement, false)
  }

  useLayoutEffect(() => {
    if (!router.unsubHistory) {
      router.update({})
    }
    if (mountedFor.current !== router) {
      mountedFor.current = router

      router.updateLatestLocation?.()
      const location = router.latestLocation
      if (location) {
        const nextLocation = router.buildLocation({
          to: location.pathname,
          search: true,
          params: true,
          hash: true,
          state: true,
          _includeValidateSearch: true,
        })

        if (
          trimPathRight(location.publicHref ?? location.href) !==
          trimPathRight(nextLocation.publicHref ?? nextLocation.href)
        ) {
          void router.commitLocation({
            ...nextLocation,
            replace: true,
            ignoreBlocker: true,
          } as any)
        } else {
          const resolvedLocation =
            router.stores.resolvedLocation?.get?.() ?? router.state.resolvedLocation
          if (
            resolvedLocation?.href === location.href &&
            resolvedLocation.state?.__TSR_key === location.state?.__TSR_key
          ) {
            // Prefer the stable state snapshot. `stores.matches.get()` maps a new
            // array on every call, which would break MatchesInner's identity check.
            acknowledgement.push(router.stores.state.get().matches, (rendered: boolean) => {
              if (rendered) {
                router.emit({
                  type: 'onRendered',
                  ...getLocationChangeInfo(resolvedLocation, resolvedLocation),
                })
              }
            })
          } else if (!router._tx) {
            router.load().catch(console.error)
          }
        }
      }
    }

    return () => {
      const session = router._pending
      if (session) {
        clearTimeout(session[3 /* timer */])
        router._pending = undefined
      }
      router.unsubHistory?.()
      router.unsubHistory = undefined
      mountedFor.current = undefined
    }
  }, [router])

  return null
}

export function useTransitioner() {
  const [, setTick] = useState<AnyRouter | undefined>(undefined)
  return <Transitioner t={setTick} />
}
