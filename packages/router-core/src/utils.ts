import { isServer } from './is-server'
import type { RouteIds } from './route-info'
import type { AnyRouter } from './router'

export type Awaitable<T> = T | Promise<T>
export type NoInfer<T> = [T][T extends any ? 0 : never]
export type IsAny<TValue, TYesResult, TNoResult = TValue> = 1 extends 0 & TValue
  ? TYesResult
  : TNoResult

export type PickAsRequired<TValue, TKey extends keyof TValue> = Omit<TValue, TKey> &
  Required<Pick<TValue, TKey>>

export type PickRequired<T> = {
  [K in keyof T as undefined extends T[K] ? never : K]: T[K]
}

export type PickOptional<T> = {
  [K in keyof T as undefined extends T[K] ? K : never]: T[K]
}

// from https://stackoverflow.com/a/76458160
export type WithoutEmpty<T> = T extends any ? ({} extends T ? never : T) : never

export type Expand<T> = T extends object
  ? T extends infer O
    ? O extends Function
      ? O
      : { [K in keyof O]: O[K] }
    : never
  : T

export type DeepPartial<T> = T extends object
  ? {
      [P in keyof T]?: DeepPartial<T[P]>
    }
  : T

export type MakeDifferenceOptional<TLeft, TRight> = keyof TLeft & keyof TRight extends never
  ? TRight
  : Omit<TRight, keyof TLeft & keyof TRight> & {
      [K in keyof TLeft & keyof TRight]?: TRight[K]
    }

// from https://stackoverflow.com/a/53955431
// eslint-disable-next-line @typescript-eslint/naming-convention
export type IsUnion<T, U extends T = T> = (
  T extends any ? (U extends T ? false : true) : never
) extends false
  ? false
  : true

export type IsNonEmptyObject<T> = T extends object ? (keyof T extends never ? false : true) : false

export type Assign<TLeft, TRight> = TLeft extends any
  ? TRight extends any
    ? IsNonEmptyObject<TLeft> extends false
      ? TRight
      : IsNonEmptyObject<TRight> extends false
        ? TLeft
        : keyof TLeft & keyof TRight extends never
          ? TLeft & TRight
          : Omit<TLeft, keyof TRight> & TRight
    : never
  : never

export type IntersectAssign<TLeft, TRight> = TLeft extends any
  ? TRight extends any
    ? IsNonEmptyObject<TLeft> extends false
      ? TRight
      : IsNonEmptyObject<TRight> extends false
        ? TLeft
        : TRight & TLeft
    : never
  : never

export type Timeout = ReturnType<typeof setTimeout>

export type Updater<TPrevious, TResult = TPrevious> = TResult | ((prev?: TPrevious) => TResult)

export type NonNullableUpdater<TPrevious, TResult = TPrevious> =
  | TResult
  | ((prev: TPrevious) => TResult)

export type ExtractObjects<TUnion> = TUnion extends MergeAllPrimitive ? never : TUnion

export type PartialMergeAllObject<TUnion> =
  ExtractObjects<TUnion> extends infer TObj
    ? [TObj] extends [never]
      ? never
      : {
          [TKey in TObj extends any ? keyof TObj : never]?: TObj extends any
            ? TKey extends keyof TObj
              ? TObj[TKey]
              : never
            : never
        }
    : never

export type MergeAllPrimitive =
  | ReadonlyArray<any>
  | number
  | string
  | bigint
  | boolean
  | symbol
  | undefined
  | null

export type ExtractPrimitives<TUnion> = TUnion extends MergeAllPrimitive
  ? TUnion
  : TUnion extends object
    ? never
    : TUnion

export type PartialMergeAll<TUnion> = ExtractPrimitives<TUnion> | PartialMergeAllObject<TUnion>

export type Constrain<T, TConstraint, TDefault = TConstraint> =
  | (T extends TConstraint ? T : never)
  | TDefault

export type ConstrainLiteral<T, TConstraint, TDefault = TConstraint> = (T & TConstraint) | TDefault

/**
 * To be added to router types
 */
