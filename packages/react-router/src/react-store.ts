import { useRef, useSyncExternalStore } from 'react'

type Readable<T> = {
  get: () => T
  subscribe: (listener: (value: T) => void) => () => void
}

function defaultSelect<T, TSelected>(state: T): TSelected {
  return state as unknown as TSelected
}

export function useStore<T, TSelected = T>(
  store: Readable<T>,
  selector: (state: T) => TSelected = defaultSelect,
  equals: (a: TSelected, b: TSelected) => boolean = Object.is,
): TSelected {
  const cache = useRef<TSelected | undefined>(undefined)
  const hasCache = useRef(false)

  const getSnapshot = () => {
    const next = selector(store.get())
    if (hasCache.current && equals(cache.current as TSelected, next)) {
      return cache.current as TSelected
    }
    cache.current = next
    hasCache.current = true
    return next
  }

  return useSyncExternalStore(
    (onStoreChange) => store.subscribe(() => onStoreChange()),
    getSnapshot,
    getSnapshot,
  )
}
