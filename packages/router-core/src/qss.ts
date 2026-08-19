let lastEncodeObj: Record<string, any> | undefined
let lastEncodeStringify: ((value: any) => string) | undefined
let lastEncodeKeys: string[] = []
let lastEncodeVals: any[] = []
let lastEncodeResult = ''

export function encode(
  obj: Record<string, any>,
  stringify: (value: any) => string = String,
): string {
  if (obj === lastEncodeObj && stringify === lastEncodeStringify) {
    const keys = lastEncodeKeys
    const vals = lastEncodeVals
    let index = 0
    let same = true
    for (const key in obj) {
      if (keys[index] !== key || vals[index] !== obj[key]) {
        same = false
        break
      }
      index++
    }
    if (same && index === keys.length) return lastEncodeResult
  }

  const params = new URLSearchParams()
  const keys: string[] = []
  const vals: any[] = []
  for (const key in obj) {
    const val = obj[key]
    keys.push(key)
    vals.push(val)
    if (val !== undefined) params.set(key, stringify(val))
  }
  lastEncodeObj = obj
  lastEncodeStringify = stringify
  lastEncodeKeys = keys
  lastEncodeVals = vals
  lastEncodeResult = params.toString()
  return lastEncodeResult
}

function toValue(str: string) {
  if (!str) return ''
  if (str === 'true') return true
  if (str === 'false') return false
  const n = +str
  return n * 0 === 0 && n + '' === str ? n : str
}

let lastDecodeStr = ''
let lastDecodeSnap: Record<string, unknown> | undefined

export function decode(str: any): Record<string, unknown> {
  const result: Record<string, unknown> = Object.create(null)
  if (!str || typeof str !== 'string') return result
  if (str === lastDecodeStr && lastDecodeSnap) {
    return Object.assign(Object.create(null), lastDecodeSnap)
  }
  for (const [key, raw] of new URLSearchParams(str)) {
    const value = toValue(raw)
    const previous = result[key]
    if (previous == null) result[key] = value
    else if (Array.isArray(previous)) previous.push(value)
    else result[key] = [previous, value]
  }
  lastDecodeStr = str
  lastDecodeSnap = Object.assign(Object.create(null), result)
  return result
}
