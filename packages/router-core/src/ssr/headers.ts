import { splitSetCookieString } from 'cookie-es'
import type { OutgoingHttpHeaders } from 'node:http2'

export type AnyHeaders = HeadersInit | OutgoingHttpHeaders | undefined

export function mergeHeaders(...headers: Array<AnyHeaders>) {
  const merged = new Headers()
  for (const header of headers) {
    if (!header) continue
    const entries = header instanceof Headers ? header : new Headers(header as HeadersInit)
    for (const [key, value] of entries) {
      if (key === 'set-cookie') {
        for (const cookie of splitSetCookieString(value)) merged.append(key, cookie)
      } else {
        merged.set(key, value)
      }
    }
  }
  return merged
}