export type UnionToIntersection<T> = (T extends any ? (arg: T) => any : never) extends (
  arg: infer T,
) => any
  ? T
  : never

/**
 * Merges everything in a union into one object.
 * This mapped type is homomorphic which means it preserves stuff! :)
 */
export type MergeAllObjects<TUnion, TIntersected = UnionToIntersection<ExtractObjects<TUnion>>> = [
  keyof TIntersected,
] extends [never]
  ? never
  : {
      [TKey in keyof TIntersected]: TUnion extends any ? TUnion[TKey & keyof TUnion] : never
    }

export type MergeAll<TUnion> = MergeAllObjects<TUnion> | ExtractPrimitives<TUnion>

export type ValidateJSON<T> = ((...args: Array<any>) => any) extends T
  ? unknown extends T
    ? never
    : 'Function is not serializable'
  : { [K in keyof T]: ValidateJSON<T[K]> }

export type LooseReturnType<T> = T extends (...args: Array<any>) => infer TReturn ? TReturn : never

export type LooseAsyncReturnType<T> = T extends (...args: Array<any>) => infer TReturn
  ? TReturn extends Promise<infer TReturn>
    ? TReturn
    : TReturn
  : never

/**
 * Return the last element of an array.
 * Intended for non-empty arrays used within router internals.
 */
export function last<T>(arr: ReadonlyArray<T>) {
  return arr[arr.length - 1]
}

/**
 * Apply a value-or-updater to a previous value.
 * Accepts either a literal value or a function of the previous value.
 */
export function functionalUpdate<TPrevious, TResult = TPrevious>(
  updater: Updater<TPrevious, TResult> | NonNullableUpdater<TPrevious, TResult>,
  previous: TPrevious,
): TResult {
  if (typeof updater === 'function') {
    return (updater as Function)(previous)
  }

  return updater
}

export const hasOwn = Object.prototype.hasOwnProperty
const isEnumerable = Object.prototype.propertyIsEnumerable

export function hasKeys(obj: Record<string, unknown>) {
  for (const key in obj) {
    if (hasOwn.call(obj, key)) return true
  }
  return false
}

export const createNull = () => Object.create(null)

function firstOwnKey(store: object): string | undefined {
  return Object.keys(store)[0]
}
export const nullReplaceEqualDeep: typeof replaceEqualDeep = (prev, next) =>
  replaceEqualDeep(prev, next, createNull)

/**
 * This function returns `prev` if `_next` is deeply equal.
 * If not, it will replace any deeply equal children of `b` with those of `a`.
 * This can be used for structural sharing between immutable JSON values for example.
 * Do not use this with signals
 */
export function replaceEqualDeep<T>(prev: any, _next: T, _makeObj = () => ({}), _depth = 0): T {
  if (isServer) {
    return _next
  }
  if (prev === _next) {
    return prev
  }

  if (_depth > 500) return _next

  const next = _next as any

  const array = isPlainArray(prev) && isPlainArray(next)

  if (!array && !(isPlainObject(prev) && isPlainObject(next))) return next

  const prevItems = array ? prev : getEnumerableOwnKeys(prev)
  if (!prevItems) return next
  const nextItems = array ? next : getEnumerableOwnKeys(next)
  if (!nextItems) return next
  const prevSize = prevItems.length
  const nextSize = nextItems.length
  const copy: any = array ? new Array(nextSize) : _makeObj()

  let equalItems = 0

  for (let i = 0; i < nextSize; i++) {
    const key = array ? i : (nextItems[i] as any)
    const p = prev[key]
    const n = next[key]

    if (p === n) {
      copy[key] = p
      if (array ? i < prevSize : hasOwn.call(prev, key)) equalItems++
      continue
    }

    if (p === null || n === null || typeof p !== 'object' || typeof n !== 'object') {
      copy[key] = n
      continue
    }

    const v = replaceEqualDeep(p, n, _makeObj, _depth + 1)
    copy[key] = v
    if (v === p) equalItems++
  }

  return prevSize === nextSize && equalItems === prevSize ? prev : copy
}

