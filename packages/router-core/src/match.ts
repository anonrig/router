import { createLRUCache } from './lru-cache'

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
  staticChildren: Map<string, SegmentNode> | null
  paramChild: SegmentNode | null
  paramChildren: SegmentNode[] | null
  paramName: string
  optionalChild: SegmentNode | null
  optionalName: string
  wildcardChild: SegmentNode | null
  pathless: AnyRouteLike[] | null
  route: AnyRouteLike | null
  indexRoute: AnyRouteLike | null
  parse?: ((params: Record<string, string>) => unknown) | null
  priority?: number
}

function createNode(): SegmentNode {
  return {
    staticChildren: null,
    paramChild: null,
    paramChildren: null,
    paramName: '',
    optionalChild: null,
    optionalName: '',
    wildcardChild: null,
    pathless: null,
    route: null,
    indexRoute: null,
  }
}

function getOrCreateStatic(node: SegmentNode, key: string): SegmentNode {
  if (!node.staticChildren) node.staticChildren = new Map()
  let child = node.staticChildren.get(key)
  if (!child) {
    child = createNode()
    node.staticChildren.set(key, child)
  }
  return child
}

export type ProcessedTree = {
  root: SegmentNode
  routesById: Record<string, AnyRouteLike>
  routesByPath: Record<string, AnyRouteLike>
  flatRoutes: AnyRouteLike[]
  matchCache: ReturnType<typeof createLRUCache<string, RouteMatchResult[] | null>>
  masks?: Array<{ from: string; [key: string]: any }>
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
      current.paramChildren ??= []
      current.paramChildren.push(next)
      if (!current.paramChild) {
        current.paramChild = next
        current.paramName = name
      }
      current = next
    } else if (kind === SEGMENT_TYPE_OPTIONAL_PARAM) {
      if (!current.optionalChild) current.optionalChild = createNode()
      current.optionalName = trimmed.substring(segment[2], segment[3])
      current = current.optionalChild
    } else if (kind === SEGMENT_TYPE_WILDCARD) {
      if (!current.wildcardChild) current.wildcardChild = createNode()
      current = current.wildcardChild
    }
  }

  current.route = route
  const kids = childrenOf(route)
  for (let i = 0; i < kids.length; i++) insertRoute(current, kids[i]!, caseSensitive)
}

export function processRouteTree<T extends AnyRouteLike>(
  routeTree: T,
  caseSensitive = false,
): ProcessedTree & { processedTree: ProcessedTree } {
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

  const processedTree = {
    root,
    routesById,
    routesByPath,
    flatRoutes,
    matchCache: createLRUCache<string, RouteMatchResult[] | null>(1000),
  }
  return { ...processedTree, processedTree }
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
  if (
    node.paramChild ||
    node.paramChildren?.length ||
    node.optionalChild ||
    node.wildcardChild
  ) {
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
    if (
    node.paramChild ||
    node.paramChildren?.length ||
    node.optionalChild ||
    node.wildcardChild
  ) {
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
      const child = node.staticChildren?.get(key)
      if (!child) return null
      if (child.route) chain.push(child.route)
      if (child.pathless) {
        for (let p = 0; p < child.pathless.length; p++) chain.push(child.pathless[p]!)
      }
      node = child
    }
    i = end + 1
  }

  if (node.optionalChild) return undefined
  return finishStaticMatch(tree, node, chain)
}

function splitSegments(pathname: string): string[] {
  const out: string[] = []
  let last = pathname.charCodeAt(0) === 47 ? 1 : 0
  for (let i = last; i <= pathname.length; i++) {
    if (i === pathname.length || pathname.charCodeAt(i) === 47) {
      if (i > last) out.push(pathname.slice(last, i))
      last = i + 1
    }
  }
  return out
}

type WalkFrame = {
  node: SegmentNode
  index: number
  params: Record<string, string>
  chain: AnyRouteLike[]
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
  if (typeof treeOrPathname === 'string') {
    const tree = pathnameOrTree as ProcessedTree
    const matches = findRouteMatchOrdered(tree, treeOrPathname, false)
    if (!matches) return null
    const last = matches[matches.length - 1]!
    return {
      route: last.route,
      rawParams: last.rawParams,
      params: last.params,
      branch: matches.map((item) => item.route),
    }
  }
  return findRouteMatchOrdered(treeOrPathname, pathnameOrTree as string, caseSensitiveOrFuzzy)
}

function findRouteMatchOrdered(
  tree: ProcessedTree,
  pathname: string,
  caseSensitive = false,
): RouteMatchResult[] | null {
  const cacheKey = caseSensitive ? `1:${pathname}` : pathname
  const cached = tree.matchCache.get(cacheKey)
  if (cached !== undefined) return cached

  const staticHit = findStaticMatch(tree, pathname, caseSensitive)
  if (staticHit !== undefined) {
    tree.matchCache.set(cacheKey, staticHit)
    return staticHit
  }

  const result = findRouteMatchDynamic(tree, pathname, caseSensitive)
  tree.matchCache.set(cacheKey, result)
  return result
}

