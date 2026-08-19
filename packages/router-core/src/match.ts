import { trimPathRight } from './path'
import {
  parseSegment,
  SEGMENT_TYPE_OPTIONAL_PARAM,
  SEGMENT_TYPE_PARAM,
  SEGMENT_TYPE_PATHNAME,
  SEGMENT_TYPE_WILDCARD,
} from './parse-segment'
import type { ParsedSegment, SegmentKind } from './parse-segment'

export {
  parseSegment,
  SEGMENT_TYPE_OPTIONAL_PARAM,
  SEGMENT_TYPE_PARAM,
  SEGMENT_TYPE_PATHNAME,
  SEGMENT_TYPE_WILDCARD,
}
export type { SegmentKind }

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
  paramChildren: SegmentNode[] | null
  optionalChildren: SegmentNode[] | null
  wildcardChildren: SegmentNode[] | null
  pathless: AnyRouteLike[] | null
  route: AnyRouteLike | null
  indexRoute: AnyRouteLike | null
  parse?: ((params: Record<string, string>) => unknown) | null
  priority?: number
  prefix?: string
  suffix?: string
  affixCaseSensitive?: boolean
  paramName?: string
  optionalName?: string
}

function createNode(): SegmentNode {
  return {
    staticChildren: null,
    staticSensitiveChildren: null,
    paramChildren: null,
    optionalChildren: null,
    wildcardChildren: null,
    pathless: null,
    route: null,
    indexRoute: null,
  }
}

function findWildcard(node: SegmentNode, prefix: string, suffix: string) {
  const children = node.wildcardChildren
  if (!children) return undefined
  for (let i = 0; i < children.length; i++) {
    const child = children[i]!
    if (child.prefix === prefix && child.suffix === suffix) return child
  }
}

