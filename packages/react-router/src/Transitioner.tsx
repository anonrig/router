import {
  startTransition as reactStartTransition,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react'
import { getLocationChangeInfo, trimPathRight } from '@anonrig/router-core'
import { useLayoutEffect } from './utils'
import { useRouter } from './useRouter'
import type { AnyRouter } from '@anonrig/router-core'

export function settleOwner(owner: NonNullable<AnyRouter['_rendered']>, rendered: boolean) {
  const settle = owner[1]
  owner.length = 0
  settle?.(rendered)
}

export function Transitioner({ t }: { t?: Dispatch<SetStateAction<AnyRouter | undefined>> }) {
  const router = useRouter()

  useLayoutEffect(() => {
    const acknowledgement = (router._rendered ??= [])

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

    router.updateLatestLocation?.()
    const location = router.latestLocation
    if (location) {
      const nextLocation = router.buildLocation({
        to: location.pathname,
        search: true,
        params: true,
        hash: true,
        state: true,
      })

      if (
        trimPathRight(location.publicHref ?? location.href) !==
        trimPathRight(nextLocation.publicHref ?? nextLocation.href)
      ) {
        void router.commitLocation(nextLocation as any, {
          replace: true,
          ignoreBlocker: true,
        })
      } else {
        const resolvedLocation =
          router.stores.resolvedLocation?.get?.() ?? router.state.resolvedLocation
        if (
          resolvedLocation?.href === location.href &&
          resolvedLocation.state?.__TSR_key === location.state?.__TSR_key
        ) {
          acknowledgement.push(router.stores.matches.get(), (rendered: boolean) => {
            if (rendered) {
              router.emit({
                type: 'onRendered',
                ...getLocationChangeInfo(resolvedLocation, resolvedLocation),
              })
            }
          })
        }
      }
    }

    return () => {
      router.startTransition = (fn: () => void) => {
        fn()
      }
    }
  }, [router, t])

  return null
}

export function useTransitioner() {
  const [, setTick] = useState<AnyRouter | undefined>(undefined)
  return <Transitioner t={setTick} />
}
