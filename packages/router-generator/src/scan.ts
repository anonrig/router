import { readdirSync } from 'node:fs'
import { basename, join, relative, sep } from 'node:path'

const ROUTE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx'])
const SPLIT_FILE = /[.-](lazy|component|errorComponent|pendingComponent|notFoundComponent|loader)$/

export type ScannedRoute = {
  /** Absolute file path of the route module. */
  filePath: string
  /** POSIX path from the routes directory, no extension (`posts/$postId`). */
  fileId: string
  /** FileRoutesByPath key (`/posts/$postId`). */
  key: string
  /** `route.update({ id })` value. */
  id: string
  /** `route.update({ path })` value. Omitted for pathless layouts. */
  path?: string
  /** Parent key (`__root__` for root children). */
  parentId: string
  isRoot: boolean
  isPathless: boolean
  /** Parallel-route slot name when the file uses `@slotName`. */
  slot?: string
  /** True when this file is the root of a named slot tree. */
  isSlotRoot?: boolean
}

export type ScanRoutesOptions = {
  routesDirectory: string
}

function toPosix(value: string) {
  return value.split(sep).join('/')
}

export function isRouteFile(name: string) {
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return false
  if (!ROUTE_EXTS.has(name.slice(dot))) return false
  const stem = name.slice(0, dot)
  if (stem.charCodeAt(0) === 46 /* . */ || stem.charCodeAt(0) === 45 /* - */) return false
  if (SPLIT_FILE.test(stem)) return false
  return true
}

function listRouteFiles(rootDir: string) {
  const files: Array<string> = []
  const stack = [rootDir]
  while (stack.length) {
    const dir = stack.pop()!
    let entries
    try {
      // Dirents come from getdents; no per-file stat unless d_type is unknown.
      entries = readdirSync(dir, { withFileTypes: true })
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (dir === rootDir && (code === 'ENOENT' || code === 'ENOTDIR')) {
        throw new Error(`routesDirectory does not exist: ${rootDir}`, { cause: error })
      }
      throw error
    }
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]!
      const name = entry.name
      if (name === 'node_modules' || name.charCodeAt(0) === 46 /* . */) continue
      if (entry.isDirectory()) {
        stack.push(join(dir, name))
        continue
      }
      if ((entry.isFile() || entry.isSymbolicLink()) && isRouteFile(name)) {
        files.push(join(dir, name))
      }
    }
  }
  return files
}

function stripRouteToken(segments: Array<string>) {
  return segments.filter((segment) => segment !== 'route')
}

function normalizeSlotFileId(fileId: string) {
  if (!fileId.includes('@')) return fileId
  return fileId
    .replace(/\.@/g, '/@')
    .replace(/(@[^./]+)\./g, '$1/')
    .replace(/\./g, '/')
}

function fileIdToKey(fileId: string) {
  if (fileId === '__root') return '__root__'
  const raw = normalizeSlotFileId(fileId).split('/').filter(Boolean)
  const segments = stripRouteToken(raw)
  if (segments.length === 0) return '/'
  const last = segments[segments.length - 1]!
  if (last === 'index') {
    segments[segments.length - 1] = ''
  }
  const joined = segments.join('/')
  if (joined === '') return '/'
  return joined.endsWith('/') ? `/${joined}` : `/${joined}`
}

function lastSegment(key: string) {
  if (key === '/' || key === '__root__') return key
  const trimmed = key.endsWith('/') && key !== '/' ? key.slice(0, -1) : key
  const slash = trimmed.lastIndexOf('/')
  return slash === -1 ? trimmed : trimmed.slice(slash + 1)
}

function isPathlessKey(key: string) {
  if (key.endsWith('/') && key !== '/') return false
  const segment = lastSegment(key)
  return (segment.startsWith('_') && segment !== '__root__') || segment.startsWith('@')
}

function slotNameOf(key: string) {
  const segment = lastSegment(key)
  return segment.startsWith('@') ? segment.slice(1) : undefined
}

function urlPathFromId(id: string, pathless: boolean): string | undefined {
  if (pathless) return undefined
  const trailingSlash = id.endsWith('/') && id !== '/'
  const parts: Array<string> = []
  for (const segment of id.split('/')) {
    if (!segment) continue
    if (segment.startsWith('_') || segment.startsWith('@')) continue
    parts.push(segment.endsWith('_') ? segment.slice(0, -1) : segment)
  }
  if (parts.length === 0) return '/'
  return `/${parts.join('/')}${trailingSlash ? '/' : ''}`
}

function parentKeyOf(key: string, keys: Set<string>) {
  if (key === '/' || key === '__root__') return '__root__'
  let current = key.endsWith('/') && key !== '/' ? key.slice(0, -1) : key
  if (key.endsWith('/') && key !== '/' && keys.has(current)) return current
  while (current.length > 1) {
    const slash = current.lastIndexOf('/')
    current = slash <= 0 ? '/' : current.slice(0, slash)
    if (current === '/') break
    if (keys.has(current)) return current
  }
  return '__root__'
}

function relativeId(key: string, parentId: string) {
  if (parentId === '__root__') return key
  if (key === parentId) return key
  const parent = parentId.endsWith('/') && parentId !== '/' ? parentId.slice(0, -1) : parentId
  if (key.startsWith(`${parent}/`) || key === `${parent}/`) {
    const rel = key.slice(parent.length)
    return rel.startsWith('/') ? rel : `/${rel}`
  }
  return key
}

export function scanRoutes(options: ScanRoutesOptions): Array<ScannedRoute> {
  const rootDir = options.routesDirectory
  const files = listRouteFiles(rootDir)

  const pending: Array<Omit<ScannedRoute, 'id' | 'path' | 'parentId' | 'isPathless'>> = []
  for (const filePath of files) {
    const fileId = toPosix(relative(rootDir, filePath)).replace(/\.[^.]+$/, '')
    const isRoot = basename(fileId) === '__root' || fileId === '__root'
    pending.push({
      filePath,
      fileId,
      key: fileIdToKey(fileId),
      isRoot,
    })
  }

  const keys = new Set(pending.filter((route) => !route.isRoot).map((route) => route.key))
  const routes: Array<ScannedRoute> = []

  for (const route of pending) {
    if (route.isRoot) {
      routes.push({
        ...route,
        key: '__root__',
        id: '__root__',
        parentId: '__root__',
        isPathless: false,
      })
      continue
    }
    const parentId = parentKeyOf(route.key, keys)
    const pathless = isPathlessKey(route.key)
    const id = relativeId(route.key, parentId)
    const slot = slotNameOf(route.key)
    routes.push({
      ...route,
      id,
      path: urlPathFromId(id, pathless),
      parentId,
      isPathless: pathless,
      slot,
      isSlotRoot: !!slot && !route.key.endsWith('/') && lastSegment(route.key).startsWith('@'),
    })
  }

  routes.sort((left, right) => {
    if (left.isRoot !== right.isRoot) return left.isRoot ? -1 : 1
    const depth = (key: string) => key.split('/').filter(Boolean).length
    const delta = depth(left.key) - depth(right.key)
    if (delta !== 0) return delta
    return left.key.localeCompare(right.key)
  })

  return routes
}
