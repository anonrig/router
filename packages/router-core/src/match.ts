import {
  findRouteMatch,
  hotMatch,
  hotPath,
  hotTree,
  rememberHotMatch,
  setFindRouteMatchLookup,
} from './find-route-match'
import {
  parseSegment,
  SEGMENT_TYPE_OPTIONAL_PARAM,
  SEGMENT_TYPE_PARAM,
  SEGMENT_TYPE_PATHNAME,
  SEGMENT_TYPE_WILDCARD,
} from './parse-segment'
import { evictOldest } from './utils'
import type { ParsedSegment, SegmentKind } from './parse-segment'

export {
  parseSegment,
  SEGMENT_TYPE_OPTIONAL_PARAM,
  SEGMENT_TYPE_PARAM,
  SEGMENT_TYPE_PATHNAME,
  SEGMENT_TYPE_WILDCARD,
}
export type { SegmentKind }

function createMatchCache<V>(max = 1000) {
  const store: Record<string, V> = Object.create(null)
  let size = 0
  return {
    get(key: string): V | undefined {
      return store[key]
    },
    set(key: string, value: V) {
      if (key in store) {
        delete store[key]
      } else if (size >= max) {
        evictOldest(store)
      } else {
        size++
      }
      store[key] = value
    },
    clear() {
      for (const key in store) delete store[key]
      size = 0
    },
  }
}

export type AnyRouteLike = {
  id: string
  path?: string
  fullPath: string
  options: Record<string, any>
  children?: Array<AnyRouteLike> | Record<string, AnyRouteLike>
  isRoot?: boolean
  parentRoute?: AnyRouteLike
  rank?: number
  originalIndex?: number
}

export type SegmentNode = {
  /** Null-prototype map of static segment → child (find-my-way: no Map on the hot path). */
  staticChildren: Record<string, SegmentNode> | null
  staticSensitiveChildren: Record<string, SegmentNode> | null
  paramChild: SegmentNode | null
  paramChildren: SegmentNode[] | null
  paramName: string
  optionalChild: SegmentNode | null
  optionalChildren: SegmentNode[] | null
  optionalName: string
  wildcardChild: SegmentNode | null
  pathless: AnyRouteLike[] | null
  route: AnyRouteLike | null
  indexRoute: AnyRouteLike | null
  parse?: ((params: Record<string, string>) => unknown) | null
  priority?: number
  prefix?: string
  suffix?: string
}

function createNode(): SegmentNode {
  return {
    staticChildren: null,
    staticSensitiveChildren: null,
    paramChild: null,
    paramChildren: null,
    paramName: '',
    optionalChild: null,
    optionalChildren: null,
    optionalName: '',
    wildcardChild: null,
    pathless: null,
    route: null,
    indexRoute: null,
  }
}

function getOrCreateStatic(node: SegmentNode, key: string, caseSensitive: boolean): SegmentNode {
  const children = caseSensitive
    ? (node.staticSensitiveChildren ??= Object.create(null))
    : (node.staticChildren ??= Object.create(null))
  const existing = children[key]
  if (existing) return existing
  const child = createNode()
  children[key] = child
  return child
}

function getOrCreateParam(
  node: SegmentNode,
  name: string,
  prefix: string,
  suffix: string,
  parse: SegmentNode['parse'],
  priority: number,
): SegmentNode {
  const existing = node.paramChildren
  if (existing) {
    for (let i = 0; i < existing.length; i++) {
      const child = existing[i]!
      if (child.paramName === name && child.prefix === prefix && child.suffix === suffix) {
        return child
      }
    }
  }
  const next = createNode()
  next.parse = parse
  next.priority = priority
  next.paramName = name
  next.prefix = prefix
  next.suffix = suffix
  node.paramChildren ??= []
  node.paramChildren.push(next)
  if (!node.paramChild) node.paramChild = next
  if (!node.paramName) node.paramName = name
  return next
}

function getOrCreateOptional(node: SegmentNode, name: string, prefix: string, suffix: string) {
  const existing = node.optionalChildren
  if (existing) {
    for (let i = 0; i < existing.length; i++) {
      const child = existing[i]!
      if (child.optionalName === name && child.prefix === prefix && child.suffix === suffix) {
        return child
      }
    }
  }
  const next = createNode()
  next.optionalName = name
  next.prefix = prefix
  next.suffix = suffix
  node.optionalChildren ??= []
  node.optionalChildren.push(next)
  if (!node.optionalChild) node.optionalChild = next
  if (!node.optionalName) node.optionalName = name
  optionalNamesThisTree.push(name || '')
  return next
}

function pathNeedsLowercase(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i)
    if (c >= 65 && c <= 90) return true
  }
  return false
}

function nodeHasDynamic(node: SegmentNode): boolean {
  if (
    node.paramChild ||
    node.paramChildren?.length ||
    node.optionalChild ||
    node.optionalChildren?.length ||
    node.wildcardChild
  ) {
    return true
  }
  const kids = node.staticChildren
  if (kids) {
    for (const key in kids) {
      if (nodeHasDynamic(kids[key]!)) return true
    }
  }
  const sensitiveKids = node.staticSensitiveChildren
  if (sensitiveKids) {
    for (const key in sensitiveKids) {
      if (nodeHasDynamic(sensitiveKids[key]!)) return true
    }
  }
  return false
}

function finalizeParamChildren(node: SegmentNode): void {
  if (node.paramChildren && node.paramChildren.length > 1) {
    node.paramChildren.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
  }
  const kids = node.staticChildren
  if (kids) {
    for (const key in kids) finalizeParamChildren(kids[key]!)
  }
  const sensitiveKids = node.staticSensitiveChildren
  if (sensitiveKids) {
    for (const key in sensitiveKids) finalizeParamChildren(sensitiveKids[key]!)
  }
  if (node.paramChildren) {
    for (let i = 0; i < node.paramChildren.length; i++) {
      finalizeParamChildren(node.paramChildren[i]!)
    }
  }
  if (node.paramChild && node.paramChild !== node.paramChildren?.[0]) {
    finalizeParamChildren(node.paramChild)
  }
  if (node.optionalChildren) {
    for (let i = 0; i < node.optionalChildren.length; i++) {
      finalizeParamChildren(node.optionalChildren[i]!)
    }
  } else if (node.optionalChild) {
    finalizeParamChildren(node.optionalChild)
  }
  if (node.wildcardChild) finalizeParamChildren(node.wildcardChild)
}