/**
 * Equivalent to `Reflect.ownKeys`, but ensures that objects are "clone-friendly":
 * will return false if object has any non-enumerable properties.
 *
 * Optimized for the common case where objects have no symbol properties.
 */
function getEnumerableOwnKeys(o: object) {
  // `Object.keys` returns only enumerable own string keys natively (no per-key
  // JS callback). If it has fewer entries than `getOwnPropertyNames` (all own
  // string keys), the object has a non-enumerable own string prop and is not
  // "clone-friendly" -> bail. This replaces an O(n) loop of
  // `propertyIsEnumerable` calls with two native calls.
  const keys = Object.keys(o)
  if (keys.length !== Object.getOwnPropertyNames(o).length) {
    return false
  }

  // Only check symbols if the object has any (most plain objects don't)
  const symbols = Object.getOwnPropertySymbols(o)

  // Fast path: no symbols, return enumerable string keys directly
  if (symbols.length === 0) {
    return keys
  }

  // Slow path: has symbols, include only enumerable ones, bail on any
  // non-enumerable symbol so it round-trips like the string-key check above.
  for (const symbol of symbols) {
    if (!isEnumerable.call(o, symbol)) {
      return false
    }
    ;(keys as Array<string | symbol>).push(symbol)
  }
  return keys
}

// Copied from: https://github.com/jonschlinkert/is-plain-object
export function isPlainObject(o: any) {
  if (!hasObjectPrototype(o)) {
    return false
  }

  // If has modified constructor
  const ctor = o.constructor
  if (typeof ctor === 'undefined') {
    return true
  }

  // If has modified prototype
  const prot = ctor.prototype
  if (!hasObjectPrototype(prot)) {
    return false
  }

  // If constructor does not have an Object-specific method
  if (!prot.hasOwnProperty('isPrototypeOf')) {
    return false
  }

  // Most likely a plain Object
  return true
}

function hasObjectPrototype(o: any) {
  return Object.prototype.toString.call(o) === '[object Object]'
}

/**
 * Check if a value is a "plain" array (no extra enumerable keys).
 */
export function isPlainArray(value: unknown): value is Array<unknown> {
  return Array.isArray(value) && value.length === Object.keys(value).length
}

/**
 * Perform a deep equality check with options for partial comparison and
 * ignoring `undefined` values. Optimized for router state comparisons.
 */
export function deepEqual(
  a: any,
  b: any,
  opts?: { partial?: boolean; ignoreUndefined?: boolean },
): boolean {
  if (a === b) {
    return true
  }

  if (typeof a !== typeof b) {
    return false
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    for (let i = 0, l = a.length; i < l; i++) {
      if (!deepEqual(a[i], b[i], opts)) return false
    }
    return true
  }

  if (isPlainObject(a) && isPlainObject(b)) {
    const ignoreUndefined = opts?.ignoreUndefined ?? true
    if (opts?.partial) {
      return deepEqualPartial(a, b, opts ?? {}, ignoreUndefined)
    }
    return deepEqualObjects(a, b, opts ?? {}, ignoreUndefined)
  }

  return false
}

function deepEqualPartial(
  a: Record<PropertyKey, any>,
  b: Record<PropertyKey, any>,
  opts: { partial?: boolean; ignoreUndefined?: boolean },
  ignoreUndefined: boolean,
): boolean {
  for (const k in b) {
    if (!Object.hasOwn(b, k)) continue
    const bv = b[k]
    if (!ignoreUndefined || bv !== undefined) {
      if (!deepEqual(a[k], bv, opts)) return false
    }
  }
  return !objectHasHiddenOwnKeys(b) || deepEqualOwnKeys(a, b, opts, ignoreUndefined, true)
}

