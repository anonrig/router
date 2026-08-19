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
  /** Public URL path of the whole branch (`FileRoutesByFullPath` key). */
  fullPath: string
  /** Parent key (`__root__` for root children). */
  parentId: string
  isRoot: boolean
  isPathless: boolean
  /** Parallel-route slot name when the file uses `@slotName`. */
  slot?: string
  /** True when this file is the root of a named slot tree. */
  isSlotRoot?: boolean
}

export type RouteFileIgnorePattern = string | RegExp

export type ScanRoutesOptions = {
  routesDirectory: string
  /** Same meaning as TanStack's `routeFileIgnorePattern`: matched against the POSIX path relative to `routesDirectory`. */
  routeFileIgnorePattern?: RouteFileIgnorePattern
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

export function compileRouteFileIgnorePattern(pattern?: RouteFileIgnorePattern) {
  if (!pattern) return undefined
  return typeof pattern === 'string' ? new RegExp(pattern) : pattern
}

export function matchesRouteFileIgnorePattern(
  relativePath: string,
  pattern?: RouteFileIgnorePattern,
) {
  const ignore = compileRouteFileIgnorePattern(pattern)
  return ignore ? testPattern(ignore, relativePath) : false
}

function testPattern(pattern: RegExp, value: string) {
  pattern.lastIndex = 0
  const matches = pattern.test(value)
  pattern.lastIndex = 0
  return matches
}

function listRouteFiles(rootDir: string, ignore?: RegExp) {
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
      const fullPath = join(dir, name)
      const relativePath = toPosix(relative(rootDir, fullPath))
      if (ignore && (testPattern(ignore, name) || testPattern(ignore, relativePath))) continue
      if (entry.isDirectory()) {
        stack.push(fullPath)
        continue
      }
      if ((entry.isFile() || entry.isSymbolicLink()) && isRouteFile(name)) {
        files.push(fullPath)
      }
    }
  }
  return files
}

function stripRouteToken(segments: Array<string>) {
  return segments[segments.length - 1] === 'route' ? segments.slice(0, -1) : segments
}

const ESCAPED_DOT = '\0'
const ESCAPED_OPEN = '\u0001'
const ESCAPED_CLOSE = '\u0002'

/** Drops the markers that record which characters came from `[...]`. */
function stripEscapeMarkers(value: string) {
  return value.replaceAll(ESCAPED_OPEN, '').replaceAll(ESCAPED_CLOSE, '')
}

function startsEscaped(segment: string) {
  return segment.charCodeAt(0) === 1
}

function endsEscaped(segment: string) {
  return segment.charCodeAt(segment.length - 1) === 2
}

/** TanStack flat routes: `.` nests; bracketed text escapes route-file tokens. */
function flattenRouteFileId(fileId: string) {
  return fileId
    .replace(
      /\[([^\]]+)\]/g,
      (_match, escaped: string) =>
        `${ESCAPED_OPEN}${escaped.replace(/\./g, ESCAPED_DOT)}${ESCAPED_CLOSE}`,
    )
    .replace(/\./g, '/')
    .replaceAll(ESCAPED_DOT, '.')
}

/**
 * Route key that still carries the escape markers. Every path-shaping helper
 * reads this form so a bracket-escaped `_`, `@`, or `(` stays a literal URL
 * character instead of turning the segment pathless.
 */
function fileIdToEscapedKey(fileId: string) {
  if (fileId === '__root') return '__root__'
  const raw = flattenRouteFileId(fileId).split('/').filter(Boolean)
  const segments = stripRouteToken(raw)
  if (segments.length === 0) return '/'
  // Compared before stripping markers so `[index]` and `[route]` stay literal.
  if (segments[segments.length - 1] === 'index') {
    segments[segments.length - 1] = ''
  }
  const joined = segments.join('/')
  if (joined === '') return '/'
  return `/${joined}`
}

function lastSegment(key: string) {
  if (key === '/' || key === '__root__') return key
  const trimmed = key.endsWith('/') && key !== '/' ? key.slice(0, -1) : key
  const slash = trimmed.lastIndexOf('/')
  return slash === -1 ? trimmed : trimmed.slice(slash + 1)
}

/** Same as TanStack `countSlashSeparatedParts`: `/explore` is 2, `/explore/` is 3. */
function countSlashSeparatedParts(path: string) {
  let count = 1
  for (let i = 0; i < path.length; i++) {
    if (path[i] === '/') count++
  }
  return count
}

/**
 * Pathless `_` / `@` layouts and parenthesized `(group)` segments. A leading
 * token written as `[_]`, `[@]`, or `[(]` is escaped, so it stays part of the
 * URL instead of making the segment pathless.
 */