function matchNeedsParse(matches: RouteMatchResult[]): boolean {
  for (let i = 0; i < matches.length; i++) {
    const opts = matches[i]!.route.options
    if (opts?.params?.parse || opts?.parseParams) return true
  }
  return false
}

function isStaticPath(path: string): boolean {
  return path.indexOf('$') === -1 && path.indexOf('{') === -1
}

/**
 * Walk only static children for a registered static path.
 * Param siblings/children are allowed (find-my-way: static-first).
 * Optional/wildcard on the terminal stay on the dynamic walker.
 */
function nodeHasSkipMatch(node: SegmentNode): boolean {
  return !!(node.optionalChild || node.optionalChildren?.length || node.wildcardChild)
}

function walkStaticExact(
  tree: ProcessedTree,
  pathname: string,
  caseSensitive: boolean,
): RouteMatchResult[] | undefined {
  let node = tree.root
  // Optional/wildcard nodes can skip segments and beat a static sibling
  // (e.g. `/{ -$lang}/home` vs `/home`). Leave those on the dynamic walker.
  if (nodeHasSkipMatch(node)) return undefined
  const chain: AnyRouteLike[] = []
  if (node.route) chain.push(node.route)
  if (node.pathless) {
    for (let i = 0; i < node.pathless.length; i++) chain.push(node.pathless[i]!)
  }

  if (pathname === '/' || pathname === '') {
    const match = finishStaticMatch(tree, node, chain)
    return matchNeedsParse(match) ? undefined : match
  }

  let i = pathname.charCodeAt(0) === 47 ? 1 : 0
  while (i < pathname.length) {
    let end = i
    while (end < pathname.length && pathname.charCodeAt(end) !== 47) end++
    if (end > i) {
      let key = pathname.slice(i, end)
      if (!caseSensitive && pathNeedsLowercase(key)) key = key.toLowerCase()
      const child = node.staticChildren?.[key]
      if (!child || nodeHasSkipMatch(child)) return undefined
      if (child.route) chain.push(child.route)
      if (child.pathless) {
        for (let p = 0; p < child.pathless.length; p++) chain.push(child.pathless[p]!)
      }
      node = child
    }
    i = end + 1
  }

  const match = finishStaticMatch(tree, node, chain)
  if (matchNeedsParse(match)) return undefined
  return match
}

function buildStaticExactTable(
  tree: ProcessedTree,
  caseSensitive: boolean,
): Record<string, RouteMatchResult[]> {
  const table: Record<string, RouteMatchResult[]> = Object.create(null)
  const add = (pathname: string) => {
    if (table[pathname] !== undefined) return
    const match = walkStaticExact(tree, pathname, caseSensitive)
    if (!match) return
    table[pathname] = match
    if (!caseSensitive && pathNeedsLowercase(pathname)) {
      table[pathname.toLowerCase()] = match
    }
  }
  add('/')
  const routes = tree.flatRoutes
  for (let i = 0; i < routes.length; i++) {
    const path = routes[i]!.fullPath
    if (!path || !isStaticPath(path)) continue
    add(path)
  }
  return table
}

function lookupStaticExact(
  tree: ProcessedTree,
  pathname: string,
  caseSensitive: boolean,
): RouteMatchResult[] | undefined {
  const table = tree.staticExact
  if (!table) return undefined
  const hit = table[pathname]
  if (hit !== undefined) return hit
  if (caseSensitive || !pathNeedsLowercase(pathname)) return undefined
  return table[pathname.toLowerCase()]
}

export type ProcessedTree = {
  root: SegmentNode
  routesById: Record<string, AnyRouteLike>
  routesByPath: Record<string, AnyRouteLike>
  flatRoutes: AnyRouteLike[]
  matchCache: ReturnType<typeof createMatchCache<RouteMatchResult[] | null>>
  segmentTree?: any
  singleCache?: any
  segmentMatchCache?: any
  flatCache?: any
  masks?: Array<{ from: string; [key: string]: any }>
  masksTree?: any
  /**
   * Precomputed exact matches for fully-static paths (find-my-way: never enter
   * the parametric walker when the path is static).
   */
  staticExact?: Record<string, RouteMatchResult[]>
  /** True when a route overrides the tree's default case sensitivity. */
  hasCaseOverrides?: boolean
  /** True if any node has a param, optional, or wildcard child. */
  hasDynamic?: boolean
  /** One-entry last hit (find-my-way `_treeGET`: fixed-offset, not a map). */
  lastPath?: string
  lastMatch?: RouteMatchResult[] | null
  /** Cached getMatchedRoutes tuples keyed by trimmed pathname. */
  matchedRoutesCache?: Record<
    string,
    readonly [AnyRouteLike[], Record<string, any>, AnyRouteLike | undefined]
  >
  /** Cached matchRoutes templates for empty-search pathnames. */
  matchedTemplateCache?: Record<string, any[]>
  /** True if any route has validateSearch or search middlewares. */
  hasSearchWork?: boolean
  /** True if any route has search middlewares. validateSearch alone can stay on the href warm path. */
  hasSearchMiddleware?: boolean
  /** Optional param names in insert order, used to prefer left-filled matches. */
  optionalNames?: string[]
}

function childrenOf(route: AnyRouteLike): AnyRouteLike[] {
  const kids = route.children
  if (!kids) return []
  return Array.isArray(kids) ? kids : Object.values(kids)
}

function lastIdSegment(id: string): string {
  let end = id.length
  if (end > 1 && id.charCodeAt(end - 1) === 47) end--
  if (end <= 0) return ''
  const slash = id.lastIndexOf('/', end - 1)
  return slash === -1 ? id.slice(0, end) : id.slice(slash + 1, end)
}