function deepEqualObjects(
  a: Record<PropertyKey, any>,
  b: Record<PropertyKey, any>,
  opts: { partial?: boolean; ignoreUndefined?: boolean },
  ignoreUndefined: boolean,
): boolean {
  let aCount = 0
  let aEnum = 0
  for (const k in a) {
    if (!Object.hasOwn(a, k)) continue
    aEnum++
    if (!ignoreUndefined || a[k] !== undefined) aCount++
  }

  let bCount = 0
  let bEnum = 0
  for (const k in b) {
    if (!Object.hasOwn(b, k)) continue
    bEnum++
    const bv = b[k]
    if (!ignoreUndefined || bv !== undefined) {
      bCount++
      if (bCount > aCount || !deepEqual(a[k], bv, opts)) return false
    }
  }

  if (aCount !== bCount) return false
  if (!objectHasHiddenOwnKeys(a, aEnum) && !objectHasHiddenOwnKeys(b, bEnum)) {
    return true
  }
  return deepEqualOwnKeys(a, b, opts, ignoreUndefined, false)
}

function objectHasHiddenOwnKeys(obj: object, enumerableStringCount?: number): boolean {
  const names = Object.getOwnPropertyNames(obj)
  let enumerable = enumerableStringCount
  if (enumerable === undefined) {
    enumerable = 0
    for (const k in obj) {
      if (Object.hasOwn(obj, k)) enumerable++
    }
  }
  return names.length !== enumerable || Object.getOwnPropertySymbols(obj).length > 0
}

function deepEqualOwnKeys(
  a: Record<PropertyKey, any>,
  b: Record<PropertyKey, any>,
  opts: { partial?: boolean; ignoreUndefined?: boolean } | undefined,
  ignoreUndefined: boolean,
  partial: boolean,
): boolean {
  const bKeys = Reflect.ownKeys(b)
  if (partial) {
    for (let i = 0; i < bKeys.length; i++) {
      const k = bKeys[i]!
      const bv = b[k]
      if (!ignoreUndefined || bv !== undefined) {
        if (!deepEqual(a[k], bv, opts)) return false
      }
    }
    return true
  }

  const aKeys = Reflect.ownKeys(a)
  let aCount = 0
  if (!ignoreUndefined) {
    aCount = aKeys.length
  } else {
    for (let i = 0; i < aKeys.length; i++) {
      if (a[aKeys[i]!] !== undefined) aCount++
    }
  }

  let bCount = 0
  for (let i = 0; i < bKeys.length; i++) {
    const k = bKeys[i]!
    const bv = b[k]
    if (!ignoreUndefined || bv !== undefined) {
      bCount++
      if (bCount > aCount || !deepEqual(a[k], bv, opts)) return false
    }
  }

  return aCount === bCount
}

export type StringLiteral<T> = T extends string ? (string extends T ? string : T) : never

export type ThrowOrOptional<T, TThrow extends boolean> = TThrow extends true ? T : T | undefined

export type StrictOrFrom<
  TRouter extends AnyRouter,
  TFrom,
  TStrict extends boolean = true,
> = TStrict extends false
  ? {
      from?: never
      strict: TStrict
    }
  : {
      from: ConstrainLiteral<TFrom, RouteIds<TRouter['routeTree']>>
      strict?: TStrict
    }

export type ThrowConstraint<TStrict extends boolean, TThrow extends boolean> = TStrict extends false
  ? TThrow extends true
    ? never
    : TThrow
  : TThrow

export type ControlledPromise<T> = Promise<T> & {
  resolve: (value: T) => void
  reject: (value: any) => void
  status: 'pending' | 'resolved' | 'rejected'
  value?: T
}

/**
 * Create a promise with exposed resolve/reject and status fields.
 * Useful for coordinating async router lifecycle operations.
 */
export function createControlledPromise<T>(onResolve?: (value: T) => void) {
  let resolveLoadPromise!: (value: T) => void
  let rejectLoadPromise!: (value: any) => void

  const controlledPromise = new Promise<T>((resolve, reject) => {
    resolveLoadPromise = resolve
    rejectLoadPromise = reject
  }) as ControlledPromise<T>

  controlledPromise.status = 'pending'

  controlledPromise.resolve = (value: T) => {
    controlledPromise.status = 'resolved'
    controlledPromise.value = value
    resolveLoadPromise(value)
    onResolve?.(value)
  }

  controlledPromise.reject = (e) => {
    controlledPromise.status = 'rejected'
    rejectLoadPromise(e)
  }

  return controlledPromise
}

