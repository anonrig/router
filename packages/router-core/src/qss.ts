import { encodeURIComponentWellFormed } from './utils'

/**
 * Fast query-string encode/decode.
 *
 * Avoids URLSearchParams (constructor + iterator + toString are slow on
 * the navigation hot path). Parses with a single scan and writes with
 * a pre-sized string join.
 */

function replaceCode(str: string, from: number, to: string): string {
  const len = str.length
  let out = ''
  let last = 0
  for (let i = 0; i < len; i++) {
    if (str.charCodeAt(i) !== from) continue
    out += str.slice(last, i) + to
    last = i + 1
  }
  return last === 0 ? str : out + str.slice(last)
}

function replaceNeedle(str: string, needle: string, to: string): string {
  let idx = str.indexOf(needle)
  if (idx === -1) return str
  let out = ''
  let last = 0
  const nlen = needle.length
  while (idx !== -1) {
    out += str.slice(last, idx) + to
    last = idx + nlen
    idx = str.indexOf(needle, last)
  }
  return out + str.slice(last)
}

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
    if (hasSpace) out = replaceNeedle(out, '%20', '+')
    if (hasOpen) out = replaceCode(out, 40, '%28')
    if (hasClose) out = replaceCode(out, 41, '%29')
    return out
  }
  if (!space) return str
  return replaceCode(str, 32, '+')
}

function encodeComponent(str: string): string {
  if (typeof str !== 'string') str = String(str)
  return encodeString(str)
}

function decodeComponent(str: string): string {
  const plus = str.indexOf('+')
  const pct = str.indexOf('%')
  if (plus === -1 && pct === -1) return str
  if (pct === -1) return replaceCode(str, 43, ' ')
  const input = (plus === -1 ? str : replaceCode(str, 43, ' ')).toWellFormed()
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

let lastEncodeObj: Record<string, any> | undefined
let lastEncodeFn: ((value: any) => string) | undefined
let lastEncodeKeys: string[] = []
let lastEncodeVals: any[] = []
let lastEncodeDeep = false
let lastEncodeSig: string | undefined
let lastEncodeOut = ''

function searchSig(obj: Record<string, any>): string | undefined {
  try {
    return JSON.stringify(obj)
  } catch {
    // Circular or non-JSON values skip last-value.
  }
}

function rememberEncode(obj: Record<string, any>) {
  const keys: string[] = []
  const vals: any[] = []
  let deep = false
  for (const key in obj) {
    const val = obj[key]
    if (val === undefined) continue
    keys.push(key)
    vals.push(val)
    if (val !== null && typeof val === 'object') deep = true
  }
  lastEncodeKeys = keys
  lastEncodeVals = vals
  lastEncodeDeep = deep
  lastEncodeSig = deep ? searchSig(obj) : undefined
}

function encodeUnchanged(obj: Record<string, any>): boolean {
  if (!lastEncodeDeep) {
    let i = 0
    const keys = lastEncodeKeys
    const vals = lastEncodeVals
    for (const key in obj) {
      const val = obj[key]
      if (val === undefined) continue
      if (keys[i] !== key || !Object.is(val, vals[i])) return false
      i++
    }
    return i === keys.length
  }
  const sig = searchSig(obj)
  return sig !== undefined && sig === lastEncodeSig
}

export function encode(
  obj: Record<string, any>,
  stringify: (value: any) => string = String,
): string {
  if (obj === lastEncodeObj && stringify === lastEncodeFn && encodeUnchanged(obj)) {
    return lastEncodeOut
  }
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
  rememberEncode(obj)
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