function publicPathHasSegment(path: string, segment: string): boolean {
  if (!path || !segment) return false
  let start = path.charCodeAt(0) === 47 ? 1 : 0
  for (let index = start; index <= path.length; index++) {
    if (index === path.length || path.charCodeAt(index) === 47) {
      if (index > start && path.slice(start, index) === segment) return true
      start = index + 1
    }
  }
  return false
}

function isPathless(route: AnyRouteLike): boolean {
  if (route.isRoot) return false
  // A file index under `_layout` still has that underscore in its id
  // (`/$user/_layout/`). Treat it as the concrete terminal, not a layout.
  if (isIndex(route)) return false
  const optionsPath = route.options?.path
  const optionsId = route.options?.id
  if (!optionsPath && !!optionsId) return true
  const id = typeof route.id === 'string' && route.id ? route.id : optionsId
  if (typeof id !== 'string' || !id) return false
  const last = lastIdSegment(id)
  if (!last || last === '__root__') return false
  const prefix = last.charCodeAt(0)
  // `_` layouts, `@` slots, and parenthesized `(group)` folders.
  if (
    prefix !== 95 &&
    prefix !== 64 &&
    !(prefix === 40 && last.charCodeAt(last.length - 1) === 41)
  ) {
    return false
  }
  const publicPath = route.fullPath || route.path || optionsPath || ''
  return !publicPathHasSegment(publicPath, last)
}

const pathlessRoutes = new WeakSet<object>()

function rememberIfPathless(route: AnyRouteLike) {
  if (!isPathless(route)) return false
  pathlessRoutes.add(route)
  return true
}

function isIndex(route: AnyRouteLike): boolean {
  if (route.isRoot) return false
  if (route.options?.path === '/' || route.path === '/') return true
  const fullPath = route.fullPath
  return (
    typeof fullPath === 'string' &&
    fullPath.length > 1 &&
    fullPath.charCodeAt(fullPath.length - 1) === 47
  )
}

function pathlessAttachPath(route: AnyRouteLike): string {
  const fullPath = route.fullPath
  if (typeof fullPath === 'string' && fullPath && fullPath !== '/') return fullPath
  return findNearestAncestorPath(route.parentRoute)
}

function walkPath(node: SegmentNode, path: string, caseSensitive: boolean, route?: AnyRouteLike) {
  let cursor = 0
  let current = node
  let segment: ParsedSegment | undefined
  const trimmed = path.charCodeAt(0) === 47 ? path.slice(1) : path

  while (cursor < trimmed.length) {
    const start = cursor
    segment = parseSegment(trimmed, start, segment)
    const end = segment[5]
    cursor = end + 1
    if (start === end) continue

    const kind = segment[0]
    if (kind === SEGMENT_TYPE_PATHNAME) {
      let key = trimmed.substring(start, end)
      if (!caseSensitive) key = key.toLowerCase()
      current = getOrCreateStatic(current, key, caseSensitive)
    } else if (kind === SEGMENT_TYPE_PARAM) {
      current = getOrCreateParam(
        current,
        trimmed.substring(segment[2], segment[3]),
        trimmed.substring(start, segment[1]),
        trimmed.substring(segment[4], end),
        route?.options?.params?.parse ?? route?.options?.parseParams ?? null,
        route?.options?.params?.priority ?? 0,
      )
    } else if (kind === SEGMENT_TYPE_OPTIONAL_PARAM) {
      current = getOrCreateOptional(
        current,
        trimmed.substring(segment[2], segment[3]),
        trimmed.substring(start, segment[1]),
        trimmed.substring(segment[4], end),
      )
    } else if (kind === SEGMENT_TYPE_WILDCARD) {
      if (!current.wildcardChild) current.wildcardChild = createNode()
      current.wildcardChild.prefix = trimmed.substring(start, segment[1])
      current.wildcardChild.suffix = trimmed.substring(segment[4], end)
      current = current.wildcardChild
    }
  }
  return current
}

function findNearestAncestorPath(route: AnyRouteLike | undefined): string {
  let cursor = route
  while (cursor && !cursor.isRoot) {
    const p = cursor.fullPath || cursor.path
    if (p && p !== '/') return p
    cursor = cursor.parentRoute
  }
  return ''
}

function insertRoute(node: SegmentNode, route: AnyRouteLike, caseSensitive: boolean) {
  // Indexes first: a file index under a `_layout` still has that layout's
  // underscore in its id (`/$user/_layout/`), which isPathless would also see.
  if (isIndex(route)) {
    const fullPath = typeof route.fullPath === 'string' ? route.fullPath : ''
    const flattened =
      fullPath.length > 1 &&
      fullPath.charCodeAt(fullPath.length - 1) === 47 &&
      route.options?.path !== '/' &&
      route.path !== '/'
    const attachPath = flattened
      ? fullPath.slice(0, -1)
      : findNearestAncestorPath(route.parentRoute)
    const parentNode = attachPath ? walkPath(node, attachPath, caseSensitive, route) : node
    parentNode.indexRoute = route
    return
  }

  if (rememberIfPathless(route)) {
    const attachPath = pathlessAttachPath(route)
    const parentNode = attachPath ? walkPath(node, attachPath, caseSensitive, route) : node
    if (!parentNode.pathless) parentNode.pathless = []
    parentNode.pathless.push(route)
    return
  }

  const path = route.fullPath || route.path || ''
  if (!path || path === '/' || route.isRoot) {
    node.route = route
    return
  }

  walkPath(node, path, caseSensitive, route).route = route
}

const processedTreeCache = new WeakMap<
  AnyRouteLike,
  {
    caseSensitive: boolean
    children: unknown
    treeGen: number
    tree: ProcessedTree & { processedTree: ProcessedTree }
  }
>()