/**
 * Heuristically detect dynamic import "module not found" errors
 * across major browsers for lazy route component handling.
 */
export function isModuleNotFoundError(error: any): boolean {
  // chrome: "Failed to fetch dynamically imported module: http://localhost:5173/src/routes/posts.index.tsx?tsr-split"
  // firefox: "error loading dynamically imported module: http://localhost:5173/src/routes/posts.index.tsx?tsr-split"
  // safari: "Importing a module script failed."
  if (typeof error?.message !== 'string') return false
  return (
    error.message.startsWith('Failed to fetch dynamically imported module') ||
    error.message.startsWith('error loading dynamically imported module') ||
    error.message.startsWith('Importing a module script failed')
  )
}

export function isPromise<T>(value: Promise<Awaited<T>> | T): value is Promise<Awaited<T>> {
  return Boolean(
    value && typeof value === 'object' && typeof (value as Promise<T>).then === 'function',
  )
}

export function findLast<T>(
  array: ReadonlyArray<T>,
  predicate: (item: T) => boolean,
): T | undefined {
  for (let i = array.length - 1; i >= 0; i--) {
    const item = array[i]!
    if (predicate(item)) return item
  }
  return undefined
}

/**
 * Re-encode characters that are unsafe in URL paths.
 * Includes ASCII control characters (0x00-0x1F, 0x7F) and a subset of the
 * WHATWG URL "path percent-encode set" (", <, >, `, {, }).
 *
 * Space (0x20) is intentionally excluded — decodeURI decodes %20 to space
 * and the router stores decoded spaces in location.pathname. The existing
 * encodePathLikeUrl already handles re-encoding spaces for outgoing URLs.
 *
 * These characters are decoded by decodeURI but must remain percent-encoded
 * in paths to match how upstream layers (CDNs, edge middleware, browsers)
 * interpret the URL, preventing infinite redirect loops and path mismatches.
 */
function isUnsafePathChar(c: number) {
  return (
    c <= 0x1f ||
    c === 0x7f ||
    c === 34 ||
    c === 60 ||
    c === 62 ||
    c === 96 ||
    c === 123 ||
    c === 125
  )
}

function sanitizePathSegment(segment: string): string {
  const len = segment.length
  let out = ''
  let last = 0
  for (let i = 0; i < len; i++) {
    const c = segment.charCodeAt(i)
    if (!isUnsafePathChar(c)) continue
    out += segment.slice(last, i) + '%' + c.toString(16).toUpperCase().padStart(2, '0')
    last = i + 1
  }
  return last === 0 ? segment : out + segment.slice(last)
}

function isHexChar(c: number) {
  return (c >= 48 && c <= 57) || (c >= 65 && c <= 70) || (c >= 97 && c <= 102)
}

function decodeMalformedPercent(segment: string): string {
  const len = segment.length
  let out = ''
  let last = 0
  for (let i = 0; i < len - 2; i++) {
    if (segment.charCodeAt(i) !== 37) continue
    if (!isHexChar(segment.charCodeAt(i + 1)) || !isHexChar(segment.charCodeAt(i + 2))) continue
    const match = segment.slice(i, i + 3)
    try {
      out += segment.slice(last, i) + decodeURI(match)
      last = i + 3
      i += 2
    } catch {
      // leave the malformed tag in place
    }
  }
  return last === 0 ? segment : out + segment.slice(last)
}

function decodeSegment(segment: string): string {
  let decoded: string
  try {
    decoded = decodeURI(segment.toWellFormed())
  } catch {
    decoded = decodeMalformedPercent(segment)
  }
  return sanitizePathSegment(decoded)
}

/**
 * Default list of URL protocols to allow in links, redirects, and navigation.
 * Any absolute URL protocol not in this list is treated as dangerous by default.
 */
export const DEFAULT_PROTOCOL_ALLOWLIST = [
  // Standard web navigation
  'http:',
  'https:',

  // Common browser-safe actions
  'mailto:',
  'tel:',
]

