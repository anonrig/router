export const TSR_DEFERRED_PROMISE = Symbol.for('TSR_DEFERRED_PROMISE')

export type DeferredPromiseState<T = any> = {
  data?: T
  error?: unknown
  status: 'pending' | 'success' | 'error'
}

export type DeferredPromise<T = any> = Promise<T> & {
  [TSR_DEFERRED_PROMISE]: DeferredPromiseState<T>
}

export function defer<T>(promise: Promise<T>): DeferredPromise<T> {
  const deferred = promise as DeferredPromise<T>
  const state: DeferredPromiseState<T> = { status: 'pending' }
  deferred[TSR_DEFERRED_PROMISE] = state
  promise.then(
    (data) => {
      state.data = data
      state.status = 'success'
    },
    (error) => {
      state.error = error
      state.status = 'error'
    },
  )
  return deferred
}
