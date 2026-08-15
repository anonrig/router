import { useRef, useSyncExternalStore } from 'react'
import type { Store } from '@anonrig/router-core'

function defaultSelect<T, U>(state: T): U {
  return state as unknown as U
}

export function useStore<T, U = T>(store: Store<T>, select: (state: T) => U = defaultSelect): U {
  const cache = useRef<U | undefined>(undefined)
  const hasCache = useRef(false)

  const getSnapshot = () => {
    const next = select(store.get())
    if (hasCache.current && Object.is(cache.current, next)) {
      return cache.current as U
    }
    cache.current = next
    hasCache.current = true
    return next
  }

  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot)
}
