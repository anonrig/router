import {
  SEGMENT_TYPE_OPTIONAL_PARAM,
  SEGMENT_TYPE_PARAM,
  SEGMENT_TYPE_PATHNAME,
  SEGMENT_TYPE_WILDCARD,
  parseSegment,
} from './parse-segment'
import { encodeURIComponentWellFormed } from './utils'

export function joinPaths(paths: Array<string | undefined>) {
  return cleanPath(paths.filter(Boolean).join('/'))
}

export function cleanPath(path: string) {
  return path.indexOf('//') === -1 ? path : path.replace(/\/{2,}/g, '/')
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
}

export function resolvePath({ base, to, trailingSlash = 'never' }: ResolvePathOptions) {
  const isBase = to === '.'
  const isAbsolute = to.charCodeAt(0) === 47

  if (isAbsolute && !hasDotSegment(to)) {
    const result = cleanPath(to) || '/'
    const hasSlash = result.length > 1 && result.charCodeAt(result.length - 1) === 47
    if (trailingSlash === 'never' && hasSlash) return result.slice(0, -1)
    if (trailingSlash === 'always' && !hasSlash && result !== '/') return result + '/'
    if (trailingSlash === 'preserve') {
      const toEndedWithSlash = to.length > 1 && to.charCodeAt(to.length - 1) === 47
      if (toEndedWithSlash && !hasSlash && result !== '/') return result + '/'
      if (!toEndedWithSlash && hasSlash) return result.slice(0, -1)
    }
    return result
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

  return cleanPath(baseSegments.join('/')) || '/'
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

const UNRESERVED = /^[A-Za-z0-9\-._~]*$/
const SPLAT_SAFE = /^[A-Za-z0-9\-._~!/]*$/

function encodePathParam(value: string, decoder?: InterpolatePathOptions['decoder']) {
  if (!decoder && UNRESERVED.test(value)) return value
  const encoded = encodeURIComponentWellFormed(value)
  const decoded = decoder?.(encoded) ?? encoded
  return decoded.includes('%2') ? decoded.replace(/%21/gi, '!') : decoded
}

function encodeParam(
  key: string,
  params: InterpolatePathOptions['params'],
  decoder: InterpolatePathOptions['decoder'],
): any {
  const value = key === '_splat' ? (params._splat ?? params['*']) : params[key]
  if (typeof value !== 'string') return value
  if (key === '_splat') {
    if (SPLAT_SAFE.test(value)) return value
    return value
      .split('/')
      .map((part) => encodePathParam(part, decoder))
      .join('/')
  }
  return encodePathParam(value, decoder)
}

export function interpolatePath({
  path,
  params,
  decoder,
}: InterpolatePathOptions): InterPolatePathResult {
  if (!path || path === '/') {
    return { interpolatedPath: '/', usedParams: Object.create(null), isMissingParams: false }
  }
  if (path.indexOf('$') === -1) {
    return { interpolatedPath: path, usedParams: Object.create(null), isMissingParams: false }
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
    const parsed = segment
    const end = parsed[5]
    cursor = end + 1
    if (start === end) continue

    const kind = parsed[0]
    const affix = (value: string) =>
      '/' + path.substring(start, parsed[1]) + value + path.substring(parsed[4], end)

    if (kind === SEGMENT_TYPE_PATHNAME) {
      joined += '/' + path.substring(start, end)
      continue
    }

    if (kind === SEGMENT_TYPE_WILDCARD) {
      const splat = params._splat ?? params['*']
      usedParams._splat = splat
      usedParams['*'] = splat
      if (!splat) {
        isMissingParams = true
        if (parsed[1] !== start || parsed[4] !== end) joined += affix('')
        continue
      }
      joined += affix(encodeParam('_splat', params, decoder))
      continue
    }

    if (kind === SEGMENT_TYPE_PARAM) {
      const key = path.substring(parsed[2], parsed[3])
      if (!isMissingParams && !(key in params)) isMissingParams = true
      usedParams[key] = params[key]
      joined += affix(encodeParam(key, params, decoder) ?? 'undefined')
      continue
    }

    if (kind === SEGMENT_TYPE_OPTIONAL_PARAM) {
      const key = path.substring(parsed[2], parsed[3])
      const valueRaw = params[key]
      if (valueRaw == null) continue
      usedParams[key] = valueRaw
      joined += affix(encodeParam(key, params, decoder) ?? '')
    }
  }

  if (path.charCodeAt(path.length - 1) === 47) joined += '/'
  return { usedParams, interpolatedPath: joined || '/', isMissingParams }
}
