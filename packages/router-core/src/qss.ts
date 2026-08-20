let lastEncodeStringify: ((value: any) => string) | undefined
let lastEncodeSig: string | undefined
let lastEncodeResult: string | undefined

export function encode(
  obj: Record<string, any>,
  stringify: (value: any) => string = String,
): string {
  let sig: string | undefined
  try {
    sig = JSON.stringify(obj)
  } catch {
    // Circular or non-JSON values skip last-value.
  }
  if (sig !== undefined && stringify === lastEncodeStringify && sig === lastEncodeSig) {
    return lastEncodeResult!
  }
  const params = new URLSearchParams()
  for (const key in obj) {
    const val = obj[key]
    if (val !== undefined) params.set(key, stringify(val))
  }
  const result = params.toString()
  if (sig !== undefined) {
    lastEncodeStringify = stringify
    lastEncodeSig = sig
    lastEncodeResult = result
  }
  return result
}

function toValue(str: string) {
  if (str === 'true') return true
  if (str === 'false') return false
  const n = +str
  return n * 0 === 0 && n + '' === str ? n : str
}

export function decode(str: any): Record<string, unknown> {
  const result: Record<string, unknown> = Object.create(null)
  if (!str || typeof str !== 'string') return result
  for (const [key, raw] of new URLSearchParams(str)) {
    const value = toValue(raw)
    const previous = result[key]
    if (previous == null) result[key] = value
    else if (Array.isArray(previous)) previous.push(value)
    else result[key] = [previous, value]
  }
  return result
}
