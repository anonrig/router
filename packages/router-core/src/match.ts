function createMatchCache<V>(max = 1000) {
  const map = new Map<string, V>()
  return {
    get(key: string): V | undefined {
      return map.get(key)
    },
    set(key: string, value: V) {
      if (map.has(key)) map.delete(key)
      map.set(key, value)
      if (map.size > max) {
        const first = map.keys().next().value
        if (first !== undefined) map.delete(first)
      }
    },
    clear() {
      map.clear()
    },
  }
}

export const SEGMENT_TYPE_PATHNAME = 0
export const SEGMENT_TYPE_PARAM = 1
export const SEGMENT_TYPE_WILDCARD = 2
export const SEGMENT_TYPE_OPTIONAL_PARAM = 3

export type SegmentKind =
  | typeof SEGMENT_TYPE_PATHNAME
  | typeof SEGMENT_TYPE_PARAM
  | typeof SEGMENT_TYPE_WILDCARD
  | typeof SEGMENT_TYPE_OPTIONAL_PARAM

type ParsedSegment = Uint16Array & {
  0: SegmentKind
  1: number
  2: number
  3: number
  4: number
  5: number
}

export function parseSegment(
  path: string,
  start: number,
  output: Uint16Array = new Uint16Array(6),
): ParsedSegment {
  const next = path.indexOf('/', start)
  const end = next === -1 ? path.length : next
  const part = path.substring(start, end)

  if (!part || part.indexOf('$') === -1) {
    output[0] = SEGMENT_TYPE_PATHNAME
    output[1] = start
    output[2] = start
    output[3] = end
    output[4] = end
    output[5] = end
    return output as ParsedSegment
  }

  if (part === '$') {
    const total = path.length
    output[0] = SEGMENT_TYPE_WILDCARD
    output[1] = start
    output[2] = start
    output[3] = total
    output[4] = total
    output[5] = total
    return output as ParsedSegment
  }

  if (part.charCodeAt(0) === 36) {
    output[0] = SEGMENT_TYPE_PARAM
    output[1] = start
    output[2] = start + 1
    output[3] = end
    output[4] = end
    output[5] = end
    return output as ParsedSegment
  }

  const openBrace = part.indexOf('{')
  let closeBrace = -1
  if (
    openBrace !== -1 &&
    openBrace + 1 < part.length &&
    (closeBrace = part.indexOf('}', openBrace)) !== -1
  ) {
    const firstChar = part.charCodeAt(openBrace + 1)
    if (firstChar === 45) {
      if (openBrace + 2 < part.length && part.charCodeAt(openBrace + 2) === 36) {
        const paramStart = openBrace + 3
        const paramEnd = closeBrace
        if (paramStart < paramEnd) {
          output[0] = SEGMENT_TYPE_OPTIONAL_PARAM
          output[1] = start + openBrace
          output[2] = start + paramStart
          output[3] = start + paramEnd
          output[4] = start + closeBrace + 1
          output[5] = end
          return output as ParsedSegment
        }
      }
    } else if (firstChar === 36) {
      const dollarPos = openBrace + 1
      const afterDollar = openBrace + 2
      if (afterDollar === closeBrace) {
        output[0] = SEGMENT_TYPE_WILDCARD
        output[1] = start + openBrace
        output[2] = start + dollarPos
        output[3] = start + afterDollar
        output[4] = start + closeBrace + 1
        output[5] = path.length
        return output as ParsedSegment
      }
      output[0] = SEGMENT_TYPE_PARAM
      output[1] = start + openBrace
      output[2] = start + afterDollar
      output[3] = start + closeBrace
      output[4] = start + closeBrace + 1
      output[5] = end
      return output as ParsedSegment
    }
  }

  output[0] = SEGMENT_TYPE_PATHNAME
  output[1] = start
  output[2] = start
  output[3] = end
  output[4] = end
  output[5] = end
  return output as ParsedSegment
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

function getOrCreateStatic(node: SegmentNode, key: string): SegmentNode {
  const children = node.staticChildren ?? (node.staticChildren = Object.create(null))
  const existing = children[key]
  if (existing) return existing
  const child = createNode()
  children[key] = child
  return child
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

export type MaskTreeNode = {
  static: Map<string, MaskTreeNode>
  staticInsensitive: Map<string, MaskTreeNode>
  dynamic: MaskTreeNode[]
  optional: MaskTreeNode[]
  wildcard: MaskTreeNode[]
  route?: { from: string; [key: string]: any }
}

export type ProcessedTree = {
  root: SegmentNode
  routesById: Record<string, AnyRouteLike>
  routesByPath: Record<string, AnyRouteLike>
  flatRoutes: AnyRouteLike[]
  matchCache: ReturnType<typeof createMatchCache<RouteMatchResult[] | null>>
  masks?: Array<{ from: string; [key: string]: any }>
  masksTree?: MaskTreeNode | null
  /**
   * Precomputed exact matches for fully-static paths (find-my-way: never enter
   * the parametric walker when the path is static).
   */
  staticExact?: Record<string, RouteMatchResult[]>
  /** True if any node has a param, optional, or wildcard child. */
  hasDynamic?: boolean
  /** One-entry last hit (find-my-way `_treeGET`: fixed-offset, not a map). */
  lastPath?: string
  lastMatch?: RouteMatchResult[] | null
}

function childrenOf(route: AnyRouteLike): AnyRouteLike[] {
  const kids = route.children
  if (!kids) return []
  return Array.isArray(kids) ? kids : Object.values(kids)
}

function isPathless(route: AnyRouteLike): boolean {
  return !route.isRoot && !route.options?.path && !!route.options?.id
}

function isIndex(route: AnyRouteLike): boolean {
  return route.options?.path === '/' || route.path === '/'
}

function insertRoute(node: SegmentNode, route: AnyRouteLike, caseSensitive: boolean) {
  if (isPathless(route)) {
    if (!node.pathless) node.pathless = []
    node.pathless.push(route)
    const kids = childrenOf(route)
    for (let i = 0; i < kids.length; i++) insertRoute(node, kids[i]!, caseSensitive)
    return
  }

  if (isIndex(route) && !route.isRoot) {
    node.indexRoute = route
    const kids = childrenOf(route)
    for (let i = 0; i < kids.length; i++) insertRoute(node, kids[i]!, caseSensitive)
    return
  }

  const path = route.path || ''
  if (!path || path === '/' || route.isRoot) {
    node.route = route
    const kids = childrenOf(route)
    for (let i = 0; i < kids.length; i++) insertRoute(node, kids[i]!, caseSensitive)
    return
  }

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
      current = getOrCreateStatic(current, key)
    } else if (kind === SEGMENT_TYPE_PARAM) {
      const name = trimmed.substring(segment[2], segment[3])
      const parse = route.options?.params?.parse ?? route.options?.parseParams ?? null
      const priority = route.options?.params?.priority ?? 0
      const next = createNode()
      next.parse = parse
      next.priority = priority
      next.paramName = name
      next.prefix = trimmed.substring(start, segment[1])
      next.suffix = trimmed.substring(segment[4], end)
      current.paramChildren ??= []
      current.paramChildren.push(next)
      if (!current.paramChild) {
        current.paramChild = next
        current.paramName = name
      }
      current = next
    } else if (kind === SEGMENT_TYPE_OPTIONAL_PARAM) {
      const next = createNode()
      next.optionalName = trimmed.substring(segment[2], segment[3])
      next.prefix = trimmed.substring(start, segment[1])
      next.suffix = trimmed.substring(segment[4], end)
      current.optionalChildren ??= []
      current.optionalChildren.push(next)
      if (!current.optionalChild) {
        current.optionalChild = next
        current.optionalName = next.optionalName
      }
      current = next
    } else if (kind === SEGMENT_TYPE_WILDCARD) {
      if (!current.wildcardChild) current.wildcardChild = createNode()
      current.wildcardChild.prefix = trimmed.substring(start, segment[1])
      current.wildcardChild.suffix = trimmed.substring(segment[4], end)
      current = current.wildcardChild
    }
  }

  current.route = route
  const kids = childrenOf(route)
  for (let i = 0; i < kids.length; i++) insertRoute(current, kids[i]!, caseSensitive)
}

