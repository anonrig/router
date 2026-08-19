import {
  startTransition as reactStartTransition,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react'
import { getLocationChangeInfo, trimPathRight } from 'speedy-router-core'
import { useLayoutEffect } from './utils'
import { useRouter } from './use-router'
import type { AnyRouter } from 'speedy-router-core'

export function settleOwner(owner: NonNullable<AnyRouter['_rendered']>, rendered: boolean) {
  const settle = owner[1]
  owner.length = 0
  settle?.(rendered)
}

type CoreTransition = AnyRouter['startTransition']

interface WrappedTransition {
  (fn: () => void, expected?: any): Promise<boolean>
  /** Identifies the Transitioner instance that installed this wrapper. */
  owner: object
  /** The implementation this wrapper replaced. */
  core: CoreTransition
}

function installTransition(router: AnyRouter, wrapper: WrappedTransition) {
  const current = router.startTransition as CoreTransition & Partial<WrappedTransition>
  if (current === wrapper) return
  // Re-installing over an earlier wrapper of the same instance must keep the core
  // implementation, otherwise unmount would restore a wrapper instead of the core.
  wrapper.core = current.owner === wrapper.owner ? current.core! : current
  router.startTransition = wrapper
}

function uninstallTransition(router: AnyRouter, owner: object) {
  const current = router.startTransition as CoreTransition & Partial<WrappedTransition>
  if (current.owner === owner) router.startTransition = current.core!
}

export function Transitioner({ t }: { t?: Dispatch<SetStateAction<AnyRouter | undefined>> }) {
  const router = useRouter()
  const acknowledgement = (router._rendered ??= [])
  const mountedFor = useRef<AnyRouter | undefined>(undefined)
  const installedTransition = useRef<WrappedTransition | undefined>(undefined)

  const transition = ((fn: () => void, expected?: any) =>
    new Promise<boolean>((resolve) => {
      settleOwner(acknowledgement, false)
      acknowledgement.push(expected, resolve)
      t?.(router)
      reactStartTransition(fn)
    })) as WrappedTransition
  // The ref object is a stable per-instance identity, so it doubles as the owner tag.
  transition.owner = installedTransition
  installTransition(router, transition)
  installedTransition.current = transition

  useLayoutEffect(() => {
    // Effects can remount without a re-render (Strict Mode's extra pass, Activity
    // hide/show), so the wrapper has to be reinstalled here and not only in render.
    const wrapper = installedTransition.current
    if (wrapper) installTransition(router, wrapper)
    router._attachHistory?.()
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
        clearTimeout(session[3 /* revealTimer */])
        router._pending = undefined
      }
      settleOwner(acknowledgement, false)
      uninstallTransition(router, installedTransition)
      router._detachHistory?.()
      mountedFor.current = undefined
    }
  }, [router])

  return null
}

export function useTransitioner() {
  const [, setTick] = useState<AnyRouter | undefined>(undefined)
  return <Transitioner t={setTick} />
}