function isPathlessSegment(segment: string) {
  if (startsEscaped(segment)) return false
  const plain = stripEscapeMarkers(segment)
  if (plain.startsWith('_')) return plain !== '__root__'
  if (plain.startsWith('@')) return true
  return plain.startsWith('(') && plain.endsWith(')') && !endsEscaped(segment)
}

function isPathlessKey(key: string) {
  if (key.endsWith('/') && key !== '/') return false
  return isPathlessSegment(lastSegment(key))
}

function slotNameOf(key: string) {
  const segment = lastSegment(key)
  if (startsEscaped(segment)) return undefined
  const plain = stripEscapeMarkers(segment)
  return plain.startsWith('@') ? plain.slice(1) : undefined
}

/** Takes an escape-marked id and returns the public URL path. */
function urlPathFromId(id: string): string | undefined {
  const trailingSlash = id.endsWith('/') && id !== '/'
  const parts: Array<string> = []
  for (const segment of id.split('/')) {
    if (!segment) continue
    if (isPathlessSegment(segment)) continue
    const plain = stripEscapeMarkers(segment)
    // A trailing `_` opts out of nesting, unless it was written as `[_]`.
    parts.push(plain.endsWith('_') && !endsEscaped(segment) ? plain.slice(0, -1) : plain)
  }
  if (parts.length === 0) {
    if (id === '/' || trailingSlash) return '/'
    return undefined
  }
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
  const files = listRouteFiles(
    rootDir,
    compileRouteFileIgnorePattern(options.routeFileIgnorePattern),
  )

  type PendingRoute = {
    filePath: string
    fileId: string
    key: string
    escapedKey: string
    isRoot: boolean
  }

  const pending: Array<PendingRoute> = []
  for (const filePath of files) {
    const fileId = toPosix(relative(rootDir, filePath)).replace(/\.[^.]+$/, '')
    if (basename(fileId) === '__root' && fileId !== '__root') {
      throw new Error(`Root route file must be directly inside the routes directory: "${fileId}"`)
    }
    const isRoot = fileId === '__root'
    const escapedKey = fileIdToEscapedKey(fileId)
    pending.push({
      filePath,
      fileId,
      key: stripEscapeMarkers(escapedKey),
      escapedKey,
      isRoot,
    })
  }
  const roots = pending.filter((route) => route.isRoot)
  if (roots.length > 1) {
    throw new Error(`Multiple root route files: ${roots.map((route) => route.filePath).join(', ')}`)
  }

  const keys = new Set<string>()
  const escapedKeys = new Map<string, string>()
  for (const route of pending) {
    if (route.isRoot) continue
    if (keys.has(route.key)) {
      const prior = pending.find((candidate) => !candidate.isRoot && candidate.key === route.key)!
      throw new Error(
        `Duplicate route key "${route.key}" from "${prior.fileId}" and "${route.fileId}"`,
      )
    }
    keys.add(route.key)
    escapedKeys.set(route.key, route.escapedKey)
  }

  const routes: Array<ScannedRoute> = []

  for (const { escapedKey, ...route } of pending) {
    if (route.isRoot) {
      routes.push({
        ...route,
        key: '__root__',
        id: '__root__',
        fullPath: '/',
        parentId: '__root__',
        isPathless: false,
      })
      continue
    }
    const parentId = parentKeyOf(route.key, keys)
    // Both sides keep their markers so the escaped tail survives the slice.
    const escapedId = relativeId(escapedKey, escapedKeys.get(parentId) ?? '__root__')
    const slot = slotNameOf(escapedKey)
    routes.push({
      ...route,
      id: relativeId(route.key, parentId),
      path: urlPathFromId(escapedId),
      fullPath: urlPathFromId(escapedKey) ?? '/',
      parentId,
      isPathless: isPathlessKey(escapedKey),
      slot,
      isSlotRoot: !!slot && !escapedKey.endsWith('/'),
    })
  }

  // Same order as TanStack `sortRouteNodes`: root, slash-part count, then path.
  // Slash count includes empty segments (`/explore/` is 3, `/explore` is 2) so
  // index routes do not interleave with shallower siblings.
  routes.sort((left, right) => {
    if (left.isRoot !== right.isRoot) return left.isRoot ? -1 : 1
    const slashDelta = countSlashSeparatedParts(left.key) - countSlashSeparatedParts(right.key)
    if (slashDelta !== 0) return slashDelta
    return left.key < right.key ? -1 : left.key > right.key ? 1 : 0
  })

  return routes
}