export const DEFAULT_PROTOCOL_SET = new Set(DEFAULT_PROTOCOL_ALLOWLIST)

/**
 * Check if a URL string uses a protocol that is not in the allowlist.
 * Returns true for blocked protocols like javascript:, blob:, data:, etc.
 *
 * `URL.parse` correctly normalizes:
 * - Mixed case (JavaScript: → javascript:)
 * - Whitespace/control characters (java\nscript: → javascript:)
 * - Leading whitespace
 *
 * For relative URLs (no protocol), returns false (safe).
 *
 * @param url - The URL string to check
 * @param allowlist - Set of protocols to allow
 * @returns true if the URL uses a protocol that is not allowed
 */
export function isDangerousProtocol(url: string, allowlist: Set<string>): boolean {
  if (!url) return false

  // URL.parse normalizes protocols per the WHATWG URL spec and returns
  // null for relative URLs (no protocol). Those are safe.
  const parsed = URL.parse(url)
  return parsed !== null && !allowlist.has(parsed.protocol)
}

// This utility is based on https://github.com/zertosh/htmlescape
// License: https://github.com/zertosh/htmlescape/blob/0527ca7156a524d256101bb310a9f970f63078ad/LICENSE
/**
 * Escape HTML special characters in a string to prevent XSS attacks
 * when embedding strings in script tags during SSR.
 *
 * This is essential for preventing XSS vulnerabilities when user-controlled
 * content is embedded in inline scripts.
 */
export function escapeHtml(str: string): string {
  const len = str.length
  let out = ''
  let last = 0
  for (let i = 0; i < len; i++) {
    const c = str.charCodeAt(i)
    let escaped: string | undefined
    if (c === 38) escaped = '\\u0026'
    else if (c === 62) escaped = '\\u003e'
    else if (c === 60) escaped = '\\u003c'
    else if (c === 0x2028) escaped = '\\u2028'
    else if (c === 0x2029) escaped = '\\u2029'
    else continue
    out += str.slice(last, i) + escaped
    last = i + 1
  }
  return last === 0 ? str : out + str.slice(last)
}

export function decodePath(path: string) {
  if (!path) return { path, handledProtocolRelativeURL: false }

  // Fast path: most paths are already decoded and safe.
  // Only fall back to the slower scan when we see a '%' (encoded),
  // a backslash (explicitly handled), a control character, or a protocol-relative
  // prefix which needs collapsing.
  const len = path.length
  if (!(len >= 2 && path.charCodeAt(0) === 47 && path.charCodeAt(1) === 47)) {
    let encoded = false
    for (let i = 0; i < len; i++) {
      const c = path.charCodeAt(i)
      if (c === 37 || c === 92 || c <= 0x1f || c === 0x7f) {
        encoded = true
        break
      }
    }
    if (!encoded) return { path, handledProtocolRelativeURL: false }
  }

  let cursor = 0
  let result = ''
  const pathLen = path.length
  for (let i = 0; i < pathLen - 2; i++) {
    if (path.charCodeAt(i) !== 37) continue
    const a = path.charCodeAt(i + 1) | 32
    const b = path.charCodeAt(i + 2) | 32
    if ((a !== 50 || b !== 53) && (a !== 53 || b !== 99)) continue
    result += decodeSegment(path.slice(cursor, i)) + path.slice(i, i + 3)
    cursor = i + 3
    i += 2
  }
  result += decodeSegment(cursor ? path.slice(cursor) : path)

  // Prevent open redirect via protocol-relative URLs (e.g. "//evil.com")
  // This is defense-in-depth: since control characters are no longer decoded,
  // paths like "/%0d/evil.com" can no longer become "//evil.com". But we keep
  // this check to guard against other edge cases.
  let handledProtocolRelativeURL = false
  // decodeURI leaves %2F encoded, so /%2Fevil.com would otherwise stay raw.
  while (
    result.length >= 4 &&
    result.charCodeAt(0) === 47 &&
    result.charCodeAt(1) === 37 &&
    (result.charCodeAt(2) | 32) === 50 &&
    (result.charCodeAt(3) | 32) === 102
  ) {
    handledProtocolRelativeURL = true
    result = '/' + result.slice(4)
  }
  if (result.charCodeAt(0) === 47 && result.charCodeAt(1) === 47) {
    handledProtocolRelativeURL = true
    let i = 0
    while (i < result.length && result.charCodeAt(i) === 47) i++
    result = '/' + result.slice(i)
  }

  return { path: result, handledProtocolRelativeURL }
}

