export type Listener<T> = (value: T) => void

export type Store<T> = {
  get: () => T
  set: (next: T | ((prev: T) => T)) => void
  subscribe: (listener: Listener<T>) => () => void
}

/** When `schedule` is provided, listener notification is deferred through it. */
export function createStore<T>(initial: T, schedule?: (notify: () => void) => void): Store<T> {
  let value = initial
  let listeners: Set<Listener<T>> | undefined
  return {
    get: () => value,
    set: (next) => {
      const resolved = typeof next === 'function' ? (next as (prev: T) => T)(value) : next
      if (resolved === value) return
      value = resolved
      if (schedule) schedule(() => listeners?.forEach((l) => l(value)))
      else listeners?.forEach((l) => l(value))
    },
    subscribe: (listener) => {
      listeners ??= new Set()
      listeners.add(listener)
      return () => {
        listeners!.delete(listener)
      }
    },
  }
}
