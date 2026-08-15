/**
 * Fast query-string encode/decode.
 *
 * Avoids URLSearchParams (constructor + iterator + toString are slow on
 * the navigation hot path). Parses with a single scan and writes with
 * a pre-sized string join.
 */

function encodeComponent(str: string): string {
  if (typeof str !== 'string') str = String(str)
  // encodeURIComponent plus always-encode `()` so alien values like `()`
  // re-serialize differently from the raw query string.
  const encoded = encodeURIComponent(str)
  const hasSpace = encoded.indexOf('%20') !== -1
  const hasOpen = encoded.indexOf('(') !== -1
  const hasClose = encoded.indexOf(')') !== -1
  if (!hasSpace && !hasOpen && !hasClose) return encoded
  let out = encoded
  if (hasSpace) out = out.replace(/%20/g, '+')
  if (hasOpen) out = out.replace(/\(/g, '%28')
  if (hasClose) out = out.replace(/\)/g, '%29')
  return out
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
    const encodedVal = encodeComponent(stringify(val))
    out += encodeComponent(key) + '=' + encodedVal
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

    let eq = -1
    for (let j = last; j < i; j++) {
      if (str.charCodeAt(j) === 61) {
        eq = j
        break
      }
    }
    const rawKey = eq === -1 ? str.slice(last, i) : str.slice(last, eq)
    const rawVal = eq === -1 ? '' : str.slice(eq + 1, i)
    last = i + 1
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