function getOrCreateWildcard(
  node: SegmentNode,
  prefix: string,
  suffix: string,
  caseSensitive: boolean | undefined,
) {
  const children = node.wildcardChildren ?? (node.wildcardChildren = [])
  for (let i = 0; i < children.length; i++) {
    const child = children[i]!
    if (
      child.prefix === prefix &&
      child.suffix === suffix &&
      child.affixCaseSensitive === caseSensitive
    ) {
      return child
    }
  }
  const child = createNode()
  child.prefix = prefix
  child.suffix = suffix
  child.affixCaseSensitive = caseSensitive
  children.push(child)
  return child
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

function findNamedAffix(
  children: SegmentNode[] | null,
  nameKey: 'paramName' | 'optionalName',
  name: string,
  prefix: string,
  suffix: string,
): SegmentNode | undefined {
  if (!children) return
  for (let i = 0; i < children.length; i++) {
    const child = children[i]!
    if (child[nameKey] === name && child.prefix === prefix && child.suffix === suffix) {
      return child
    }
  }
}

function getOrCreateParam(
  node: SegmentNode,
  name: string,
  prefix: string,
  suffix: string,
  parse: SegmentNode['parse'],
  priority: number,
  affixCaseSensitive: boolean | undefined,
): SegmentNode {
  const existing = findNamedAffix(node.paramChildren, 'paramName', name, prefix, suffix)
  if (existing) {
    if (affixCaseSensitive !== undefined) existing.affixCaseSensitive = affixCaseSensitive
    return existing
  }
  const next = createNode()
  next.parse = parse
  next.priority = priority
  next.paramName = name
  next.prefix = prefix
  next.suffix = suffix
  next.affixCaseSensitive = affixCaseSensitive
  ;(node.paramChildren ??= []).push(next)
  return next
}

function getOrCreateOptional(
  node: SegmentNode,
  name: string,
  prefix: string,
  suffix: string,
  affixCaseSensitive: boolean | undefined,
) {
  const existing = findNamedAffix(node.optionalChildren, 'optionalName', name, prefix, suffix)
  if (existing) {
    if (affixCaseSensitive !== undefined) existing.affixCaseSensitive = affixCaseSensitive
    return existing
  }
  const next = createNode()
  next.optionalName = name
  next.prefix = prefix
  next.suffix = suffix
  next.affixCaseSensitive = affixCaseSensitive
  ;(node.optionalChildren ??= []).push(next)
  optionalNamesThisTree.push(name || '')
  return next
}

function finalizeKids(list: SegmentNode[] | Record<string, SegmentNode> | null) {
  if (!list) return
  if (Array.isArray(list)) {
    for (let i = 0; i < list.length; i++) finalizeParamChildren(list[i]!)
    return
  }
  for (const key in list) finalizeParamChildren(list[key]!)
}

function finalizeParamChildren(node: SegmentNode): void {
  const params = node.paramChildren
  if (params && params.length > 1) params.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
  finalizeKids(params)
  finalizeKids(node.staticChildren)
  finalizeKids(node.staticSensitiveChildren)
  finalizeKids(node.optionalChildren)
  finalizeKids(node.wildcardChildren)
}

export type ProcessedTree = {
  root: SegmentNode
  routesById: Record<string, AnyRouteLike>
  routesByPath: Record<string, AnyRouteLike>
  flatRoutes: AnyRouteLike[]
  segmentTree?: any
  singleCache?: any
  segmentMatchCache?: any
  flatCache?: any
  masks?: Array<{ from: string; [key: string]: any }>
  masksTree?: any
  /** True if any route has validateSearch or search middlewares. */
  hasSearchWork?: boolean
  /** Optional param names in insert order, used to prefer left-filled matches. */
  optionalNames?: string[]
  /** Last default exact findRouteMatch pathname. */
  pathname?: string
  /** Last default exact findRouteMatch result. */
  matches?: RouteMatchResult[] | null
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

function countSegments(path: string): number {
  let count = 0
  let inSegment = false
  for (let i = 0; i < path.length; i++) {
    if (path.charCodeAt(i) === 47) {
      inSegment = false
    } else if (!inSegment) {
      inSegment = true
      count++
    }
  }
  return count
}

function walkPath(node: SegmentNode, path: string, caseSensitive: boolean, route?: AnyRouteLike) {
  let cursor = 0
  let current = node
  let segment: ParsedSegment | undefined
  const trimmed = path.charCodeAt(0) === 47 ? path.slice(1) : path
  // A route only declares the trailing segments of its full path; the leading ones
  // belong to ancestors, so an override must not touch their affix nodes.
  const routeCaseSensitive = route?.options?.caseSensitive
  // Resolved on the first affix-bearing segment, since static paths never need it.
  let ownedFrom = -1
  let segmentIndex = -1

  while (cursor < trimmed.length) {
    const start = cursor
    segment = parseSegment(trimmed, start, segment)
    const end = segment[5]
    cursor = end + 1
    if (start === end) continue
    segmentIndex++

    const kind = segment[0]
    if (kind === SEGMENT_TYPE_PATHNAME) {
      let key = trimmed.substring(start, end)
      if (!caseSensitive) key = key.toLowerCase()
      current = getOrCreateStatic(current, key, caseSensitive)
      continue
    }

    if (ownedFrom === -1) ownedFrom = countSegments(findNearestAncestorPath(route?.parentRoute))
    const owned = segmentIndex >= ownedFrom
    const affixCaseSensitive = owned ? routeCaseSensitive : undefined

    if (kind === SEGMENT_TYPE_PARAM) {
      current = getOrCreateParam(
        current,
        trimmed.substring(segment[2], segment[3]),
        trimmed.substring(start, segment[1]),
        trimmed.substring(segment[4], end),
        route?.options?.params?.parse ?? route?.options?.parseParams ?? null,
        route?.options?.params?.priority ?? 0,
        affixCaseSensitive,
      )
    } else if (kind === SEGMENT_TYPE_OPTIONAL_PARAM) {
      current = getOrCreateOptional(
        current,
        trimmed.substring(segment[2], segment[3]),
        trimmed.substring(start, segment[1]),
        trimmed.substring(segment[4], end),
        affixCaseSensitive,
      )
    } else if (kind === SEGMENT_TYPE_WILDCARD) {
      const prefix = trimmed.substring(start, segment[1])
      const suffix = trimmed.substring(segment[4], end)
      // Index, pathless, and child inserts walk an ancestor's wildcard again, and a
      // splat swallows their extra segments, so only the declaring route may create
      // or write. Unowned walks reuse the existing sibling shape.
      if (owned) {
        current = getOrCreateWildcard(current, prefix, suffix, affixCaseSensitive)
      } else {
        current =
          findWildcard(current, prefix, suffix) ??
          getOrCreateWildcard(current, prefix, suffix, affixCaseSensitive)
      }
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
  optionalNamesThisTree = []
  for (let i = 0; i < flatRoutes.length; i++) {
    const route = flatRoutes[i]!
    if (route === routeTree || route.isRoot) continue
    insertRoute(root, route, route.options?.caseSensitive ?? caseSensitive)
  }
  finalizeParamChildren(root)

  let hasSearchWork = false
  for (const id in routesById) {
    const options = routesById[id]?.options
    if (options?.search?.middlewares?.length || options?.validateSearch) {
      hasSearchWork = true
      break
    }
  }

  const processedTree = {
    root,
    routesById,
    routesByPath,
    flatRoutes,
    hasSearchWork,
    optionalNames: optionalNamesThisTree.slice(),
  } as ProcessedTree

  return { ...processedTree, processedTree }
}

export type RouteMatchResult = {
  route: AnyRouteLike
  params: Record<string, string>
  rawParams: Record<string, string>
}

const EMPTY_PARAMS: Record<string, string> = Object.freeze(Object.create(null))

function decodeParamSegment(raw: string): string | undefined {
  if (raw.indexOf('%') === -1) return raw
  try {
    return decodeURIComponent(raw)
  } catch {
    return undefined
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
  rawParams?: Record<string, string>
  chain: AnyRouteLike[]
  depth: number
  parsed: number
  statics: number
  staticPattern: string
  required: number
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

export function findRouteMatch(
  tree: ProcessedTree,
  pathname: string,
  caseSensitive = false,
  fuzzy = false,
): RouteMatchResult[] | null {
  if (!fuzzy && !caseSensitive && tree.pathname === pathname) return tree.matches!
  const result = findRouteMatchDynamic(tree, pathname, caseSensitive, fuzzy)
  if (!fuzzy && !caseSensitive) {
    tree.pathname = pathname
    tree.matches = result
  }
  return result
}

export { findRouteMatch as findRouteMatchFromTree }

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
  if (candidate.staticPattern !== best.staticPattern) {
    return candidate.staticPattern > best.staticPattern
  }
  if (candidate.required !== best.required) return candidate.required > best.required
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

function descend(
  frame: WalkFrame,
  node: SegmentNode,
  index: number,
  params: Record<string, string>,
  chain: AnyRouteLike[],
  statics: number,
  staticPattern: string,
  required: number,
  affix: number,
) {
  return withPathless({
    node,
    index,
    params,
    chain,
    depth: frame.depth + 1,
    parsed: frame.parsed,
    statics,
    staticPattern,
    required,
    affix,
  })
}

function pushNamedChild(
  stack: WalkFrame[],
  frame: WalkFrame,
  child: SegmentNode,
  index: number,
  params: Record<string, string>,
  staticPattern: string,
  required: number,
  affix: number,
) {
  const chain = frame.chain.slice()
  if (child.route) chain.push(child.route)
  stack.push(
    descend(frame, child, index, params, chain, frame.statics, staticPattern, required, affix),
  )
}

function pushStaticFrame(
  stack: WalkFrame[],
  frame: WalkFrame,
  index: number,
  child: SegmentNode,
  shareChain: boolean,
) {
  const chain = shareChain ? frame.chain : frame.chain.slice()
  if (child.route) chain.push(child.route)
  stack.push(
    descend(
      frame,
      child,
      index + 1,
      frame.params,
      chain,
      frame.statics + 1,
      `${frame.staticPattern}1`,
      frame.required,
      frame.affix,
    ),
  )
}

// Only an unaffixed wildcard can consume zero remaining segments, and any
// sibling shape may hold it, so every stored pattern has to be inspected.
function hasEmptySplatWildcard(node: SegmentNode): boolean {
  const wildcards = node.wildcardChildren
  if (!wildcards) return false
  for (let i = 0; i < wildcards.length; i++) {
    const child = wildcards[i]!
    if (!child.prefix && !child.suffix) return true
  }
  return false
}

function considerEmptySplat(
  terminal: WalkFrame,
  best: WalkFrame | null,
  baseChain: AnyRouteLike[],
): WalkFrame | null {
  const wildcards = terminal.node.wildcardChildren
  if (!wildcards) return best
  for (let w = 0; w < wildcards.length; w++) {
    const wildcard = wildcards[w]!
    if (wildcard.prefix || wildcard.suffix) continue
    // The terminal frame may already hold parsed params from its own route, so
    // the fallback restarts from the raw values and lets the parsers rerun.
    const params = Object.assign(Object.create(null), terminal.rawParams ?? terminal.params)
    params._splat = ''
    params['*'] = ''
    const wild = {
      ...terminal,
      node: wildcard,
      params,
      rawParams: undefined,
      chain: wildcard.route ? baseChain.concat(wildcard.route) : baseChain.slice(),
      depth: terminal.depth + 1,
    }
    if (applyParamsParse(wild)) {
      wild.parsed = parsedScore(wild)
      if (isBetterMatch(best, wild)) best = wild
    }
  }
  return best
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
    } else if (hasEmptySplatWildcard(terminal.node)) {
      best = considerEmptySplat(terminal, best, terminal.chain)
    }
  } else {
    let candidate = terminal
    if (terminal.node.route && terminal.node.route !== rootRoute) {
      if (terminal.chain[terminal.chain.length - 1] !== terminal.node.route) {
        candidate = {
          ...terminal,
          chain: terminal.chain.concat(terminal.node.route),
        }
      }
    }
    // Intermediate optional nodes have no route of their own. Accepting them
    // lets `/{ -$locale}/$rooms` treat `/chambres` as a filled locale and win
    // over the real required-param match.
    if (terminal.node.route && applyParamsParse(candidate)) {
      candidate.parsed = parsedScore(candidate)
      if (isBetterMatch(best, candidate)) best = candidate
    }
    if (hasEmptySplatWildcard(terminal.node)) {
      best = considerEmptySplat(
        terminal,
        best,
        terminal.chain.filter((route) => route !== terminal.node.route),
      )
    }
  }
  const optionals = terminal.node.optionalChildren
  if (!optionals) return best
  for (let o = 0; o < optionals.length; o++) {
    const child = optionals[o]!
    stack.push(
      descend(
        terminal,
        child,
        frame.index,
        terminal.params,
        terminal.chain.slice(),
        terminal.statics,
        terminal.staticPattern,
        terminal.required,
        terminal.affix,
      ),
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
  const invalid: boolean[] = new Array(segments.length)
  for (let i = 0; i < segments.length; i++) {
    const segment = decodeParamSegment(segments[i]!)
    invalid[i] = segment === undefined
    decoded[i] = segment ?? segments[i]!
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
      staticPattern: '',
      required: 0,
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
    if (
      fuzzy &&
      index < decodedLength &&
      frame.node.route &&
      frame.node.route !== rootRoute &&
      isBetterMatch(bestFuzzy, frame)
    ) {
      bestFuzzy = frame
    }

    if (index === decoded.length) {
      best = considerTerminal(frame, stack, best, rootRoute)
      continue
    }

    const raw = segments[index]!
    const value = decoded[index]!

    const wildcards = node.wildcardChildren
    if (wildcards) {
      for (let w = 0; w < wildcards.length; w++) {
        const wildcard = wildcards[w]!
        const prefix = wildcard.prefix || ''
        const suffix = wildcard.suffix || ''
        const wildcardCaseSensitive = wildcard.affixCaseSensitive ?? caseSensitive
        const first = decoded[index]!
        const lastSeg = decoded[decoded.length - 1]!
        const prefixOk =
          !prefix ||
          (wildcardCaseSensitive
            ? first.startsWith(prefix)
            : first.toLowerCase().startsWith(prefix.toLowerCase()))
        const suffixOk =
          !suffix ||
          (wildcardCaseSensitive
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
          pushNamedChild(
            stack,
            frame,
            wildcard,
            segments.length,
            params,
            frame.staticPattern.padEnd(segments.length, '0'),
            frame.required,
            frame.affix + prefix.length + suffix.length,
          )
        }
      }
    }

    const optionals = node.optionalChildren
    if (optionals) {
      for (let o = 0; o < optionals.length; o++) {
        const child = optionals[o]!
        const name = child.optionalName || ''
        const inner = invalid[index]
          ? null
          : extractPrefixed(
              value,
              child.prefix || '',
              child.suffix || '',
              child.affixCaseSensitive ?? caseSensitive,
            )
        if (inner !== null) {
          const params = Object.assign(Object.create(null), frame.params)
          if (inner) params[name] = inner
          pushNamedChild(
            stack,
            frame,
            child,
            index + 1,
            params,
            `${frame.staticPattern}0`,
            frame.required,
            frame.affix + (child.prefix?.length ?? 0) + (child.suffix?.length ?? 0),
          )
        }
        stack.push(
          descend(
            frame,
            child,
            index,
            frame.params,
            frame.chain.slice(),
            frame.statics,
            frame.staticPattern,
            frame.required,
            frame.affix,
          ),
        )
      }
    }

    const paramKids = node.paramChildren
    if (paramKids) {
      for (let p = paramKids.length - 1; p >= 0; p--) {
        const child = paramKids[p]!
        if (invalid[index]) continue
        const inner = extractPrefixed(
          value,
          child.prefix || '',
          child.suffix || '',
          child.affixCaseSensitive ?? caseSensitive,
        )
        if (!inner) continue
        const params = Object.assign(Object.create(null), frame.params)
        params[child.paramName || ''] = inner
        pushNamedChild(
          stack,
          frame,
          child,
          index + 1,
          params,
          `${frame.staticPattern}0`,
          frame.required + 1,
          frame.affix + (child.prefix?.length ?? 0) + (child.suffix?.length ?? 0),
        )
      }
    }

    // Insensitive keys were stored lowercased and sensitive keys kept their
    // original case, so the sensitivity of the route decides the lookup key,
    // not the sensitivity asked for by the caller.
    const insensitiveKids = node.staticChildren
    let insensitiveChild: SegmentNode | undefined
    if (insensitiveKids) {
      insensitiveChild =
        insensitiveKids[value.toLowerCase()] ??
        (raw === value ? undefined : insensitiveKids[raw.toLowerCase()])
    }
    const sensitiveKids = node.staticSensitiveChildren
    let sensitiveChild: SegmentNode | undefined
    if (sensitiveKids) {
      sensitiveChild = sensitiveKids[value] ?? (raw === value ? undefined : sensitiveKids[raw])
    }

    if (insensitiveChild || sensitiveChild) {
      // Reusing the parent chain is only safe when this node pushes a single
      // frame. Two static candidates would otherwise append to one array.
      const shareChain =
        !(insensitiveChild && sensitiveChild) &&
        !node.wildcardChildren?.length &&
        !node.optionalChildren?.length &&
        !node.paramChildren?.length
      if (insensitiveChild) pushStaticFrame(stack, frame, index, insensitiveChild, shareChain)
      // Pushed last so the exact sensitive branch is explored first and wins ties.
      if (sensitiveChild) pushStaticFrame(stack, frame, index, sensitiveChild, shareChain)
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

function getPatternTree(pattern: string, caseSensitive: boolean) {
  const child: AnyRouteLike = {
    id: pattern,
    fullPath: pattern,
    path: pattern,
    options: { path: pattern, caseSensitive },
  }
  const root: AnyRouteLike = {
    id: '__root__',
    fullPath: '/',
    isRoot: true,
    options: {},
    children: [child],
  }
  child.parentRoute = root
  return processRouteTree(root, caseSensitive)
}

/**
 * Match a path pattern against a pathname by compiling the pattern into the
 * same segment tree the router already walks.
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
  const dest = pattern || '/'
  const path = pathname || '/'
  if (dest === '/') {
    return fuzzy || trimPathRight(path) === '/'
      ? { rawParams: EMPTY_PARAMS, params: EMPTY_PARAMS }
      : null
  }
  const matches = findRouteMatch(getPatternTree(dest, caseSensitive), path, caseSensitive, fuzzy)
  const last = matches?.[matches.length - 1]
  if (!last || last.route.isRoot) return null
  return { rawParams: last.rawParams, params: last.params }
}

export function findFlatMatch(
  treeOrPath: ProcessedTree | string,
  fromOrTree?: string | ProcessedTree,
): any {
  if (typeof treeOrPath === 'string') {
    const tree = fromOrTree as ProcessedTree | undefined
    if (!tree) return undefined
    const masks = tree.masks
    const matches = findRouteMatchFromTree(tree, treeOrPath)
    if (!matches?.length) return null
    const last = matches[matches.length - 1]!
    if (masks?.length) {
      const full = last.route.fullPath
      const id = last.route.id
      for (let i = 0; i < masks.length; i++) {
        const mask = masks[i]!
        if (mask.from === full || mask.from === id) {
          return { route: mask, rawParams: last.rawParams }
        }
      }
      return null
    }
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

export { trimPathRight }