const processedTreeCache = new WeakMap<
  AnyRouteLike,
  {
    caseSensitive: boolean
    children: unknown
    tree: ProcessedTree & { processedTree: ProcessedTree }
  }
>()

export function processRouteTree<T extends AnyRouteLike>(
  routeTree: T,
  caseSensitive = false,
): ProcessedTree & { processedTree: ProcessedTree } {
  const children = routeTree.children
  const cached = processedTreeCache.get(routeTree)
  if (cached && cached.caseSensitive === caseSensitive && cached.children === children) {
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
  const kids = childrenOf(routeTree)
  for (let i = 0; i < kids.length; i++) insertRoute(root, kids[i]!, caseSensitive)
  finalizeParamChildren(root)

  const processedTree: ProcessedTree = {
    root,
    routesById,
    routesByPath,
    flatRoutes,
    matchCache: createMatchCache<RouteMatchResult[] | null>(1000),
    hasDynamic: nodeHasDynamic(root),
  }
  processedTree.staticExact = buildStaticExactTable(processedTree, caseSensitive)
  const result = { ...processedTree, processedTree }
  processedTreeCache.set(routeTree, { caseSensitive, children, tree: result })
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

function toMatchResults(chain: AnyRouteLike[], params: Record<string, string>): RouteMatchResult[] {
  const matches: RouteMatchResult[] = []
  for (let i = 0; i < chain.length; i++) {
    const route = chain[i]!
    let seen = false
    for (let j = 0; j < matches.length; j++) {
      if (matches[j]!.route.id === route.id) {
        seen = true
        break
      }
    }
    if (seen) continue
    matches.push({ route, params, rawParams: params })
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
  chain: AnyRouteLike[]
  depth: number
  parsed: number
  statics: number
  affix: number
}

function applyParamsParse(frame: WalkFrame): boolean {
  const params = Object.assign(Object.create(null), frame.params)
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
  frame.params = params
  return true
}

export function findRouteMatch(
  treeOrPathname: ProcessedTree | string,
  pathnameOrTree?: string | ProcessedTree,
  caseSensitiveOrFuzzy = false,
): any {
  if (typeof pathnameOrTree === 'string') {
    const tree = treeOrPathname as ProcessedTree
    if (!caseSensitiveOrFuzzy && tree.lastPath === pathnameOrTree) {
      return tree.lastMatch!
    }
    return findRouteMatchOrdered(tree, pathnameOrTree, caseSensitiveOrFuzzy, false)
  }
  if (typeof treeOrPathname === 'string') {
    const tree = pathnameOrTree as ProcessedTree
    const matches = findRouteMatchOrdered(tree, treeOrPathname, false, caseSensitiveOrFuzzy)
    if (!matches) return null
    const last = matches[matches.length - 1]!
    return {
      route: last.route,
      rawParams: last.rawParams,
      params: last.params,
      branch: matches.map((item) => item.route),
    }
  }
  return findRouteMatchOrdered(
    treeOrPathname,
    pathnameOrTree as string,
    caseSensitiveOrFuzzy,
    false,
  )
}

function rememberMatch(
  tree: ProcessedTree,
  pathname: string,
  result: RouteMatchResult[] | null,
  caseSensitive: boolean,
  fuzzy: boolean,
): RouteMatchResult[] | null {
  if (!fuzzy && !caseSensitive) {
    tree.lastPath = pathname
    tree.lastMatch = result
  }
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

  if (!fuzzy) {
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

function isBetterMatch(best: WalkFrame | null, candidate: WalkFrame): boolean {
  if (!best) return true
  if (candidate.statics !== best.statics) return candidate.statics > best.statics
  if (candidate.affix !== best.affix) return candidate.affix > best.affix
  if (candidate.chain.length !== best.chain.length)
    return candidate.chain.length > best.chain.length
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

  const applyPathless = (node: SegmentNode, chain: AnyRouteLike[]) => {
    if (!node.pathless) return chain
    const next = chain.slice()
    for (let i = 0; i < node.pathless.length; i++) next.push(node.pathless[i]!)
    return next
  }

  const withPathless = (next: WalkFrame): WalkFrame => {
    if (!next.node.pathless) return next
    return {
      ...next,
      chain: applyPathless(next.node, next.chain),
    }
  }

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

  const considerFuzzy = (frame: WalkFrame) => {
    if (!fuzzy || frame.index >= decoded.length) return
    if (!frame.node.route || frame.node.route === tree.root.route) return
    if (isBetterMatch(bestFuzzy, frame)) bestFuzzy = frame
  }

  while (stack.length) {
    const frame = stack.pop()!
    const { node, index } = frame
    considerFuzzy(frame)

    if (index === decoded.length) {
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
        if (terminal.node.route && terminal.node.route !== tree.root.route) {
          if (terminal.chain[terminal.chain.length - 1] !== terminal.node.route) {
            terminal.chain.push(terminal.node.route)
          }
        }
        if (applyParamsParse(terminal)) {
          terminal.parsed = parsedScore(terminal)
          if (isBetterMatch(best, terminal)) best = terminal
        }
        if (
          !best &&
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
            index,
            params: terminal.params,
            chain: terminal.chain,
            depth: terminal.depth + 1,
            parsed: terminal.parsed,
            statics: terminal.statics,
            affix: terminal.affix,
          }),
        )
      }
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
      const prefixOk = !prefix || first.startsWith(prefix)
      const suffixOk = !suffix || lastSeg.endsWith(suffix)
      if (prefixOk && suffixOk) {
        const params = Object.assign(Object.create(null), frame.params)
        const rest = decoded.slice(index)
        if (prefix) rest[0] = rest[0]!.slice(prefix.length)
        if (suffix)
          rest[rest.length - 1] = rest[rest.length - 1]!.slice(
            0,
            rest[rest.length - 1]!.length - suffix.length,
          )
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
      const inner = extractPrefixed(value, child.prefix || '', child.suffix || '')
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
        const inner = extractPrefixed(value, child.prefix || '', child.suffix || '')
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

    const staticChild =
      node.staticChildren?.[key] ??
      (caseSensitive ? undefined : node.staticChildren?.[raw.toLowerCase()])
    if (staticChild) {
      const onlyStatic =
        !node.wildcardChild &&
        !node.optionalChild &&
        !node.optionalChildren?.length &&
        !node.paramChild
      const chain = onlyStatic ? frame.chain : frame.chain.slice()
      if (staticChild.route) chain.push(staticChild.route)
      stack.push(
        withPathless({
          node: staticChild,
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
  }

  if (best) return toMatchResults(best.chain, best.params)
  if (fuzzy && bestFuzzy !== null) {
    const leftover = decoded.slice((bestFuzzy as WalkFrame).index).join('/')
    const params = Object.assign(Object.create(null), (bestFuzzy as WalkFrame).params)
    params['**'] = leftover
    return toMatchResults((bestFuzzy as WalkFrame).chain, params)
  }
  return null
}

type PatternPart = {
  kind: number
  raw: string
  name: string
  prefix: string
  suffix: string
}

function extractPrefixed(value: string, prefix: string, suffix: string): string | null {
  if (prefix && !value.startsWith(prefix)) return null
  if (suffix && !value.endsWith(suffix)) return null
  let inner = value
  if (prefix) inner = inner.slice(prefix.length)
  if (suffix) inner = inner.slice(0, Math.max(0, inner.length - suffix.length))
  return inner
}

function withParams(
  params: Record<string, string>,
  extra?: Record<string, string>,
): Record<string, string> {
  return Object.assign(Object.create(null), params, extra)
}

function matchPatternParts(
  parts: PatternPart[],
  pi: number,
  pathSegs: string[],
  si: number,
  params: Record<string, string>,
  caseSensitive: boolean,
  fuzzy: boolean,
): Record<string, string> | null {
  const norm = (s: string) => (caseSensitive ? s : s.toLowerCase())

  if (pi >= parts.length) {
    if (si === pathSegs.length) return withParams(params)
    if (fuzzy) {
      const leftover = pathSegs.slice(si)
      const splat = leftover.length === 1 && leftover[0] === '' ? '/' : leftover.join('/')
      return withParams(params, { '**': splat })
    }
    return null
  }

  const part = parts[pi]!

  if (part.kind === SEGMENT_TYPE_WILDCARD) {
    const rest = pathSegs.slice(si)
    if (rest.length === 0) {
      if (part.prefix || part.suffix) return null
      const next = withParams(params, { _splat: '', '*': '' })
      return matchPatternParts(parts, pi + 1, pathSegs, si, next, caseSensitive, fuzzy)
    }
    const first = rest[0]!
    const lastSeg = rest[rest.length - 1]!
    if (part.prefix && !first.startsWith(part.prefix)) return null
    if (part.suffix && !lastSeg.endsWith(part.suffix)) return null
    const stripped = rest.slice()
    if (part.prefix) stripped[0] = first.slice(part.prefix.length)
    if (part.suffix) {
      const idx = stripped.length - 1
      stripped[idx] = stripped[idx]!.slice(0, stripped[idx]!.length - part.suffix.length)
    }
    const splat = stripped.join('/')
    const next = withParams(params, { _splat: splat, '*': splat })
    return matchPatternParts(parts, pi + 1, pathSegs, pathSegs.length, next, caseSensitive, fuzzy)
  }

  if (part.kind === SEGMENT_TYPE_OPTIONAL_PARAM) {
    if (si < pathSegs.length) {
      const decoded = decodeSeg(pathSegs[si]!)
      const inner = extractPrefixed(decoded, part.prefix, part.suffix)
      if (inner !== null) {
        const consumed = matchPatternParts(
          parts,
          pi + 1,
          pathSegs,
          si + 1,
          withParams(params, { [part.name]: inner }),
          caseSensitive,
          fuzzy,
        )
        if (consumed) return consumed
      }
    }
    return matchPatternParts(parts, pi + 1, pathSegs, si, params, caseSensitive, fuzzy)
  }

  if (si >= pathSegs.length) {
    return null
  }

  const value = pathSegs[si]!
  if (part.kind === SEGMENT_TYPE_PATHNAME) {
    if (norm(value) !== norm(part.raw)) return null
    return matchPatternParts(parts, pi + 1, pathSegs, si + 1, params, caseSensitive, fuzzy)
  }

  if (part.kind === SEGMENT_TYPE_PARAM) {
    const decoded = decodeSeg(value)
    const inner = extractPrefixed(decoded, part.prefix, part.suffix)
    if (inner === null) return null
    return matchPatternParts(
      parts,
      pi + 1,
      pathSegs,
      si + 1,
      withParams(params, { [part.name]: inner }),
      caseSensitive,
      fuzzy,
    )
  }

  return null
}

/**
 * Match a path pattern (`pattern`) against an actual pathname.
 * Compatible with TanStack's findSingleMatch(from, caseSensitive, fuzzy, path, tree).
 */
export function findSingleMatch(
  pattern: string,
  caseSensitive = false,
  fuzzy = false,
  pathname?: string,
  _tree?: ProcessedTree,
): { rawParams: Record<string, string>; params: Record<string, string> } | null {
  if (typeof pattern !== 'string' && pattern && typeof pattern === 'object') {
    return null
  }
  const path = pathname ?? ''
  const patternTrail = pattern.length > 1 && pattern.charCodeAt(pattern.length - 1) === 47
  const pathTrail = path.length > 1 && path.charCodeAt(path.length - 1) === 47
  const pathSegs = splitSegments(path === '/' ? '' : path, pathTrail && !patternTrail)
  const fullPattern = pattern.charCodeAt(0) === 47 ? pattern.slice(1) : pattern

  let cursor = 0
  let segment: ParsedSegment | undefined
  const parts: PatternPart[] = []
  while (cursor < fullPattern.length) {
    const start = cursor
    segment = parseSegment(fullPattern, start, segment)
    const end = segment[5]
    cursor = end + 1
    if (start === end) continue
    parts.push({
      kind: segment[0],
      raw: fullPattern.substring(start, end),
      name: fullPattern.substring(segment[2], segment[3]),
      prefix: fullPattern.substring(start, segment[1]),
      suffix: fullPattern.substring(segment[4], end),
    })
  }

  const params = matchPatternParts(parts, 0, pathSegs, 0, Object.create(null), caseSensitive, fuzzy)
  if (!params) return null
  const rawParams = Object.assign(Object.create(null), params)
  return { rawParams, params: rawParams }
}

function decodeSeg(value: string) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function maskScore(from: string, params: Record<string, string>): number {
  const splat = params._splat ?? params['*'] ?? params['**'] ?? ''
  return from.length * 1000 - String(splat).length
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
      let best: { route: any; rawParams: Record<string, string> } | null = null
      let bestScore = Number.NEGATIVE_INFINITY
      for (let i = 0; i < masks.length; i++) {
        const mask = masks[i]!
        const matched = findSingleMatch(mask.from, false, false, treeOrPath, tree)
        if (!matched) continue
        const score = maskScore(mask.from, matched.rawParams)
        if (score > bestScore) {
          bestScore = score
          best = { route: mask, rawParams: matched.rawParams }
        }
      }
      return best
    }
    const matches = findRouteMatchOrdered(tree, treeOrPath, false)
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

function createMaskNode(): MaskTreeNode {
  return {
    static: new Map(),
    staticInsensitive: new Map(),
    dynamic: [],
    optional: [],
    wildcard: [],
  }
}

function insertMaskRoute(
  root: MaskTreeNode,
  from: string,
  mask: { from: string; [key: string]: any },
) {
  const trimmed = from.charCodeAt(0) === 47 ? from.slice(1) : from
  let cursor = 0
  let node = root
  let segment: ParsedSegment | undefined
  while (cursor < trimmed.length) {
    const start = cursor
    segment = parseSegment(trimmed, start, segment)
    const end = segment[5]
    cursor = end + 1
    if (start === end) continue
    const kind = segment[0]
    const raw = trimmed.substring(start, end)
    if (kind === SEGMENT_TYPE_PATHNAME) {
      const key = raw.toLowerCase()
      let child = node.staticInsensitive.get(key)
      if (!child) {
        child = createMaskNode()
        node.staticInsensitive.set(key, child)
        node.static.set(raw, child)
      }
      node = child
    } else if (kind === SEGMENT_TYPE_PARAM) {
      const child = createMaskNode()
      node.dynamic.push(child)
      node = child
    } else if (kind === SEGMENT_TYPE_OPTIONAL_PARAM) {
      const child = createMaskNode()
      node.optional.push(child)
      node = child
    } else if (kind === SEGMENT_TYPE_WILDCARD) {
      const child = createMaskNode()
      node.wildcard.push(child)
      node = child
    }
  }
  node.route = mask
}

export function processRouteMasks(
  routeList: Array<{ from: string; [key: string]: any }> = [],
  processedTree?: ProcessedTree,
) {
  if (processedTree) {
    processedTree.masks = routeList
    const masksTree = createMaskNode()
    for (let i = 0; i < routeList.length; i++) {
      const mask = routeList[i]!
      insertMaskRoute(masksTree, mask.from, mask)
    }
    processedTree.masksTree = masksTree
  }
  return routeList
}

export function trimPathRight(path: string) {
  const len = path.length
  return len > 1 && path.charCodeAt(len - 1) === 47 ? path.slice(0, -1) : path
}