function findRouteMatchDynamic(
  tree: ProcessedTree,
  pathname: string,
  caseSensitive: boolean,
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
      node: next.node,
      index: next.index,
      params: next.params,
      chain: applyPathless(next.node, next.chain),
    }
  }

  const stack: WalkFrame[] = [
    {
      node: tree.root,
      index: 0,
      params: Object.create(null),
      chain: applyPathless(tree.root, tree.root.route ? [tree.root.route] : []),
    },
  ]

  let best: WalkFrame | null = null

  while (stack.length) {
    const frame = stack.pop()!
    const { node, index } = frame

    if (index === decoded.length) {
      const terminal = withPathless(frame)
      if (terminal.node.indexRoute) {
        terminal.chain.push(terminal.node.indexRoute)
      } else if (terminal.node.route && terminal.node.route !== tree.root.route) {
        if (terminal.chain[terminal.chain.length - 1] !== terminal.node.route) {
          terminal.chain.push(terminal.node.route)
        }
      }
      if (applyParamsParse(terminal)) {
        if (
          !best ||
          terminal.chain.length > best.chain.length ||
          (terminal.node.indexRoute && !best.node.indexRoute)
        ) {
          best = terminal
        }
      }
      if (terminal.node.optionalChild) {
        stack.push(
          withPathless({
            node: terminal.node.optionalChild,
            index,
            params: terminal.params,
            chain: terminal.chain,
          }),
        )
      }
      continue
    }

    const raw = segments[index]!
    const value = decoded[index]!
    const key = caseSensitive ? value : value.toLowerCase()

    if (node.wildcardChild) {
      const params = Object.assign(Object.create(null), frame.params)
      let splat = ''
      for (let i = index; i < decoded.length; i++) {
        if (i !== index) splat += '/'
        splat += decoded[i]!
      }
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
        }),
      )
    }

    if (node.optionalChild) {
      const params = Object.assign(Object.create(null), frame.params)
      params[node.optionalName] = value
      const chain = frame.chain.slice()
      if (node.optionalChild.route) chain.push(node.optionalChild.route)
      stack.push(
        withPathless({
          node: node.optionalChild,
          index: index + 1,
          params,
          chain,
        }),
      )
      stack.push(
        withPathless({
          node: node.optionalChild,
          index,
          params: frame.params,
          chain: frame.chain.slice(),
        }),
      )
    }

    const paramKids = node.paramChildren?.length
      ? node.paramChildren
      : node.paramChild
        ? [node.paramChild]
        : []
    if (paramKids.length) {
      const ordered = paramKids
        .slice()
        .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
      for (let p = ordered.length - 1; p >= 0; p--) {
        const child = ordered[p]!
        const params = Object.assign(Object.create(null), frame.params)
        params[child.paramName || node.paramName || ''] = value
        const chain = frame.chain.slice()
        if (child.route) chain.push(child.route)
        stack.push(
          withPathless({
            node: child,
            index: index + 1,
            params,
            chain,
          }),
        )
      }
    }

    const staticChild =
      node.staticChildren?.get(key) ??
      (caseSensitive ? undefined : node.staticChildren?.get(raw.toLowerCase()))
    if (staticChild) {
      const onlyStatic = !node.wildcardChild && !node.optionalChild && !node.paramChild
      const chain = onlyStatic ? frame.chain : frame.chain.slice()
      if (staticChild.route) chain.push(staticChild.route)
      stack.push(
        withPathless({
          node: staticChild,
          index: index + 1,
          params: frame.params,
          chain,
        }),
      )
    }
  }

  if (!best) return null
  return toMatchResults(best.chain, best.params)
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
    if (si === pathSegs.length || fuzzy) return withParams(params)
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
    return fuzzy ? withParams(params) : null
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
  const pathSegs = splitSegments(path === '/' ? '' : path)
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

export function findFlatMatch(
  treeOrPath: ProcessedTree | string,
  fromOrTree?: string | ProcessedTree,
): any {
  if (typeof treeOrPath === 'string') {
    const tree = fromOrTree as ProcessedTree | undefined
    if (!tree) return undefined
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

export function processRouteMasks(
  routeList: Array<{ from: string; [key: string]: any }> = [],
  processedTree?: ProcessedTree,
) {
  if (processedTree) processedTree.masks = routeList
  return routeList
}

export function trimPathRight(path: string) {
  const len = path.length
  return len > 1 && path.charCodeAt(len - 1) === 47 ? path.slice(0, -1) : path
}
