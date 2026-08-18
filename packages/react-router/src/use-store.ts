import { useCallback, useRef, useSyncExternalStore } from 'react'
import { deepEqual } from 'speedy-router-core'
import type { Store } from 'speedy-router-core'

function defaultSelect<T, U>(state: T): U {
  return state as unknown as U
}

export function useStore<T, U = T>(
  store: Store<T>,
  select: (state: T) => U = defaultSelect,
  isEqual: (a: U, b: U) => boolean = Object.is,
): U {
  const cacheRef = useRef<{ source: T; selected: U; select: typeof select } | undefined>(undefined)

  const getSnapshot = useCallback(() => {
    const source = store.get()
    const cached = cacheRef.current
    if (cached && cached.source === source && cached.select === select) {
      return cached.selected
    }
    const selected = select(source)
    if (cached && isEqual(cached.selected, selected)) {
      cacheRef.current = { source, selected: cached.selected, select }
      return cached.selected
    }
    if (
      cached &&
      typeof cached.selected === 'object' &&
      cached.selected !== null &&
      deepEqual(cached.selected, selected)
    ) {
      cacheRef.current = { source, selected: cached.selected, select }
      return cached.selected
    }
    cacheRef.current = { source, selected, select }
    return selected
  }, [store, select, isEqual])

  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot)
}
