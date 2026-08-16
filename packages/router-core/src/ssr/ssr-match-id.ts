const dehydrateCache = new Map<string, string>()
const DEHYDRATE_CACHE_MAX = 256

export function dehydrateSsrMatchId(id: string): string {
  const cached = dehydrateCache.get(id)
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
  if (dehydrateCache.size >= DEHYDRATE_CACHE_MAX && !dehydrateCache.has(id)) {
    const first = dehydrateCache.keys().next().value
    if (first !== undefined) dehydrateCache.delete(first)
  }
  dehydrateCache.set(id, result)
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
  return id
    .replaceAll('\0', '/')
    .replaceAll('\uFFFD', '/')
    .replace(/~([~0r])/g, (_, code) => (code === '0' ? '\0' : code === 'r' ? '\uFFFD' : code))
}
