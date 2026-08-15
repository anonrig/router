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
  paramName: string
  optionalChild: SegmentNode | null
  optionalName: string
  wildcardChild: SegmentNode | null
  pathless: AnyRouteLike[] | null
  route: AnyRouteLike | null
  indexRoute: AnyRouteLike | null
}

function createNode(): SegmentNode {
  return {
    staticChildren: null,
    paramChild: null,
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
}

function childrenOf(route: AnyRouteLike): AnyRouteLike[] {
  const kids = route.children
  if (!kids) return []
  return Array.isArray(kids) ? kids : Object.values(kids)
}

function isPathless(route: AnyRouteLike): boolean {
  return !route.isRoot && !route.options.path && !!route.options.id
}

function isIndex(route: AnyRouteLike): boolean {
  return route.options.path === '/' || route.path === '/'
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
      if (!current.paramChild) current.paramChild = createNode()
      current.paramName = trimmed.substring(segment[2], segment[3])
      current = current.paramChild
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
    route.init?.({ originalIndex: index })
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

  const processedTree = { root, routesById, routesByPath, flatRoutes }
  return { ...processedTree, processedTree }
}

export type RouteMatchResult = {
  route: AnyRouteLike
  params: Record<string, string>
  rawParams: Record<string, string>
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

export function findRouteMatch(
  tree: ProcessedTree,
  pathname: string,
  caseSensitive = false,
): RouteMatchResult[] | null {
  const segments = splitSegments(pathname === '/' ? '' : pathname)
  const decoded: string[] = new Array(segments.length)
  for (let i = 0; i < segments.length; i++) {
    try {
      decoded[i] = decodeURIComponent(segments[i]!)
    } catch {
      decoded[i] = segments[i]!
    }
  }

  const applyPathless = (node: SegmentNode, chain: AnyRouteLike[]) => {
    if (!node.pathless) return chain
    const next = chain.slice()
    for (let i = 0; i < node.pathless.length; i++) next.push(node.pathless[i]!)
    return next
  }

  const stack: WalkFrame[] = [
    {
      node: tree.root,
      index: 0,
      params: Object.create(null),
      chain: applyPathless(
        tree.root,
        tree.root.route ? [tree.root.route] : [],
      ),
    },
  ]

  let best: WalkFrame | null = null

  while (stack.length) {
    const frame = stack.pop()!
    const { node, index } = frame

    const withPathless = (next: WalkFrame): WalkFrame => {
      return { ...next, chain: applyPathless(next.node, next.chain) }
    }

    if (index === decoded.length) {
      const terminal = withPathless(frame)
      if (terminal.node.indexRoute) {
        terminal.chain.push(terminal.node.indexRoute)
      } else if (terminal.node.route && terminal.node.route !== tree.root.route) {
        if (terminal.chain[terminal.chain.length - 1] !== terminal.node.route) {
          terminal.chain.push(terminal.node.route)
        }
      }
      if (
        !best ||
        terminal.chain.length > best.chain.length ||
        (terminal.node.indexRoute && !best.node.indexRoute)
      ) {
        best = terminal
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
      const restRaw: string[] = []
      const restDec: string[] = []
      for (let i = index; i < segments.length; i++) {
        restRaw.push(segments[i]!)
        restDec.push(decoded[i]!)
      }
      params._splat = restDec.join('/')
      params['*'] = params._splat
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

    if (node.paramChild) {
      const params = Object.assign(Object.create(null), frame.params)
      params[node.paramName] = value
      const chain = frame.chain.slice()
      if (node.paramChild.route) chain.push(node.paramChild.route)
      stack.push(
        withPathless({
          node: node.paramChild,
          index: index + 1,
          params,
          chain,
        }),
      )
    }

    const staticChild = node.staticChildren?.get(key) ??
      (caseSensitive ? undefined : node.staticChildren?.get(raw.toLowerCase()))
    if (staticChild) {
      const chain = frame.chain.slice()
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

  const seen = new Set<string>()
  const matches: RouteMatchResult[] = []
  for (let i = 0; i < best.chain.length; i++) {
    const route = best.chain[i]!
    if (seen.has(route.id)) continue
    seen.add(route.id)
    matches.push({
      route,
      params: best.params,
      rawParams: best.params,
    })
  }
  return matches
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
    // legacy (tree, from, pathname) call
    return null
  }
  const path = pathname ?? ''
  const params: Record<string, string> = Object.create(null)
  const pathSegs = splitSegments(path === '/' ? '' : path)

  let si = 0
  let segment: ParsedSegment | undefined
  const fullPattern = pattern.charCodeAt(0) === 47 ? pattern.slice(1) : pattern

  // Re-parse from the original pattern string to keep prefix/suffix info
  let cursor = 0
  const parts: { kind: number; raw: string; name: string; prefix: string; suffix: string }[] = []
  while (cursor < fullPattern.length) {
    const start = cursor
    segment = parseSegment(fullPattern, start, segment)
    const end = segment[5]
    cursor = end + 1
    if (start === end) continue
    const kind = segment[0]
    parts.push({
      kind,
      raw: fullPattern.substring(start, end),
      name: fullPattern.substring(segment[2], segment[3]),
      prefix: fullPattern.substring(start, segment[1]),
      suffix: fullPattern.substring(segment[4], end),
    })
  }

  const norm = (s: string) => (caseSensitive ? s : s.toLowerCase())

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!
    if (part.kind === SEGMENT_TYPE_WILDCARD) {
      params._splat = pathSegs.slice(si).join('/')
      params['*'] = params._splat
      si = pathSegs.length
      break
    }
    if (part.kind === SEGMENT_TYPE_OPTIONAL_PARAM) {
      if (si < pathSegs.length) {
        params[part.name] = decodeSeg(pathSegs[si]!)
        si++
      }
      continue
    }
    if (si >= pathSegs.length) {
      if (fuzzy) break
      return null
    }
    const value = pathSegs[si]!
    if (part.kind === SEGMENT_TYPE_PATHNAME) {
      if (norm(value) !== norm(part.raw)) return null
    } else if (part.kind === SEGMENT_TYPE_PARAM) {
      const decoded = decodeSeg(value)
      if (part.prefix && !decoded.startsWith(part.prefix)) return null
      if (part.suffix && !decoded.endsWith(part.suffix)) return null
      let inner = decoded
      if (part.prefix) inner = inner.slice(part.prefix.length)
      if (part.suffix) inner = inner.slice(0, inner.length - part.suffix.length)
      params[part.name] = inner
    }
    si++
  }

  if (!fuzzy && si !== pathSegs.length) return null
  return { rawParams: params, params }
}

function decodeSeg(value: string) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export function findFlatMatch(
  tree: ProcessedTree,
  from: string,
): AnyRouteLike | undefined {
  return tree.routesById[from] ?? tree.routesByPath[from]
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

export function processRouteMasks() {
  return []
}

export function trimPathRight(path: string) {
  const len = path.length
  return len > 1 && path.charCodeAt(len - 1) === 47 ? path.slice(0, -1) : path
}
