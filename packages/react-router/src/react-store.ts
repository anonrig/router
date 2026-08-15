import { useEffect, useRef, useState } from 'react'

type Readable<T> = {
  get: () => T
  subscribe: (listener: (value: T) => void) => () => void
}

export function useStore<T, TSelected = T>(
  store: Readable<T>,
  selector: (state: T) => TSelected = (state) => state as unknown as TSelected,
  equals: (a: TSelected, b: TSelected) => boolean = Object.is,
): TSelected {
  const selectorRef = useRef(selector)
  selectorRef.current = selector
  const equalsRef = useRef(equals)
  equalsRef.current = equals

  const [value, setValue] = useState(() => selector(store.get()))

  useEffect(() => {
    const apply = (nextState: T) => {
      const next = selectorRef.current(nextState)
      setValue((prev) => (equalsRef.current(prev, next) ? prev : next))
    }
    apply(store.get())
    return store.subscribe(apply)
  }, [store])

  return value
}
