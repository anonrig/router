import { encodeURIComponentWellFormed } from './utils'

/**
 * Fast query-string encode/decode.
 *
 * Avoids URLSearchParams (constructor + iterator + toString are slow on
 * the navigation hot path). Parses with a single scan and writes with
 * a pre-sized string join.
 */

function encodeString(str: string): string {
  const len = str.length
  let space = false
  for (let i = 0; i < len; i++) {
    const c = str.charCodeAt(i)
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
    if (c === 32) {
      space = true
      continue
    }
    const encoded = encodeURIComponentWellFormed(str)
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
  if (!space) return str
  return str.replace(/ /g, '+')
}

function encodeComponent(str: string): string {
  if (typeof str !== 'string') str = String(str)
  return encodeString(str)
}

function decodeComponent(str: string): string {
  const plus = str.indexOf('+')
  const pct = str.indexOf('%')
  if (plus === -1 && pct === -1) return str
  if (pct === -1) return str.replace(/\+/g, ' ')
  try {
    return decodeURIComponent(plus === -1 ? str : str.replace(/\+/g, ' '))
  } catch {
    return plus === -1 ? str : str.replace(/\+/g, ' ')
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

let lastEncodeObj: Record<string, any> | undefined
let lastEncodeFn: ((value: any) => string) | undefined
let lastEncodeOut = ''

export function encode(
  obj: Record<string, any>,
  stringify: (value: any) => string = String,
): string {
  if (obj === lastEncodeObj && stringify === lastEncodeFn) return lastEncodeOut
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
      out += encodeComponent(stringify(val))
    }
  }
  lastEncodeObj = obj
  lastEncodeFn = stringify
  lastEncodeOut = out
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
