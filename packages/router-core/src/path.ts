import {
  SEGMENT_TYPE_OPTIONAL_PARAM,
  SEGMENT_TYPE_PARAM,
  SEGMENT_TYPE_PATHNAME,
  SEGMENT_TYPE_WILDCARD,
  parseSegment,
} from './parse-segment'
import { encodeURIComponentWellFormed } from './utils'

export function joinPaths(paths: Array<string | undefined>) {
  let out = ''
  for (let i = 0; i < paths.length; i++) {
    const val = paths[i]
    if (!val) continue
    if (out.length && out.charCodeAt(out.length - 1) !== 47 && val.charCodeAt(0) !== 47) {
      out += '/'
    } else if (out.length && out.charCodeAt(out.length - 1) === 47 && val.charCodeAt(0) === 47) {
      out += val.slice(1)
      continue
    }
    out += val
  }
  return cleanPath(out)
}

export function cleanPath(path: string) {
  const first = path.indexOf('//')
  return first === -1 ? path : collapseSlashes(path, first)
}

function collapseSlashes(path: string, first: number) {
  let out = path.slice(0, first + 1)
  let i = first + 2
  const len = path.length
  while (i < len && path.charCodeAt(i) === 47) i++
  let last = i
  while (i < len) {
    if (path.charCodeAt(i) === 47 && i + 1 < len && path.charCodeAt(i + 1) === 47) {
      out += path.slice(last, i + 1)
      i += 2
      while (i < len && path.charCodeAt(i) === 47) i++
      last = i
      continue
    }
    i++
  }
  return out + path.slice(last)
}

export function trimPathLeft(path: string) {
  if (path === '/') return path
  let i = 0
  while (path.charCodeAt(i) === 47) i++
  return i === 0 ? path : path.slice(i)
}

export function trimPathRight(path: string) {
  const len = path.length
  if (len <= 1 || path.charCodeAt(len - 1) !== 47) return path
  let i = len - 1
  while (i > 0 && path.charCodeAt(i) === 47) i--
  return path.slice(0, i + 1)
}

export function trimPath(path: string) {
  return trimPathRight(trimPathLeft(path))
}

export function removeTrailingSlash(value: string, basepath: string): string {
  if (!value || value === '/' || value.charCodeAt(value.length - 1) !== 47) return value
  const baseLen = basepath.length
  if (baseLen > 0) {
    const baseEndsWithSlash = basepath.charCodeAt(baseLen - 1) === 47
    const targetLen = baseEndsWithSlash ? baseLen : baseLen + 1
    if (value.length === targetLen && value.startsWith(basepath)) {
      return value
    }
  }
  return value.slice(0, -1)
}

export function exactPathTest(pathName1: string, pathName2: string, basepath: string): boolean {
  return removeTrailingSlash(pathName1, basepath) === removeTrailingSlash(pathName2, basepath)
}

interface ResolvePathOptions {
  base: string
  to: string
  trailingSlash?: 'always' | 'never' | 'preserve'
  cache?: { get(key: string): string | undefined; set(key: string, value: string): void }
}

export function resolvePath({ base, to, trailingSlash = 'never', cache }: ResolvePathOptions) {
  const isBase = to === '.'
  const isAbsolute = to.charCodeAt(0) === 47

  let key: string | undefined
  if (cache) {
    key = isAbsolute ? to : isBase ? base : base + '\0' + to
    if (trailingSlash !== 'never') key += '\0' + trailingSlash
    const cached = cache.get(key)
    if (cached) return cached
  }

  if (isAbsolute && !hasDotSegment(to)) {
    const result = cleanPath(to) || '/'
    const hasSlash = result.length > 1 && result.charCodeAt(result.length - 1) === 47
    let finalPath = result
    if (trailingSlash === 'never' && hasSlash) {
      finalPath = result.slice(0, -1)
    } else if (trailingSlash === 'always' && !hasSlash && result !== '/') {
      finalPath = result + '/'
    } else if (trailingSlash === 'preserve') {
      const toEndedWithSlash = to.length > 1 && to.charCodeAt(to.length - 1) === 47
      if (toEndedWithSlash && !hasSlash && result !== '/') {
        finalPath = result + '/'
      } else if (!toEndedWithSlash && hasSlash) {
        finalPath = result.slice(0, -1)
      }
    }
    if (cache && key) cache.set(key, finalPath)
    return finalPath
  }

  let baseSegments: Array<string>
  if (isBase) {
    baseSegments = splitPath(base)
  } else if (isAbsolute) {
    baseSegments = splitPath(to)
  } else {
    baseSegments = splitPath(base)
    while (baseSegments.length > 1 && baseSegments[baseSegments.length - 1] === '') {
      baseSegments.pop()
    }

    const toSegments = splitPath(to)
    for (let index = 0, length = toSegments.length; index < length; index++) {
      const value = toSegments[index]!
      if (value === '') {
        if (!index) baseSegments = [value]
        else if (index === length - 1) baseSegments.push(value)
      } else if (value === '..') {
        if (baseSegments.length > 1) baseSegments.pop()
        else baseSegments = ['']
      } else if (value !== '.') {
        baseSegments.push(value)
      }
    }
  }

  if (baseSegments.length > 1) {
    if (baseSegments[baseSegments.length - 1] === '') {
      if (trailingSlash === 'never') baseSegments.pop()
    } else if (trailingSlash === 'always') {
      baseSegments.push('')
    }
  }

  const result = cleanPath(baseSegments.join('/')) || '/'
  if (cache && key) cache.set(key, result)
  return result
}

