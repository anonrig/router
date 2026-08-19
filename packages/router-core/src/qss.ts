/**
 * Fast query-string encode/decode.
 *
 * Avoids URLSearchParams (constructor + iterator + toString are slow on
 * the navigation hot path). Parses with a single scan and writes with
 * encodeURIComponent.
 */

function encodeString(str: string): string {
  const encoded = encodeURIComponent(str.toWellFormed())
  return encoded.indexOf('%20') === -1 ? encoded : encoded.replaceAll('%20', '+')
}

function decodeComponent(str: string): string {
  const plus = str.indexOf('+')
  const pct = str.indexOf('%')
  if (plus === -1 && pct === -1) return str
  const input = (plus === -1 ? str : str.replaceAll('+', ' ')).toWellFormed()
  try {
    return decodeURIComponent(input)
  } catch {
    // One bad escape must not keep the rest of the value encoded.
    return new URLSearchParams(`q=${input.replaceAll('+', '%2B')}`).get('q') ?? input
  }
}

function toValue(str: string) {
  if (!str) return ''
  const c = str.charCodeAt(0)
  if (c === 116 && str === 'true') return true
  if (c === 102 && str === 'false') return false
  if (c === 45 || (c >= 48 && c <= 57)) {
    const n = +str
    return n * 0 === 0 && n + '' === str ? n : str
  }
  return str
}

export function encode(
  obj: Record<string, any>,
  stringify: (value: any) => string = String,
): string {
  let out = ''
  let first = true
  const identity = stringify === String
  for (const key in obj) {
    const val = obj[key]
    if (val === undefined) continue
    if (!first) out += '&'
    else first = false
    out += encodeString(key)
    out += '='
    if (identity) {
      if (typeof val === 'string') out += encodeString(val)
      else if (typeof val === 'number' && val * 0 === 0) out += val
      else if (val === true) out += 'true'
      else if (val === false) out += 'false'
      else out += encodeString(String(val))
    } else {
      out += encodeString(stringify(val))
    }
  }
  return out
}

export function decode(str: any): Record<string, unknown> {
  const result: Record<string, unknown> = Object.create(null)
  if (!str || typeof str !== 'string') return result

  let offset = str.charCodeAt(0) === 63 ? 1 : 0
  const len = str.length
  while (offset < len) {
    let amp = str.indexOf('&', offset)
    if (amp === -1) amp = len
    if (amp === offset) {
      offset++
      continue
    }

    const eq = str.indexOf('=', offset)
    const rawKey = eq === -1 || eq > amp ? str.slice(offset, amp) : str.slice(offset, eq)
    const rawVal = eq === -1 || eq > amp ? '' : str.slice(eq + 1, amp)
    offset = amp + 1

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
