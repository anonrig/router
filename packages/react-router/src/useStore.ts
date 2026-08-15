import { useCallback, useRef, useSyncExternalStore } from 'react'
import type { Store } from '@anonrig/router-core'

export function useStore<T, U = T>(
  store: Store<T>,
  select: (state: T) => U = (s) => s as unknown as U,
): U {
  const selectRef = useRef(select)
  selectRef.current = select
  const snapshot = useRef<U>(select(store.get()))

  const getSnapshot = useCallback(() => {
    const next = selectRef.current(store.get())
    if (Object.is(snapshot.current, next)) return snapshot.current
    snapshot.current = next
    return next
  }, [store])

  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot)
}