export function processRouteTree<T extends AnyRouteLike>(
  routeTree: T,
  caseSensitive = false,
): ProcessedTree & { processedTree: ProcessedTree } {
  const children = routeTree.children
  const treeGen = (routeTree as { _treeGen?: number })._treeGen ?? 0
  const cached = processedTreeCache.get(routeTree)
  if (
    cached &&
    cached.caseSensitive === caseSensitive &&
    cached.children === children &&
    cached.treeGen === treeGen
  ) {
    return cached.tree
  }

  const routesById: Record<string, AnyRouteLike> = Object.create(null)
  const routesByPath: Record<string, AnyRouteLike> = Object.create(null)
  const flatRoutes: AnyRouteLike[] = []

  const walk = (route: AnyRouteLike, index: number) => {
    ;(route as any).init?.({ originalIndex: index })
    if (route.id) routesById[route.id] = route
    if (route.fullPath && route.fullPath !== '/') {
      routesByPath[route.fullPath] = route
    }
    flatRoutes.push(route)
    const kids = childrenOf(route)
    for (let i = 0; i < kids.length; i++) walk(kids[i]!, i)
  }

  walk(routeTree, 0)

  const root = createNode()
  root.route = routeTree
  optionalNamesThisTree = []
  let hasCaseOverrides = false
  for (let i = 0; i < flatRoutes.length; i++) {
    const route = flatRoutes[i]!
    if (route === routeTree || route.isRoot) continue
    const routeCaseSensitive = route.options?.caseSensitive ?? caseSensitive
    if (route.options?.caseSensitive !== undefined) hasCaseOverrides = true
    insertRoute(root, route, routeCaseSensitive)
  }
  finalizeParamChildren(root)

  let hasSearchWork = false
  let hasSearchMiddleware = false
  for (const id in routesById) {
    const options = routesById[id]?.options
    if (options?.search?.middlewares?.length) {
      hasSearchWork = true
      hasSearchMiddleware = true
      break
    }
    if (options?.validateSearch) hasSearchWork = true
  }

  const processedTree = {
    root,
    routesById,
    routesByPath,
    flatRoutes,
    matchCache: createMatchCache<RouteMatchResult[] | null>(1000),
    hasDynamic: nodeHasDynamic(root),
    hasCaseOverrides,
    matchedRoutesCache: Object.create(null),
    matchedTemplateCache: Object.create(null),
    hasSearchWork,
    hasSearchMiddleware,
    optionalNames: optionalNamesThisTree.slice(),
    lastPath: '',
    lastMatch: null,
  } as ProcessedTree
  if (!hasCaseOverrides) {
    processedTree.staticExact = buildStaticExactTable(processedTree, caseSensitive)
  }

  const result = { ...processedTree, processedTree }
  processedTreeCache.set(routeTree, { caseSensitive, children, treeGen, tree: result })
  return result
}

export type RouteMatchResult = {
  route: AnyRouteLike
  params: Record<string, string>
  rawParams: Record<string, string>
}

const EMPTY_PARAMS: Record<string, string> = Object.freeze(Object.create(null))