/**
 * Encodes a path the same way `new URL()` would, but without the overhead of full URL parsing.
 *
 * This function encodes:
 * - Whitespace characters (spaces → %20, tabs → %09, etc.)
 * - Non-ASCII/Unicode characters (emojis, accented characters, etc.)
 *
 * It preserves:
 * - Already percent-encoded sequences (won't double-encode %2F, %25, etc.)
 * - ASCII special characters valid in URL paths (@, $, &, +, etc.)
 * - Forward slashes as path separators
 *
 * Used to generate proper href values for SSR without constructing URL objects.
 *
 * @example
 * encodePathLikeUrl('/path/file name.pdf') // '/path/file%20name.pdf'
 * encodePathLikeUrl('/path/日本語') // '/path/%E6%97%A5%E6%9C%AC%E8%AA%9E'
 * encodePathLikeUrl('/path/already%20encoded') // '/path/already%20encoded' (preserved)
 */
/**
 * `encodeURIComponent` throws `URIError` on lone surrogates. `toWellFormed`
 * is a no-op on well-formed strings and otherwise replaces unpaired
 * surrogates with U+FFFD, the same as `URLSearchParams`.
 */
export function encodeURIComponentWellFormed(str: string): string {
  return encodeURIComponent(str.toWellFormed())
}

function encodeWhitespaceAndNonAscii(path: string): string {
  let out = ''
  let last = 0
  const len = path.length
  for (let i = 0; i < len;) {
    const c = path.charCodeAt(i)
    let end = i + 1
    if (c >= 0xd800 && c <= 0xdbff && end < len) {
      const lo = path.charCodeAt(end)
      if (lo >= 0xdc00 && lo <= 0xdfff) end++
    }
    const cp = end === i + 2 ? path.codePointAt(i)! : c
    if (cp === 0x20 || (cp >= 0x09 && cp <= 0x0d) || cp > 0x7f) {
      out += path.slice(last, i) + encodeURIComponentWellFormed(path.slice(i, end))
      last = end
    }
    i = end
  }
  return last === 0 ? path : out + path.slice(last)
}

function unescapeEncodedBrackets(encoded: string): string {
  if (encoded.indexOf('%5') === -1) return encoded
  let out = ''
  let last = 0
  const len = encoded.length
  for (let i = 0; i < len - 2; i++) {
    if (encoded.charCodeAt(i) !== 37) continue
    if ((encoded.charCodeAt(i + 1) | 32) !== 53) continue
    const third = encoded.charCodeAt(i + 2) | 32
    if (third === 98) {
      out += encoded.slice(last, i) + '['
      last = i + 3
      i += 2
    } else if (third === 100) {
      out += encoded.slice(last, i) + ']'
      last = i + 3
      i += 2
    }
  }
  return last === 0 ? encoded : out + encoded.slice(last)
}

export function encodePathLikeUrl(path: string): string {
  // Encode whitespace and non-ASCII characters that browsers encode in URLs
  const pathLen = path.length
  let needsEncode = false
  for (let i = 0; i < pathLen; i++) {
    const c = path.charCodeAt(i)
    if (c === 0x20 || (c >= 0x09 && c <= 0x0d) || c > 0x7f) {
      needsEncode = true
      break
    }
  }
  const encoded = needsEncode ? encodeWhitespaceAndNonAscii(path) : path
  // Browsers leave [] in pathnames; interpolatePath keeps them encoded so core
  // path tests stay strict. Public hrefs unescape them for Link/history.
  return unescapeEncodedBrackets(encoded)
}

