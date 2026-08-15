import {
  SEGMENT_TYPE_OPTIONAL_PARAM,
  SEGMENT_TYPE_PARAM,
  SEGMENT_TYPE_PATHNAME,
  SEGMENT_TYPE_WILDCARD,
  parseSegment,
} from './match'

export function joinPaths(paths: Array<string | undefined>) {
  let out = ''
  for (let i = 0; i < paths.length; i++) {
    const val = paths[i]
    if (val === undefined) continue
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
  let slash = false
  for (let i = 0; i < path.length; i++) {
    const c = path.charCodeAt(i)
    if (c === 47) {
      if (slash) return collapseSlashes(path)
      slash = true
    } else {
      slash = false
    }
  }
  return path
}

function collapseSlashes(path: string) {
  let out = ''
  let slash = false
  for (let i = 0; i < path.length; i++) {
    const c = path.charCodeAt(i)
    if (c === 47) {
      if (!slash) {
        out += '/'
        slash = true
      }
    } else {
      out += path[i]
      slash = false
    }
  }
  return out
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
  if (value.length === basepath.length + 1) {
    let i = 0
    for (; i < basepath.length; i++) {
      if (value.charCodeAt(i) !== basepath.charCodeAt(i)) break
    }
    if (i === basepath.length) return value
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
    const cached = cache.get(key)
    if (cached) return cached
  }

  if (isAbsolute && trailingSlash === 'never' && !hasDotSegment(to)) {
    const result = cleanPath(to) || '/'
    const trimmed =
      result.length > 1 && result.charCodeAt(result.length - 1) === 47
        ? result.slice(0, -1)
        : result
    if (key && cache) cache.set(key, trimmed)
    return trimmed
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
  if (key && cache) cache.set(key, result)
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
  const charMap = new Map(
    pathParamsAllowedCharacters.map((char) => [encodeURIComponent(char), char]),
  )
  const pattern = Array.from(charMap.keys())
    .map((key) => key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')
  const regex = new RegExp(pattern, 'g')
  return (encoded: string) => encoded.replace(regex, (match) => charMap.get(match) ?? match)
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

function encodePathParam(value: string, decoder?: InterpolatePathOptions['decoder']) {
  const encoded = encodeURIComponent(value)
  return decoder?.(encoded) ?? encoded
}

function encodeParam(
  key: string,
  params: InterpolatePathOptions['params'],
  decoder: InterpolatePathOptions['decoder'],
): any {
  const value = params[key]
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
  let isMissingParams = false
  const usedParams: Record<string, unknown> = Object.create(null)

  if (!path || path === '/') {
    return { interpolatedPath: '/', usedParams, isMissingParams }
  }
  if (path.indexOf('$') === -1) {
    return { interpolatedPath: path, usedParams, isMissingParams }
  }

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
      const splat = params._splat
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
