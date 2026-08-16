import { useCallback, useRef, useSyncExternalStore } from 'react'
import { deepEqual } from '@anonrig/router-core'
import type { Store } from '@anonrig/router-core'

function defaultSelect<T, U>(state: T): U {
  return state as unknown as U
}

export function useStore<T, U = T>(
  store: Store<T>,
  select: (state: T) => U = defaultSelect,
  isEqual: (a: U, b: U) => boolean = Object.is,
): U {
  const selectRef = useRef(select)
  selectRef.current = select
  const isEqualRef = useRef(isEqual)
  isEqualRef.current = isEqual
  const cacheRef = useRef<{ source: T; selected: U } | undefined>(undefined)

  const getSnapshot = useCallback(() => {
    const source = store.get()
    const cached = cacheRef.current
    if (cached && cached.source === source) {
      return cached.selected
    }
    const selected = selectRef.current(source)
    if (cached && isEqualRef.current(cached.selected, selected)) {
      cacheRef.current = { source, selected: cached.selected }
      return cached.selected
    }
    if (
      cached &&
      typeof cached.selected === 'object' &&
      cached.selected !== null &&
      deepEqual(cached.selected, selected)
    ) {
      cacheRef.current = { source, selected: cached.selected }
      return cached.selected
    }
    cacheRef.current = { source, selected }
    return selected
  }, [store])

  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot)
}