function hasDotSegment(path: string) {
  let start = 0
  for (let i = 0; i <= path.length; i++) {
    if (i !== path.length && path.charCodeAt(i) !== 47) continue
    const len = i - start
    if (len === 1 && path.charCodeAt(start) === 46) return true
    if (len === 2 && path.charCodeAt(start) === 46 && path.charCodeAt(start + 1) === 46) return true
    start = i + 1
  }
  return false
}

function splitPath(path: string): string[] {
  const out: string[] = []
  let last = 0
  for (let i = 0; i <= path.length; i++) {
    if (i === path.length || path.charCodeAt(i) === 47) {
      out.push(path.slice(last, i))
      last = i + 1
    }
  }
  return out
}

export function compileDecodeCharMap(pathParamsAllowedCharacters: ReadonlyArray<string>) {
  const charMap: Record<string, string> = Object.create(null)
  const keys: string[] = []
  for (let i = 0; i < pathParamsAllowedCharacters.length; i++) {
    const char = pathParamsAllowedCharacters[i]!
    const key = encodeURIComponentWellFormed(char)
    charMap[key] = char
    keys.push(key)
  }
  const pattern = keys.map((key) => key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  const regex = new RegExp(pattern, 'g')
  return (encoded: string) => encoded.replace(regex, (match) => charMap[match] ?? match)
}

interface InterpolatePathOptions {
  path?: string
  params: Record<string, unknown>
  decoder?: (encoded: string) => string
  server?: boolean
}

export type InterPolatePathResult = {
  interpolatedPath: string
  usedParams: Record<string, unknown>
  isMissingParams: boolean
}

function isUnreservedPathValue(value: string) {
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i)
    if (
      (c >= 48 && c <= 57) ||
      (c >= 65 && c <= 90) ||
      (c >= 97 && c <= 122) ||
      c === 45 ||
      c === 46 ||
      c === 95 ||
      c === 126
    ) {
      continue
    }
    return false
  }
  return true
}

function encodePathParam(value: string, decoder?: InterpolatePathOptions['decoder']) {
  if (!decoder && isUnreservedPathValue(value)) return value
  const encoded = encodeURIComponentWellFormed(value)
  const decoded = decoder?.(encoded) ?? encoded
  // Browsers leave these in pathnames; encodeURIComponent is stricter.
  return unescapeEncodedExclamation(decoded)
}

function unescapeEncodedExclamation(decoded: string): string {
  if (decoded.indexOf('%2') === -1) return decoded
  let out = ''
  let last = 0
  const len = decoded.length
  for (let i = 0; i < len - 2; i++) {
    if (decoded.charCodeAt(i) !== 37) continue
    if ((decoded.charCodeAt(i + 1) | 32) !== 50) continue
    if ((decoded.charCodeAt(i + 2) | 32) !== 49) continue
    out += decoded.slice(last, i) + '!'
    last = i + 3
    i += 2
  }
  return last === 0 ? decoded : out + decoded.slice(last)
}

type SimplePart = { t: 0; s: string } | { t: 1; k: string }

function compileSimpleParams(path: string): SimplePart[] | null {
  const parts: SimplePart[] = []
  let i = 0
  const len = path.length
  let litStart = 0
  while (i < len) {
    if (path.charCodeAt(i) !== 36) {
      i++
      continue
    }
    let j = i + 1
    while (j < len && path.charCodeAt(j) !== 47) j++
    if (j === i + 1) return null
    if (i > litStart) parts.push({ t: 0, s: path.slice(litStart, i) })
    parts.push({ t: 1, k: path.slice(i + 1, j) })
    i = j
    litStart = j
  }
  if (litStart < len) parts.push({ t: 0, s: path.slice(litStart) })
  return parts
}

