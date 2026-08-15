/**
 * Fast query-string encode/decode.
 *
 * Avoids URLSearchParams (constructor + iterator + toString are slow on
 * the navigation hot path). Parses with a single scan and writes with
 * a pre-sized string join.
 */

function encodeComponent(str: string): string {
  if (typeof str !== 'string') str = String(str)
  // Match URLSearchParams: encodeURIComponent + space as `+`
  return encodeURIComponent(str).replace(/%20/g, '+')
}

function decodeComponent(str: string): string {
  if (str.indexOf('+') === -1 && str.indexOf('%') === -1) return str
  try {
    return decodeURIComponent(str.replace(/\+/g, ' '))
  } catch {
    return str.replace(/\+/g, ' ')
  }
}

function toValue(str: string) {
  if (!str) return ''
  if (str === 'false') return false
  if (str === 'true') return true
  const n = +str
  return n * 0 === 0 && n + '' === str ? n : str
}

export function encode(
  obj: Record<string, any>,
  stringify: (value: any) => string = String,
): string {
  let out = ''
  let first = true
  for (const key in obj) {
    const val = obj[key]
    if (val === undefined) continue
    if (!first) out += '&'
    else first = false
    out += encodeComponent(key) + '=' + encodeComponent(stringify(val))
  }
  return out
}

export function decode(str: any): Record<string, unknown> {
  const result: Record<string, unknown> = Object.create(null)
  if (!str || typeof str !== 'string') return result

  const len = str.length
  let start = 0
  if (str.charCodeAt(0) === 63) start = 1

  let last = start
  for (let i = start; i <= len; i++) {
    const c = i === len ? 38 : str.charCodeAt(i)
    if (c !== 38) continue
    if (i === last) {
      last = i + 1
      continue
    }

    const pair = str.slice(last, i)
    last = i + 1

    const eq = pair.indexOf('=')
    const rawKey = eq === -1 ? pair : pair.slice(0, eq)
    const rawVal = eq === -1 ? '' : pair.slice(eq + 1)
    const key = decodeComponent(rawKey)
    const value = toValue(decodeComponent(rawVal))

    const previous = result[key]
    if (previous == null) {
      result[key] = value
    } else if (Array.isArray(previous)) {
      previous.push(value)
    } else {
      result[key] = [previous, value]
    }
  }

  return result
}