function decodeSegment(raw: string) {
  if (raw.indexOf('%') === -1) return raw
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

function lastNonPathless(chain: AnyRouteLike[]): AnyRouteLike | undefined {
  for (let i = chain.length - 1; i >= 0; i--) {
    const route = chain[i]!
    if (!pathlessRoutes.has(route)) return route
  }
}

function isRouteAncestor(route: AnyRouteLike, of: AnyRouteLike): boolean {
  let cursor: AnyRouteLike | undefined = of
  while (cursor) {
    if (cursor === route || cursor.id === route.id) return true
    cursor = cursor.parentRoute
  }
  return false
}

function toMatchResults(
  chain: AnyRouteLike[],
  params: Record<string, string>,
  rawParams: Record<string, string> = params,
): RouteMatchResult[] {
  const concrete = lastNonPathless(chain)
  const matches: RouteMatchResult[] = []
  for (let i = 0; i < chain.length; i++) {
    const route = chain[i]!
    if (concrete && pathlessRoutes.has(route) && !isRouteAncestor(route, concrete)) {
      continue
    }
    let seen = false
    for (let j = 0; j < matches.length; j++) {
      if (matches[j]!.route.id === route.id) {
        seen = true
        break
      }
    }
    if (seen) continue
    matches.push({ route, params, rawParams })
  }
  return matches
}

function finishStaticMatch(
  tree: ProcessedTree,
  node: SegmentNode,
  chain: AnyRouteLike[],
): RouteMatchResult[] {
  if (node.indexRoute) chain.push(node.indexRoute)
  else if (node.route && node.route !== tree.root.route) {
    if (chain[chain.length - 1] !== node.route) chain.push(node.route)
  }
  return toMatchResults(chain, EMPTY_PARAMS)
}

function findStaticMatch(
  tree: ProcessedTree,
  pathname: string,
  caseSensitive: boolean,
): RouteMatchResult[] | null | undefined {
  let node = tree.root
  if (node.paramChild || node.paramChildren?.length || node.optionalChild || node.wildcardChild) {
    return undefined
  }

  const chain: AnyRouteLike[] = []
  if (node.route) chain.push(node.route)
  if (node.pathless) {
    for (let i = 0; i < node.pathless.length; i++) chain.push(node.pathless[i]!)
  }

  if (pathname === '/' || pathname === '') return finishStaticMatch(tree, node, chain)

  let i = pathname.charCodeAt(0) === 47 ? 1 : 0
  while (i < pathname.length) {
    if (node.paramChild || node.paramChildren?.length || node.optionalChild || node.wildcardChild) {
      return undefined
    }
    let end = i
    while (end < pathname.length && pathname.charCodeAt(end) !== 47) end++
    if (end > i) {
      let key = decodeSegment(pathname.slice(i, end))
      if (!caseSensitive) {
        let lower = false
        for (let k = 0; k < key.length; k++) {
          const c = key.charCodeAt(k)
          if (c >= 65 && c <= 90) {
            lower = true
            break
          }
        }
        if (lower) key = key.toLowerCase()
      }
      const child = node.staticChildren?.[key]
      if (!child) return null
      if (child.route) chain.push(child.route)
      if (child.pathless) {
        for (let p = 0; p < child.pathless.length; p++) chain.push(child.pathless[p]!)
      }
      node = child
    }
    i = end + 1
  }

  if (node.optionalChild || node.wildcardChild || node.paramChild || node.paramChildren?.length) {
    return undefined
  }
  const terminal = node.indexRoute ?? (node.route !== tree.root.route ? node.route : null)
  if (terminal?.options?.params?.parse || terminal?.options?.parseParams) return undefined
  return finishStaticMatch(tree, node, chain)
}

function splitSegments(pathname: string, keepTrailing = false): string[] {
  const out: string[] = []
  let last = pathname.charCodeAt(0) === 47 ? 1 : 0
  for (let i = last; i <= pathname.length; i++) {
    if (i === pathname.length || pathname.charCodeAt(i) === 47) {
      if (i > last) out.push(pathname.slice(last, i))
      last = i + 1
    }
  }
  if (keepTrailing && pathname.length > 1 && pathname.charCodeAt(pathname.length - 1) === 47) {
    out.push('')
  }
  return out
}

type WalkFrame = {
  node: SegmentNode
  index: number
  params: Record<string, string>
  rawParams?: Record<string, string>
  chain: AnyRouteLike[]
  depth: number
  parsed: number
  statics: number
  affix: number
}

function applyParamsParse(frame: WalkFrame): boolean {
  const rawParams = frame.rawParams ?? frame.params
  const params = Object.assign(Object.create(null), rawParams)
  for (let i = 0; i < frame.chain.length; i++) {
    const route = frame.chain[i]!
    const parse = route.options?.params?.parse ?? route.options?.parseParams
    if (!parse) continue
    try {
      const parsed = parse(params)
      if (parsed === false) return false
      if (parsed && typeof parsed === 'object') Object.assign(params, parsed)
    } catch {
      // thrown parsers do not skip the route
    }
  }
  frame.rawParams = rawParams
  frame.params = params
  return true
}

export { findRouteMatch }

function rememberHot(tree: ProcessedTree, pathname: string, result: RouteMatchResult[] | null) {
  tree.lastPath = pathname
  tree.lastMatch = result
  return rememberHotMatch(tree, pathname, result)
}

export function findRouteMatchFromTree(
  tree: ProcessedTree,
  pathname: string,
  caseSensitive = false,
  fuzzy = false,
): RouteMatchResult[] | null {
  if (!fuzzy && pathname === hotPath && tree === hotTree) return hotMatch!
  if (!fuzzy && !caseSensitive && tree.lastPath === pathname) {
    return rememberHot(tree, pathname, tree.lastMatch!)
  }
  return findRouteMatchOrdered(tree, pathname, caseSensitive, fuzzy)
}

setFindRouteMatchLookup((treeOrPathname, pathnameOrTree, caseSensitiveOrFuzzy) => {
  if (typeof pathnameOrTree === 'string') {
    return findRouteMatchFromTree(
      treeOrPathname as ProcessedTree,
      pathnameOrTree,
      caseSensitiveOrFuzzy,
    )
  }
  return null
})

function rememberMatch(
  tree: ProcessedTree,
  pathname: string,
  result: RouteMatchResult[] | null,
  caseSensitive: boolean,
  fuzzy: boolean,
): RouteMatchResult[] | null {
  if (!fuzzy && !caseSensitive) rememberHot(tree, pathname, result)
  return result
}

function findRouteMatchOrdered(
  tree: ProcessedTree,
  pathname: string,
  caseSensitive = false,
  fuzzy = false,
): RouteMatchResult[] | null {
  if (!fuzzy && !caseSensitive && tree.lastPath === pathname) {
    return tree.lastMatch!
  }

  if (!fuzzy && pathname.indexOf('%') === -1) {
    const exact = lookupStaticExact(tree, pathname, caseSensitive)
    if (exact !== undefined) return rememberMatch(tree, pathname, exact, caseSensitive, fuzzy)
  }

  const cacheKey =
    caseSensitive || fuzzy
      ? `${caseSensitive ? '1' : '0'}:${fuzzy ? '1' : '0'}:${pathname}`
      : pathname
  const cached = tree.matchCache.get(cacheKey)
  if (cached !== undefined) return rememberMatch(tree, pathname, cached, caseSensitive, fuzzy)

  if (!fuzzy && !tree.hasCaseOverrides) {
    const staticHit = findStaticMatch(tree, pathname, caseSensitive)
    if (staticHit !== undefined) {
      tree.matchCache.set(cacheKey, staticHit)
      return rememberMatch(tree, pathname, staticHit, caseSensitive, fuzzy)
    }
  }

  const result = findRouteMatchDynamic(tree, pathname, caseSensitive, fuzzy)
  tree.matchCache.set(cacheKey, result)
  return rememberMatch(tree, pathname, result, caseSensitive, fuzzy)
}

let optionalNamesThisTree: string[] = []
let activeOptionalNames: string[] | undefined

function optionalFillScore(params: Record<string, string>, names: string[] | undefined) {
  if (!names?.length) return 0
  let score = 0
  for (let i = 0; i < names.length; i++) {
    const name = names[i]
    if (name != null && name in params) score += names.length - i
  }
  return score
}

function isBetterMatch(best: WalkFrame | null, candidate: WalkFrame): boolean {
  if (!best) return true
  if (candidate.statics !== best.statics) return candidate.statics > best.statics
  if (candidate.affix !== best.affix) return candidate.affix > best.affix
  const candidateFill = optionalFillScore(candidate.params, activeOptionalNames)
  const bestFill = optionalFillScore(best.params, activeOptionalNames)
  if (candidateFill !== bestFill) return candidateFill > bestFill
  if (candidate.chain.length !== best.chain.length) {
    return candidate.chain.length > best.chain.length
  }
  if (candidate.parsed !== best.parsed) return candidate.parsed > best.parsed
  if (candidate.depth !== best.depth) return candidate.depth > best.depth
  return !!(candidate.node.indexRoute && !best.node.indexRoute)
}

function parsedScore(frame: WalkFrame): number {
  let score = 0
  for (let i = 0; i < frame.chain.length; i++) {
    const route = frame.chain[i]!
    if (route.options?.params?.parse || route.options?.parseParams) score++
  }
  return score
}

function applyPathless(node: SegmentNode, chain: AnyRouteLike[]) {
  if (!node.pathless) return chain
  const next = chain.slice()
  for (let i = 0; i < node.pathless.length; i++) next.push(node.pathless[i]!)
  return next
}

function withPathless(next: WalkFrame): WalkFrame {
  if (!next.node.pathless) return next
  return {
    ...next,
    chain: applyPathless(next.node, next.chain),
  }
}

function pushStaticFrame(
  stack: WalkFrame[],
  parent: SegmentNode,
  frame: WalkFrame,
  index: number,
  child: SegmentNode,
) {
  const onlyStatic =
    !parent.wildcardChild &&
    !parent.optionalChild &&
    !parent.optionalChildren?.length &&
    !parent.paramChild
  const chain = onlyStatic ? frame.chain : frame.chain.slice()
  if (child.route) chain.push(child.route)
  stack.push(
    withPathless({
      node: child,
      index: index + 1,
      params: frame.params,
      chain,
      depth: frame.depth + 1,
      parsed: frame.parsed,
      statics: frame.statics + 1,
      affix: frame.affix,
    }),
  )
}

function considerFuzzy(
  fuzzy: boolean,
  decodedLength: number,
  rootRoute: AnyRouteLike | null | undefined,
  bestFuzzy: WalkFrame | null,
  frame: WalkFrame,
): WalkFrame | null {
  if (!fuzzy || frame.index >= decodedLength) return bestFuzzy
  if (!frame.node.route || frame.node.route === rootRoute) return bestFuzzy
  return isBetterMatch(bestFuzzy, frame) ? frame : bestFuzzy
}

function considerTerminal(
  frame: WalkFrame,
  stack: WalkFrame[],
  best: WalkFrame | null,
  rootRoute: AnyRouteLike | null | undefined,
): WalkFrame | null {
  const terminal = withPathless(frame)
  const indexRoute = terminal.node.indexRoute
  if (indexRoute) {
    const indexed = {
      ...terminal,
      chain: terminal.chain.concat(indexRoute),
    }
    if (applyParamsParse(indexed)) {
      indexed.parsed = parsedScore(indexed)
      if (isBetterMatch(best, indexed)) best = indexed
    } else if (
      terminal.node.wildcardChild &&
      !terminal.node.wildcardChild.prefix &&
      !terminal.node.wildcardChild.suffix
    ) {
      const params = Object.assign(Object.create(null), terminal.params)
      params._splat = ''
      params['*'] = ''
      const wild = {
        ...terminal,
        node: terminal.node.wildcardChild,
        params,
        chain: terminal.chain.concat(
          terminal.node.wildcardChild.route ? [terminal.node.wildcardChild.route] : [],
        ),
        depth: terminal.depth + 1,
      }
      if (applyParamsParse(wild)) {
        wild.parsed = parsedScore(wild)
        if (isBetterMatch(best, wild)) best = wild
      }
    }
  } else {
    const chainBeforeRoute = terminal.chain.slice()
    if (terminal.node.route && terminal.node.route !== rootRoute) {
      if (terminal.chain[terminal.chain.length - 1] !== terminal.node.route) {
        terminal.chain.push(terminal.node.route)
      }
    }
    // Intermediate optional nodes have no route of their own. Accepting them
    // lets `/{ -$locale}/$rooms` treat `/chambres` as a filled locale and win
    // over the real required-param match.
    if (terminal.node.route && applyParamsParse(terminal)) {
      terminal.parsed = parsedScore(terminal)
      if (isBetterMatch(best, terminal)) best = terminal
    }
    if (
      terminal.node.wildcardChild &&
      !terminal.node.wildcardChild.prefix &&
      !terminal.node.wildcardChild.suffix
    ) {
      const params = Object.assign(Object.create(null), terminal.params)
      params._splat = ''
      params['*'] = ''
      const wild = {
        ...terminal,
        node: terminal.node.wildcardChild,
        params,
        chain: chainBeforeRoute
          .filter((route) => route !== terminal.node.route)
          .concat(terminal.node.wildcardChild.route ? [terminal.node.wildcardChild.route] : []),
        depth: terminal.depth + 1,
      }
      if (applyParamsParse(wild)) {
        wild.parsed = parsedScore(wild)
        if (isBetterMatch(best, wild)) best = wild
      }
    }
  }
  const optionals = terminal.node.optionalChildren?.length
    ? terminal.node.optionalChildren
    : terminal.node.optionalChild
      ? [terminal.node.optionalChild]
      : []
  for (let o = 0; o < optionals.length; o++) {
    const child = optionals[o]!
    stack.push(
      withPathless({
        node: child,
        index: frame.index,
        params: terminal.params,
        chain: terminal.chain,
        depth: terminal.depth + 1,
        parsed: terminal.parsed,
        statics: terminal.statics,
        affix: terminal.affix,
      }),
    )
  }
  return best
}

function findRouteMatchDynamic(
  tree: ProcessedTree,
  pathname: string,
  caseSensitive: boolean,
  fuzzy = false,
): RouteMatchResult[] | null {
  const segments = splitSegments(pathname === '/' ? '' : pathname)
  const decoded: string[] = new Array(segments.length)
  for (let i = 0; i < segments.length; i++) {
    decoded[i] = decodeSegment(segments[i]!)
  }

  activeOptionalNames = tree.optionalNames
  const stack: WalkFrame[] = [
    {
      node: tree.root,
      index: 0,
      params: Object.create(null),
      chain: applyPathless(tree.root, tree.root.route ? [tree.root.route] : []),
      depth: 0,
      parsed: 0,
      statics: 0,
      affix: 0,
    },
  ]

  let best: WalkFrame | null = null
  let bestFuzzy: WalkFrame | null = null
  const rootRoute = tree.root.route
  const decodedLength = decoded.length

  while (stack.length) {
    const frame = stack.pop()!
    const { node, index } = frame
    bestFuzzy = considerFuzzy(fuzzy, decodedLength, rootRoute, bestFuzzy, frame)

    if (index === decoded.length) {
      best = considerTerminal(frame, stack, best, rootRoute)
      continue
    }

    const raw = segments[index]!
    const value = decoded[index]!
    const key = caseSensitive ? value : value.toLowerCase()

    if (node.wildcardChild) {
      const prefix = node.wildcardChild.prefix || ''
      const suffix = node.wildcardChild.suffix || ''
      const first = decoded[index]!
      const lastSeg = decoded[decoded.length - 1]!
      const prefixOk =
        !prefix ||
        (caseSensitive
          ? first.startsWith(prefix)
          : first.toLowerCase().startsWith(prefix.toLowerCase()))
      const suffixOk =
        !suffix ||
        (caseSensitive
          ? lastSeg.endsWith(suffix)
          : lastSeg.toLowerCase().endsWith(suffix.toLowerCase()))
      if (prefixOk && suffixOk) {
        const params = Object.assign(Object.create(null), frame.params)
        const rest = decoded.slice(index)
        if (prefix) rest[0] = rest[0]!.slice(prefix.length)
        if (suffix) {
          rest[rest.length - 1] = rest[rest.length - 1]!.slice(
            0,
            rest[rest.length - 1]!.length - suffix.length,
          )
        }
        const splat = rest.join('/')
        params._splat = splat
        params['*'] = splat
        const chain = frame.chain.slice()
        if (node.wildcardChild.route) chain.push(node.wildcardChild.route)
        stack.push(
          withPathless({
            node: node.wildcardChild,
            index: segments.length,
            params,
            chain,
            depth: frame.depth + 1,
            parsed: frame.parsed,
            statics: frame.statics,
            affix: frame.affix + prefix.length + suffix.length,
          }),
        )
      }
    }

    const optionals = node.optionalChildren?.length
      ? node.optionalChildren
      : node.optionalChild
        ? [node.optionalChild]
        : []
    for (let o = 0; o < optionals.length; o++) {
      const child = optionals[o]!
      const name = child.optionalName || node.optionalName
      const inner = extractPrefixed(value, child.prefix || '', child.suffix || '', caseSensitive)
      if (inner !== null) {
        const params = Object.assign(Object.create(null), frame.params)
        if (inner) params[name] = inner
        const chain = frame.chain.slice()
        if (child.route) chain.push(child.route)
        stack.push(
          withPathless({
            node: child,
            index: index + 1,
            params,
            chain,
            depth: frame.depth + 1,
            parsed: frame.parsed,
            statics: frame.statics,
            affix: frame.affix + (child.prefix?.length ?? 0) + (child.suffix?.length ?? 0),
          }),
        )
      }
      stack.push(
        withPathless({
          node: child,
          index,
          params: frame.params,
          chain: frame.chain.slice(),
          depth: frame.depth + 1,
          parsed: frame.parsed,
          statics: frame.statics,
          affix: frame.affix,
        }),
      )
    }

    const paramKids = node.paramChildren?.length
      ? node.paramChildren
      : node.paramChild
        ? [node.paramChild]
        : []
    if (paramKids.length) {
      for (let p = paramKids.length - 1; p >= 0; p--) {
        const child = paramKids[p]!
        const inner = extractPrefixed(value, child.prefix || '', child.suffix || '', caseSensitive)
        if (inner === null) continue
        const params = Object.assign(Object.create(null), frame.params)
        params[child.paramName || node.paramName || ''] = inner
        const chain = frame.chain.slice()
        if (child.route) chain.push(child.route)
        stack.push(
          withPathless({
            node: child,
            index: index + 1,
            params,
            chain,
            depth: frame.depth + 1,
            parsed: frame.parsed,
            statics: frame.statics,
            affix: frame.affix + (child.prefix?.length ?? 0) + (child.suffix?.length ?? 0),
          }),
        )
      }
    }

    const insensitiveChild =
      node.staticChildren?.[key] ??
      (caseSensitive ? undefined : node.staticChildren?.[raw.toLowerCase()])
    if (insensitiveChild) pushStaticFrame(stack, node, frame, index, insensitiveChild)
    const sensitiveChild = node.staticSensitiveChildren?.[raw]
    if (sensitiveChild) {
      pushStaticFrame(stack, node, frame, index, sensitiveChild)
    }
  }

  if (best) return toMatchResults(best.chain, best.params, best.rawParams ?? best.params)
  if (fuzzy && bestFuzzy !== null) {
    const leftover = decoded.slice((bestFuzzy as WalkFrame).index).join('/')
    const rawParams = Object.assign(
      Object.create(null),
      (bestFuzzy as WalkFrame).rawParams ?? (bestFuzzy as WalkFrame).params,
    )
    rawParams['**'] = leftover
    return toMatchResults((bestFuzzy as WalkFrame).chain, rawParams, rawParams)
  }
  return null
}

function extractPrefixed(
  value: string,
  prefix: string,
  suffix: string,
  caseSensitive: boolean,
): string | null {
  if (!prefix && !suffix) return value
  if (caseSensitive) {
    if (prefix && !value.startsWith(prefix)) return null
    if (suffix && !value.endsWith(suffix)) return null
  } else {
    const lower = value.toLowerCase()
    if (prefix && !lower.startsWith(prefix.toLowerCase())) return null
    if (suffix && !lower.endsWith(suffix.toLowerCase())) return null
  }
  let inner = value
  if (prefix) inner = inner.slice(prefix.length)
  if (suffix) inner = inner.slice(0, Math.max(0, inner.length - suffix.length))
  return inner
}

/**
 * Match a path pattern against a pathname without building a segment tree.
 * Official TanStack matcher tests use `match-compat` instead.
 */
export function findSingleMatch(
  pattern: string,
  caseSensitive = false,
  fuzzy = false,
  pathname?: string,
  tree?: ProcessedTree,
): { rawParams: Record<string, string>; params: Record<string, string> } | null {
  if ((typeof pattern !== 'string' && pattern && typeof pattern === 'object') || !tree) {
    return null
  }
  const rawParams = matchPathPattern(pattern || '/', pathname || '/', caseSensitive, fuzzy)
  return rawParams ? { rawParams, params: rawParams } : null
}

export function findFlatMatch(
  treeOrPath: ProcessedTree | string,
  fromOrTree?: string | ProcessedTree,
): any {
  if (typeof treeOrPath === 'string') {
    const tree = fromOrTree as ProcessedTree | undefined
    if (!tree) return undefined
    const masks = tree.masks
    if (masks?.length) {
      for (let i = 0; i < masks.length; i++) {
        const mask = masks[i]!
        const matched = matchPathPattern(mask.from || '/', treeOrPath, false, false)
        if (matched) return { route: mask, rawParams: matched }
      }
      return null
    }
    const matches = findRouteMatchFromTree(tree, treeOrPath)
    if (!matches?.length) return null
    const last = matches[matches.length - 1]!
    return { route: last.route, rawParams: last.rawParams }
  }
  const from = fromOrTree as string
  const mask = treeOrPath.masks?.find((item) => item.from === from)
  if (mask) return mask as unknown as AnyRouteLike
  return treeOrPath.routesById[from] ?? treeOrPath.routesByPath[from]
}

export function buildRouteBranch(route: AnyRouteLike): AnyRouteLike[] {
  const branch: AnyRouteLike[] = []
  let current: AnyRouteLike | undefined = route
  while (current) {
    branch.unshift(current)
    current = current.parentRoute
  }
  return branch
}

export function processRouteMasks(
  routeList: Array<{ from: string; [key: string]: any }> = [],
  processedTree?: ProcessedTree,
) {
  if (processedTree) processedTree.masks = routeList
  return routeList
}

function matchPathPattern(
  pattern: string,
  pathname: string,
  caseSensitive: boolean,
  fuzzy: boolean,
): Record<string, string> | null {
  return matchPathFrom(
    pattern,
    pathname,
    caseSensitive,
    fuzzy,
    pattern.charCodeAt(0) === 47 ? 1 : 0,
    pathname.charCodeAt(0) === 47 ? 1 : 0,
    Object.create(null),
  )
}

function matchPathFrom(
  pattern: string,
  pathname: string,
  caseSensitive: boolean,
  fuzzy: boolean,
  patternIndex: number,
  pathIndex: number,
  rawParams: Record<string, string>,
): Record<string, string> | null {
  const patternEnd = pattern.length
  const pathEnd = pathname.length
  const parsed = new Uint16Array(6) as ParsedSegment

  while (patternIndex < patternEnd) {
    if (pattern.charCodeAt(patternIndex) === 47) patternIndex++
    if (patternIndex >= patternEnd) break
    parseSegment(pattern, patternIndex, parsed)
    const kind = parsed[0]
    const partEnd = parsed[5]
    const part = pattern.slice(patternIndex, partEnd)
    const marker = part.indexOf('{') === -1 ? part.indexOf('$') : part.indexOf('{')
    const prefix = marker > 0 ? part.slice(0, marker) : ''
    const name = pattern.slice(parsed[2], parsed[3])
    const suffix = pattern.slice(parsed[4], partEnd)
    const nextPatternIndex = partEnd + (pattern.charCodeAt(partEnd) === 47 ? 1 : 0)

    if (pathIndex < pathEnd && pathname.charCodeAt(pathIndex) === 47) pathIndex++
    const slash = pathname.indexOf('/', pathIndex)
    const segmentEnd = slash === -1 ? pathEnd : slash
    const segment = pathname.slice(pathIndex, segmentEnd)

    if (kind === SEGMENT_TYPE_PATHNAME) {
      const expected = pattern.slice(parsed[1], partEnd)
      if (!segmentEquals(segment, expected, caseSensitive)) {
        if (fuzzy && nextPatternIndex >= patternEnd) break
        return null
      }
      patternIndex = nextPatternIndex
      pathIndex = segmentEnd
      continue
    }

    if (kind === SEGMENT_TYPE_WILDCARD) {
      const rest = pathname.slice(pathIndex)
      if (prefix && !rest.startsWith(prefix)) return null
      if (suffix && !rest.endsWith(suffix)) return null
      const value = rest.slice(prefix.length, suffix ? rest.length - suffix.length : rest.length)
      rawParams['*'] = value
      rawParams._splat = value
      return rawParams
    }

    if (kind === SEGMENT_TYPE_OPTIONAL_PARAM) {
      if (segment && segmentStartsWith(segment, prefix, suffix, caseSensitive)) {
        const value = unwrapAffix(segment, prefix, suffix)
        const consumed = Object.assign(Object.create(null), rawParams)
        if (value) consumed[name] = value
        const matched = matchPathFrom(
          pattern,
          pathname,
          caseSensitive,
          fuzzy,
          nextPatternIndex,
          segmentEnd,
          consumed,
        )
        if (matched) return matched
      }
      patternIndex = nextPatternIndex
      continue
    }

    if (!segment || !segmentStartsWith(segment, prefix, suffix, caseSensitive)) return null
    rawParams[name] = unwrapAffix(segment, prefix, suffix)
    patternIndex = nextPatternIndex
    pathIndex = segmentEnd
  }

  if (pathIndex < pathEnd) {
    if (pathname.charCodeAt(pathIndex) === 47) pathIndex++
    if (pathIndex < pathEnd && !fuzzy) return null
  }
  return rawParams
}

function segmentEquals(left: string, right: string, caseSensitive: boolean) {
  return caseSensitive ? left === right : left.toLowerCase() === right.toLowerCase()
}

function segmentStartsWith(
  segment: string,
  prefix: string,
  suffix: string,
  caseSensitive: boolean,
) {
  if (!prefix && !suffix) return true
  const value = caseSensitive ? segment : segment.toLowerCase()
  const start = caseSensitive ? prefix : prefix.toLowerCase()
  const end = caseSensitive ? suffix : suffix.toLowerCase()
  return (!start || value.startsWith(start)) && (!end || value.endsWith(end))
}

function unwrapAffix(segment: string, prefix: string, suffix: string) {
  return segment.slice(prefix.length, suffix ? segment.length - suffix.length : segment.length)
}

export function trimPathRight(path: string) {
  const len = path.length
  return len > 1 && path.charCodeAt(len - 1) === 47 ? path.slice(0, -1) : path
}