function interpolateSimpleParams(
  path: string,
  params: InterpolatePathOptions['params'],
  decoder: InterpolatePathOptions['decoder'],
): InterPolatePathResult | null {
  const parts = compileSimpleParams(path)
  if (!parts) return null
  const usedParams: Record<string, unknown> = Object.create(null)
  let isMissingParams = false
  let out = ''
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!
    if (part.t === 0) {
      out += part.s
      continue
    }
    if (!isMissingParams && !(part.k in params)) isMissingParams = true
    usedParams[part.k] = params[part.k]
    out += encodeParam(part.k, params, decoder) ?? 'undefined'
  }
  return { interpolatedPath: out || '/', usedParams, isMissingParams }
}

function encodeParam(
  key: string,
  params: InterpolatePathOptions['params'],
  decoder: InterpolatePathOptions['decoder'],
): any {
  const value = key === '_splat' ? (params._splat ?? params['*']) : params[key]
  if (typeof value !== 'string') return value
  if (key === '_splat') {
    let safe = true
    for (let i = 0; i < value.length; i++) {
      const c = value.charCodeAt(i)
      if (
        !(
          (c >= 48 && c <= 57) ||
          (c >= 65 && c <= 90) ||
          (c >= 97 && c <= 122) ||
          c === 45 ||
          c === 46 ||
          c === 95 ||
          c === 126 ||
          c === 33 ||
          c === 47
        )
      ) {
        safe = false
        break
      }
    }
    if (safe) return value
    const parts = value.split('/')
    for (let i = 0; i < parts.length; i++) {
      parts[i] = encodePathParam(parts[i]!, decoder)
    }
    return parts.join('/')
  }
  return encodePathParam(value, decoder)
}

export function interpolatePath({
  path,
  params,
  decoder,
}: InterpolatePathOptions): InterPolatePathResult {
  return interpolatePathResolved(path, params, decoder)
}

function interpolatePathResolved(
  path: InterpolatePathOptions['path'],
  params: InterpolatePathOptions['params'],
  decoder: InterpolatePathOptions['decoder'],
): InterPolatePathResult {
  if (!path || path === '/') {
    return { interpolatedPath: '/', usedParams: Object.create(null), isMissingParams: false }
  }
  if (path.indexOf('$') === -1) {
    return { interpolatedPath: path, usedParams: Object.create(null), isMissingParams: false }
  }
  if (path.indexOf('{') === -1) {
    const simple = interpolateSimpleParams(path, params, decoder)
    if (simple) return simple
  }
  return interpolateBracedParams(path, params, decoder)
}

function interpolateBracedParams(
  path: string,
  params: InterpolatePathOptions['params'],
  decoder: InterpolatePathOptions['decoder'],
): InterPolatePathResult {
  let isMissingParams = false
  const usedParams: Record<string, unknown> = Object.create(null)
  const length = path.length
  let cursor = 0
  let segment: ReturnType<typeof parseSegment> | undefined
  let joined = ''

  while (cursor < length) {
    const start = cursor
    segment = parseSegment(path, start, segment)
    const end = segment[5]
    cursor = end + 1
    if (start === end) continue

    const kind = segment[0]

    if (kind === SEGMENT_TYPE_PATHNAME) {
      joined += '/' + path.substring(start, end)
      continue
    }

    if (kind === SEGMENT_TYPE_WILDCARD) {
      const splat = params._splat ?? params['*']
      usedParams._splat = splat
      usedParams['*'] = splat
      const prefix = path.substring(start, segment[1])
      const suffix = path.substring(segment[4], end)
      if (!splat) {
        isMissingParams = true
        if (prefix || suffix) joined += '/' + prefix + suffix
        continue
      }
      joined += '/' + prefix + encodeParam('_splat', params, decoder) + suffix
      continue
    }

    if (kind === SEGMENT_TYPE_PARAM) {
      const key = path.substring(segment[2], segment[3])
      if (!isMissingParams && !(key in params)) isMissingParams = true
      usedParams[key] = params[key]
      const prefix = path.substring(start, segment[1])
      const suffix = path.substring(segment[4], end)
      const value = encodeParam(key, params, decoder) ?? 'undefined'
      joined += '/' + prefix + value + suffix
      continue
    }

    if (kind === SEGMENT_TYPE_OPTIONAL_PARAM) {
      const key = path.substring(segment[2], segment[3])
      const valueRaw = params[key]
      if (valueRaw == null) continue
      usedParams[key] = valueRaw
      const prefix = path.substring(start, segment[1])
      const suffix = path.substring(segment[4], end)
      const value = encodeParam(key, params, decoder) ?? ''
      joined += '/' + prefix + value + suffix
    }
  }

  if (path.charCodeAt(path.length - 1) === 47) joined += '/'
  return { usedParams, interpolatedPath: joined || '/', isMissingParams }
}
