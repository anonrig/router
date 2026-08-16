import { useRef, useSyncExternalStore } from 'react'
import { deepEqual } from '@anonrig/router-core'
import type { Store } from '@anonrig/router-core'

function defaultSelect<T, U>(state: T): U {
  return state as unknown as U
}

function snapshotEqual<U>(left: U, right: U, isEqual: (a: U, b: U) => boolean): boolean {
  if (isEqual(left, right)) return true
  return typeof left === 'object' && left !== null && deepEqual(left, right)
}

export function useStore<T, U = T>(
  store: Store<T>,
  select: (state: T) => U = defaultSelect,
  isEqual: (a: U, b: U) => boolean = Object.is,
): U {
  const cache = useRef<U | undefined>(undefined)
  const hasCache = useRef(false)

  const getSnapshot = () => {
    const next = select(store.get())
    if (hasCache.current && snapshotEqual(cache.current as U, next, isEqual)) {
      return cache.current as U
    }
    cache.current = next
    hasCache.current = true
    return next
  }

  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot)
}