/**
 * Builds the dev-mode CSS styles URL for route-scoped CSS collection.
 * Used by HeadContent components in all framework implementations to construct
 * the URL for the `/@tanstack-start/styles.css` endpoint.
 *
 * @param basepath - The router's basepath (may or may not have leading slash)
 * @param routeIds - Array of matched route IDs to include in the CSS collection
 * @returns The full URL path for the dev styles CSS endpoint
 */
function trimSlashes(value: string): string {
  let start = 0
  let end = value.length
  while (start < end && value.charCodeAt(start) === 47) start++
  while (end > start && value.charCodeAt(end - 1) === 47) end--
  return start === 0 && end === value.length ? value : value.slice(start, end)
}

export function buildDevStylesUrl(basepath: string, routeIds: Array<string>): string {
  // Trim all leading and trailing slashes from basepath
  const trimmedBasepath = trimSlashes(basepath)
  // Build normalized basepath: empty string for root, or '/path' for non-root
  const normalizedBasepath = trimmedBasepath === '' ? '' : `/${trimmedBasepath}`
  return `${normalizedBasepath}/@tanstack-start/styles.css?routes=${encodeURIComponentWellFormed(routeIds.join(','))}`
}

export function arraysEqual<T>(a: Array<T>, b: Array<T>) {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

/** Null-prototype string dictionary. Faster than Map for string keys. */
export class StringMap<V> {
  private store: Record<string, V> = Object.create(null)
  private _size = 0

  get(key: string): V | undefined {
    return this.store[key]
  }

  set(key: string, value: V) {
    if (!(key in this.store)) this._size++
    this.store[key] = value
    return this
  }

  has(key: string) {
    return key in this.store
  }

  delete(key: string) {
    if (!(key in this.store)) return false
    delete this.store[key]
    this._size--
    return true
  }

  clear() {
    const store = this.store
    for (const key in store) delete store[key]
    this._size = 0
  }

  get size() {
    return this._size
  }

  keys(): Iterator<string> {
    return (function* (store: Record<string, V>) {
      for (const key in store) yield key
    })(this.store)
  }

  *values(): IterableIterator<V> {
    const store = this.store
    for (const key in store) yield store[key]!
  }

  *[Symbol.iterator](): IterableIterator<[string, V]> {
    const store = this.store
    for (const key in store) yield [key, store[key]!]
  }
}

export function createStringMap<V>() {
  return new StringMap<V>()
}

export function rememberBounded<V>(map: StringMap<V>, key: string, value: V, max: number) {
  if (map.size >= max && !map.has(key)) {
    const first = map.keys().next().value
    if (first !== undefined) map.delete(first)
  }
  map.set(key, value)
}

export function evictOldest<V>(store: Record<string, V>) {
  const first = firstOwnKey(store)
  if (first !== undefined) delete store[first]
}

export function objectValues<T>(store: Record<string, T>): T[] {
  const out: T[] = []
  for (const key in store) out.push(store[key]!)
  return out
}

export function createLRUCache<K, V>(max = 1000) {
  const store: Record<string, V> = Object.create(null)
  let size = 0
  return {
    get(key: K): V | undefined {
      const k = key as string
      if (!(k in store)) return undefined
      const value = store[k]!
      delete store[k]
      store[k] = value
      return value
    },
    set(key: K, value: V) {
      const k = key as string
      if (k in store) {
        delete store[k]
      } else if (size >= max) {
        evictOldest(store)
      } else {
        size++
      }
      store[k] = value
    },
    clear() {
      for (const key in store) delete store[key]
      size = 0
    },
  }
}

export type LRUCache<K, V> = ReturnType<typeof createLRUCache<K, V>>

export function invariant(condition?: any, message?: string): asserts condition {
  if (!condition) {
    throw new Error(message ? `Invariant failed: ${message}` : 'Invariant failed')
  }
}

export function isMatch(obj: any, match: any): boolean {
  if (match === undefined) return true
  return deepEqual(obj, match, { partial: true })
}
