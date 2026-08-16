import { evictOldest } from '../utils'

const dehydrateCache: Record<string, string> = Object.create(null)
const DEHYDRATE_CACHE_MAX = 256
let dehydrateCacheSize = 0

export function dehydrateSsrMatchId(id: string): string {
  const cached = dehydrateCache[id]
  if (cached !== undefined) return cached
  const len = id.length
  let slash = false
  let result = id
  for (let i = 0; i < len; i++) {
    const c = id.charCodeAt(i)
    if (c === 47) {
      slash = true
      continue
    }
    if (c === 126 || c === 0 || c === 0xfffd) {
      result = dehydrateSsrMatchIdEscaped(id)
      slash = false
      break
    }
  }
  if (slash) result = id.replaceAll('/', '\0')
  if (!(id in dehydrateCache)) {
    if (dehydrateCacheSize >= DEHYDRATE_CACHE_MAX) evictOldest(dehydrateCache)
    else dehydrateCacheSize++
  }
  dehydrateCache[id] = result
  return result
}

function dehydrateSsrMatchIdEscaped(id: string): string {
  let out = ''
  let last = 0
  for (let i = 0; i < id.length; i++) {
    const c = id.charCodeAt(i)
    if (c === 126) {
      out += id.slice(last, i) + '~~'
      last = i + 1
    } else if (c === 0) {
      out += id.slice(last, i) + '~0'
      last = i + 1
    } else if (c === 0xfffd) {
      out += id.slice(last, i) + '~r'
      last = i + 1
    } else if (c === 47) {
      out += id.slice(last, i) + '\0'
      last = i + 1
    }
  }
  return last === 0 ? id : out + id.slice(last)
}

export function hydrateSsrMatchId(id: string): string {
  if (id.indexOf('\0') === -1 && id.indexOf('\uFFFD') === -1 && id.indexOf('~') === -1) {
    return id
  }
  let out = ''
  let last = 0
  const len = id.length
  for (let i = 0; i < len; i++) {
    const c = id.charCodeAt(i)
    if (c === 0 || c === 0xfffd) {
      out += id.slice(last, i) + '/'
      last = i + 1
      continue
    }
    if (c !== 126 || i + 1 >= len) continue
    const next = id.charCodeAt(i + 1)
    if (next === 126) {
      out += id.slice(last, i) + '~'
      last = i + 2
      i++
    } else if (next === 48) {
      out += id.slice(last, i) + '\0'
      last = i + 2
      i++
    } else if (next === 114) {
      out += id.slice(last, i) + '\uFFFD'
      last = i + 2
      i++
    }
  }
  return last === 0 ? id : out + id.slice(last)
}
