export type Awaitable<T> = T | Promise<T>
export type NoInfer<T> = [T][T extends any ? 0 : never]
export type Expand<T> = T extends infer O ? { [K in keyof O]: O[K] } : never
export type DeepPartial<T> = T extends object
  ? { [P in keyof T]?: DeepPartial<T[P]> }
  : T
export type Assign<TLeft, TRight> = Omit<TLeft, keyof TRight> & TRight
export type IntersectAssign<TLeft, TRight> = TLeft & TRight
export type Constrain<T, TConstraint> = T extends TConstraint ? T : TConstraint
export type ConstrainLiteral<T, TConstraint> = T extends TConstraint ? T : TConstraint
export type PickAsRequired<TValue, TKey extends keyof TValue> = Omit<TValue, TKey> &
  Required<Pick<TValue, TKey>>
export type Updater<TPrevious, TResult = TPrevious> =
  | TResult
  | ((prev?: TPrevious) => TResult)
export type NonNullableUpdater<TPrevious, TResult = TPrevious> =
  | TResult
  | ((prev: TPrevious) => TResult)
export type MergeAll<T> = T
export type LooseReturnType<T> = T extends (...args: any) => infer R ? R : never
export type LooseAsyncReturnType<T> = T extends (...args: any) => infer R
  ? Awaited<R>
  : never

export function functionalUpdate<TPrevious, TResult = TPrevious>(
  updater: Updater<TPrevious, TResult> | NonNullableUpdater<TPrevious, TResult>,
  previous: TPrevious,
): TResult {
  if (typeof updater === 'function') return (updater as Function)(previous)
  return updater
}

export const hasOwn = Object.prototype.hasOwnProperty

export function hasKeys(obj: Record<string, unknown> | undefined | null) {
  if (!obj) return false
  for (const key in obj) {
    if (hasOwn.call(obj, key)) return true
  }
  return false
}

export function last<T>(arr: Array<T>): T | undefined {
  return arr[arr.length - 1]
}

export function findLast<T>(
  arr: Array<T>,
  predicate: (item: T) => boolean,
): T | undefined {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (predicate(arr[i]!)) return arr[i]
  }
}

export function isPlainObject(o: any): o is Record<string, any> {
  if (!o || typeof o !== 'object') return false
  const proto = Object.getPrototypeOf(o)
  return proto === Object.prototype || proto === null
}

export function isPlainArray(value: unknown): value is Array<any> {
  return Array.isArray(value) && value.length === Object.keys(value).length
}

export function replaceEqualDeep<T>(prev: any, next: T): T {
  if (prev === next) return prev
  if (!isPlainObject(prev) && !isPlainArray(prev)) return next
  if (!isPlainObject(next) && !isPlainArray(next)) return next

  const array = isPlainArray(prev) && isPlainArray(next)
  const prevKeys = array ? prev : Object.keys(prev)
  const nextKeys = array ? (next as any) : Object.keys(next as any)
  if (!prevKeys || !nextKeys) return next
  const nextSize = array ? (next as any).length : nextKeys.length
  const copy: any = array ? new Array(nextSize) : {}
  let equalItems = 0
  const prevSize = array ? prev.length : prevKeys.length

  for (let i = 0; i < nextSize; i++) {
    const key = array ? i : (nextKeys as any)[i]
    const p = prev[key]
    const n = (next as any)[key]
    if (p === n) {
      copy[key] = p
      if (array ? i < prevSize : hasOwn.call(prev, key)) equalItems++
      continue
    }
    if (p == null || n == null || typeof p !== 'object' || typeof n !== 'object') {
      copy[key] = n
      continue
    }
    const v = replaceEqualDeep(p, n)
    copy[key] = v
    if (v === p) equalItems++
  }

  return array
    ? equalItems === nextSize && prevSize === nextSize
      ? prev
      : copy
    : equalItems === nextSize && prevSize === nextSize
      ? prev
      : copy
}

export function deepEqual(
  a: any,
  b: any,
  opts?: { partial?: boolean; ignoreUndefined?: boolean },
): boolean {
  if (a === b) return true
  if (a == null || b == null) return a === b
  if (typeof a !== typeof b) return false
  if (typeof a !== 'object') return false

  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i], opts)) return false
    }
    return true
  }

  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (!opts?.partial && aKeys.length !== bKeys.length) return false
  for (let i = 0; i < (opts?.partial ? bKeys.length : aKeys.length); i++) {
    const k = opts?.partial ? bKeys[i]! : aKeys[i]!
    if (opts?.ignoreUndefined && a[k] === undefined && b[k] === undefined) continue
    if (!deepEqual(a[k], b[k], opts)) return false
  }
  return true
}

export function createControlledPromise<T>(onResolve?: (value: T) => void) {
  let resolve!: (value: T) => void
  let reject!: (value?: any) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = (value: T) => {
      onResolve?.(value)
      res(value)
    }
    reject = rej
  }) as Promise<T> & { resolve: typeof resolve; reject: typeof reject; status: string }
  promise.resolve = resolve
  promise.reject = reject
  promise.status = 'pending'
  return promise
}

export function invariant(condition?: any, message?: string): asserts condition {
  if (!condition) {
    throw new Error(message ? `Invariant failed: ${message}` : 'Invariant failed')
  }
}

export const DEFAULT_PROTOCOL_ALLOWLIST = ['http:', 'https:']

export function isDangerousProtocol(href: string) {
  const colon = href.indexOf(':')
  if (colon === -1) return false
  const proto = href.slice(0, colon + 1).toLowerCase()
  return proto !== 'http:' && proto !== 'https:' && proto !== 'mailto:' && proto !== 'tel:'
}

export function encodePathLikeUrl(path: string): string {
  if (!/\s|[^\u0000-\u007F]/.test(path)) return path
  return path.replace(/\s|[^\u0000-\u007F]/gu, encodeURIComponent)
}

export function decodePath(path: string) {
  try {
    return decodeURIComponent(path)
  } catch {
    return path
  }
}

export function isMatch(obj: any, match: any): boolean {
  if (match === undefined) return true
  return deepEqual(obj, match, { partial: true })
}

export function createLRUCache<K, V>(max = 1000) {
  const map = new Map<K, V>()
  return {
    get(key: K): V | undefined {
      const value = map.get(key)
      if (value !== undefined) {
        map.delete(key)
        map.set(key, value)
      }
      return value
    },
    set(key: K, value: V) {
      if (map.has(key)) map.delete(key)
      map.set(key, value)
      if (map.size > max) {
        const first = map.keys().next().value
        if (first !== undefined) map.delete(first)
      }
    },
    clear() {
      map.clear()
    },
  }
}

export type LRUCache<K, V> = ReturnType<typeof createLRUCache<K, V>>
