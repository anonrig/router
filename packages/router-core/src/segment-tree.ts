import {
  parseSegment,
  SEGMENT_TYPE_OPTIONAL_PARAM,
  SEGMENT_TYPE_PARAM,
  SEGMENT_TYPE_PATHNAME,
  SEGMENT_TYPE_WILDCARD,
} from './parse-segment'
import type { LRUCache } from './utils'

const SEGMENT_TYPE_INDEX = 4
const SEGMENT_TYPE_PATHLESS = 5

export type SegmentTreeRoute = {
  id?: string
  path?: string
  fullPath?: string
  from?: string
  options?: Record<string, any>
  children?: Array<SegmentTreeRoute> | Record<string, SegmentTreeRoute>
  isRoot?: boolean
  parentRoute?: SegmentTreeRoute
}

export type SegmentTreeNode = {
  kind: number
  pathless: SegmentTreeNode[] | null
  index: SegmentTreeNode | null
  static: Map<string, SegmentTreeNode> | null
  staticInsensitive: Map<string, SegmentTreeNode> | null
  dynamic: SegmentTreeNode[] | null
  optional: SegmentTreeNode[] | null
  wildcard: SegmentTreeNode[] | null
  route: SegmentTreeRoute | null
  fullPath: string
  parent: SegmentTreeNode | null
  depth: number
  parse: null | ((params: Record<string, string>) => unknown)
  priority: number
  caseSensitive?: boolean
  prefix?: string
  suffix?: string
}

export type SegmentMatch = {
  route: SegmentTreeRoute
  rawParams: Record<string, string>
  params?: Record<string, string>
  branch?: SegmentTreeRoute[]
}

function last<T>(arr: readonly T[]) {
  return arr[arr.length - 1]
}

function routeChildren(route: SegmentTreeRoute): SegmentTreeRoute[] {
  const kids = route.children
  if (!kids) return []
  return Array.isArray(kids) ? kids : Object.values(kids)
}

function createStaticNode(fullPath: string): SegmentTreeNode {
  return {
    kind: SEGMENT_TYPE_PATHNAME,
    depth: 0,
    pathless: null,
    index: null,
    static: null,
    staticInsensitive: null,
    dynamic: null,
    optional: null,
    wildcard: null,
    route: null,
    fullPath,
    parent: null,
    parse: null,
    priority: 0,
  }
}

function createDynamicNode(
  kind: number,
  fullPath: string,
  caseSensitive: boolean,
  prefix?: string,
  suffix?: string,
): SegmentTreeNode {
  return {
    kind,
    depth: 0,
    pathless: null,
    index: null,
    static: null,
    staticInsensitive: null,
    dynamic: null,
    optional: null,
    wildcard: null,
    route: null,
    fullPath,
    parent: null,
    parse: null,
    priority: 0,
    caseSensitive,
    prefix,
    suffix,
  }
}

function sortDynamic(a: SegmentTreeNode, b: SegmentTreeNode) {
  if (a.parse && !b.parse) return -1
  if (!a.parse && b.parse) return 1
  if (a.parse && b.parse && (a.priority || b.priority)) return b.priority - a.priority
  if (a.prefix && b.prefix && a.prefix !== b.prefix) {
    if (a.prefix.startsWith(b.prefix)) return -1
    if (b.prefix.startsWith(a.prefix)) return 1
  }
  if (a.suffix && b.suffix && a.suffix !== b.suffix) {
    if (a.suffix.endsWith(b.suffix)) return -1
    if (b.suffix.endsWith(a.suffix)) return 1
  }
  if (a.prefix && !b.prefix) return -1
  if (!a.prefix && b.prefix) return 1
  if (a.suffix && !b.suffix) return -1
  if (!a.suffix && b.suffix) return 1
  if (a.caseSensitive && !b.caseSensitive) return -1
  if (!a.caseSensitive && b.caseSensitive) return 1
  return 0
}

function parseSegments(
  defaultCaseSensitive: boolean,
  data: Uint16Array,
  route: SegmentTreeRoute,
  start: number,
  node: SegmentTreeNode,
  depth: number,
  dynamicListsToSort?: SegmentTreeNode[][],
  onRoute?: (route: SegmentTreeRoute) => void,
) {
  onRoute?.(route)
  let cursor = start
  {
    const path = route.fullPath ?? route.from ?? ''
    const options = route.options
    const length = path.length
    const caseSensitive = options?.caseSensitive ?? defaultCaseSensitive
    const parseParams = options?.params?.parse ?? options?.parseParams
    while (cursor < length) {
      const segment = parseSegment(path, cursor, data)
      let nextNode: SegmentTreeNode
      const segStart = cursor
      const end = segment[5]
      cursor = end + 1
      depth++
      const kind = segment[0]
      switch (kind) {
        case SEGMENT_TYPE_PATHNAME: {
          const value = path.substring(segment[2], segment[3])
          let name = value
          let staticChildren: Map<string, SegmentTreeNode>
          if (caseSensitive) {
            staticChildren = node.static ??= new Map()
          } else {
            name = value.toLowerCase()
            staticChildren = node.staticInsensitive ??= new Map()
          }
          const existingNode = staticChildren.get(name)
          if (existingNode) {
            nextNode = existingNode
          } else {
            const next = createStaticNode(path)
            next.parent = node
            next.depth = depth
            nextNode = next
            staticChildren.set(name, next)
          }
          break
        }
        case SEGMENT_TYPE_PARAM:
        case SEGMENT_TYPE_OPTIONAL_PARAM:
        case SEGMENT_TYPE_WILDCARD: {
          const prefix_raw = path.substring(segStart, segment[1])
          const suffix_raw = path.substring(segment[4], end)
          const actuallyCaseSensitive = caseSensitive && !!(prefix_raw || suffix_raw)
          const prefix = !prefix_raw
            ? undefined
            : actuallyCaseSensitive
              ? prefix_raw
              : prefix_raw.toLowerCase()
          const suffix = !suffix_raw
            ? undefined
            : actuallyCaseSensitive
              ? suffix_raw
              : suffix_raw.toLowerCase()
          const siblings =
            kind === SEGMENT_TYPE_PARAM
              ? node.dynamic
              : kind === SEGMENT_TYPE_OPTIONAL_PARAM
                ? node.optional
                : node.wildcard
          const existingNode =
            kind !== SEGMENT_TYPE_WILDCARD &&
            !parseParams &&
            siblings?.find(
              (s) =>
                !s.parse &&
                s.caseSensitive === actuallyCaseSensitive &&
                s.prefix === prefix &&
                s.suffix === suffix,
            )
          if (existingNode) {
            nextNode = existingNode
          } else {
            const next = createDynamicNode(kind, path, actuallyCaseSensitive, prefix, suffix)
            nextNode = next
            next.parent = node
            next.depth = depth
            let nodes: SegmentTreeNode[]
            if (kind === SEGMENT_TYPE_PARAM) {
              nodes = node.dynamic ??= []
            } else if (kind === SEGMENT_TYPE_OPTIONAL_PARAM) {
              nodes = node.optional ??= []
            } else {
              nodes = node.wildcard ??= []
            }
            nodes.push(next)
            if (nodes.length === 2) {
              dynamicListsToSort?.push(nodes)
            }
          }
          break
        }
        default: {
          nextNode = node
        }
      }
      node = nextNode
    }

    if (
      parseParams &&
      route.children &&
      !route.isRoot &&
      route.id &&
      route.id.charCodeAt(route.id.lastIndexOf('/') + 1) === 95
    ) {
      const pathlessNode = createStaticNode(path)
      pathlessNode.kind = SEGMENT_TYPE_PATHLESS
      pathlessNode.parent = node
      depth++
      pathlessNode.depth = depth
      node.pathless ??= []
      node.pathless.push(pathlessNode)
      node = pathlessNode
    }

    const isLeaf = (route.path || !route.children) && !route.isRoot
    if (isLeaf && path.endsWith('/')) {
      const indexNode = createStaticNode(path)
      indexNode.kind = SEGMENT_TYPE_INDEX
      indexNode.parent = node
      depth++
      indexNode.depth = depth
      node.index = indexNode
      node = indexNode
    }

    node.parse = parseParams ?? null
    node.priority = options?.params?.priority ?? 0

    if (isLeaf && !node.route) {
      node.route = route
      node.fullPath = path
    }
  }
  const kids = routeChildren(route)
  for (let i = 0; i < kids.length; i++) {
    parseSegments(
      defaultCaseSensitive,
      data,
      kids[i]!,
      cursor,
      node,
      depth,
      dynamicListsToSort,
      onRoute,
    )
  }
}

export function buildSegmentTree(
  routeTree: SegmentTreeRoute,
  caseSensitive = false,
): SegmentTreeNode {
  const segmentTree = createStaticNode(routeTree.fullPath ?? '/')
  const data = new Uint16Array(6)
  const dynamicListsToSort: SegmentTreeNode[][] = []
  parseSegments(caseSensitive, data, routeTree, 1, segmentTree, 0, dynamicListsToSort)
  for (let i = 0; i < dynamicListsToSort.length; i++) {
    dynamicListsToSort[i]!.sort(sortDynamic)
  }
  return segmentTree
}

export function buildMasksTree(routeList: Array<{ from: string; [key: string]: any }>) {
  const segmentTree = createStaticNode('/')
  const data = new Uint16Array(6)
  const dynamicListsToSort: SegmentTreeNode[][] = []
  for (let i = 0; i < routeList.length; i++) {
    parseSegments(
      false,
      data,
      routeList[i] as SegmentTreeRoute,
      1,
      segmentTree,
      0,
      dynamicListsToSort,
    )
  }
  for (let i = 0; i < dynamicListsToSort.length; i++) {
    dynamicListsToSort[i]!.sort(sortDynamic)
  }
  return segmentTree
}

type ParamExtractionState = {
  part: number
  node: number
  path: number
  segment: number
}

type MatchStackFrame = {
  node: SegmentTreeNode
  index: number
  skipped: bigint
  statics: number
  dynamics: number
  optionals: number
  extract?: ParamExtractionState
  rawParams?: Record<string, string>
}

function buildNodeBranch(node: SegmentTreeNode) {
  const list: SegmentTreeNode[] = Array(node.depth + 1)
  do {
    list[node.depth] = node
    node = node.parent!
  } while (node)
  return list
}

function extractParams(
  path: string,
  parts: string[],
  leaf: {
    node: SegmentTreeNode
    skipped: bigint
    extract?: ParamExtractionState
    rawParams?: Record<string, string>
  },
): [Record<string, string>, ParamExtractionState] {
  const list = buildNodeBranch(leaf.node)
  let nodeParts: string[] | null = null
  const rawParams: Record<string, string> = Object.create(null)
  let partIndex = leaf.extract?.part ?? 0
  let nodeIndex = leaf.extract?.node ?? 0
  let pathIndex = leaf.extract?.path ?? 0
  let segmentCount = leaf.extract?.segment ?? 0
  for (; nodeIndex < list.length; partIndex++, nodeIndex++, pathIndex++, segmentCount++) {
    const node = list[nodeIndex]!
    if (node.kind === SEGMENT_TYPE_INDEX) break
    if (node.kind === SEGMENT_TYPE_PATHLESS) {
      segmentCount--
      partIndex--
      pathIndex--
      continue
    }
    const part = parts[partIndex]
    const currentPathIndex = pathIndex
    if (part) pathIndex += part.length
    if (node.kind === SEGMENT_TYPE_PARAM) {
      nodeParts ??= leaf.node.fullPath.split('/')
      const nodePart = nodeParts[segmentCount]!
      const preLength = node.prefix?.length ?? 0
      const isCurlyBraced = nodePart.charCodeAt(preLength) === 123
      if (isCurlyBraced) {
        const sufLength = node.suffix?.length ?? 0
        const name = nodePart.substring(preLength + 2, nodePart.length - sufLength - 1)
        const value = part!.substring(preLength, part!.length - sufLength)
        rawParams[name] = decodeURIComponent(value)
      } else {
        const name = nodePart.substring(1)
        rawParams[name] = decodeURIComponent(part!)
      }
    } else if (node.kind === SEGMENT_TYPE_OPTIONAL_PARAM) {
      if (leaf.skipped & (1n << BigInt(nodeIndex))) {
        partIndex--
        pathIndex = currentPathIndex - 1
        continue
      }
      nodeParts ??= leaf.node.fullPath.split('/')
      const nodePart = nodeParts[segmentCount]!
      const preLength = node.prefix?.length ?? 0
      const sufLength = node.suffix?.length ?? 0
      const name = nodePart.substring(preLength + 3, nodePart.length - sufLength - 1)
      const value =
        node.suffix || node.prefix ? part!.substring(preLength, part!.length - sufLength) : part
      if (value) rawParams[name] = decodeURIComponent(value)
    } else if (node.kind === SEGMENT_TYPE_WILDCARD) {
      const value = path.substring(
        currentPathIndex + (node.prefix?.length ?? 0),
        path.length - (node.suffix?.length ?? 0),
      )
      const splat = decodeURIComponent(value)
      rawParams['*'] = splat
      rawParams._splat = splat
      break
    }
  }
  if (leaf.rawParams) Object.assign(rawParams, leaf.rawParams)
  return [
    rawParams,
    {
      part: partIndex,
      node: nodeIndex,
      path: pathIndex,
      segment: segmentCount,
    },
  ]
}

function segmentScore(partsLength: number, index: number): number {
  return 2 ** (partsLength - index - 1)
}

function isPerfectStaticMatch(statics: number, partsLength: number): boolean {
  return statics === 2 ** (partsLength - 1) - 1
}

function validateParseParams(path: string, parts: string[], frame: MatchStackFrame) {
  let rawParams: Record<string, string>
  let state: ParamExtractionState
  try {
    ;[rawParams, state] = extractParams(path, parts, frame)
  } catch {
    return null
  }

  frame.rawParams = rawParams
  frame.extract = state

  if (!frame.node.parse) return true

  try {
    if (frame.node.parse(rawParams) === false) return null
  } catch {
    // thrown parsers do not skip the route
  }

  return true
}

function isFrameMoreSpecific(prev: MatchStackFrame | null, next: MatchStackFrame): boolean {
  if (!prev) return true
  return (
    next.statics > prev.statics ||
    (next.statics === prev.statics &&
      (next.dynamics > prev.dynamics ||
        (next.dynamics === prev.dynamics &&
          (next.optionals > prev.optionals ||
            (next.optionals === prev.optionals &&
              ((next.node.kind === SEGMENT_TYPE_INDEX) > (prev.node.kind === SEGMENT_TYPE_INDEX) ||
                ((next.node.kind === SEGMENT_TYPE_INDEX) ===
                  (prev.node.kind === SEGMENT_TYPE_INDEX) &&
                  next.node.depth > prev.node.depth)))))))
  )
}

function getNodeMatch(path: string, parts: string[], segmentTree: SegmentTreeNode, fuzzy: boolean) {
  if (path === '/' && segmentTree.index) {
    return { node: segmentTree.index, skipped: 0n } as Pick<MatchStackFrame, 'node' | 'skipped'>
  }

  const trailingSlash = !last(parts)
  const pathIsIndex = trailingSlash && path !== '/'
  const partsLength = parts.length - (trailingSlash ? 1 : 0)

  const stack: MatchStackFrame[] = [
    {
      node: segmentTree,
      index: 1,
      skipped: 0n,
      statics: 0,
      dynamics: 0,
      optionals: 0,
    },
  ]

  let bestFuzzy: MatchStackFrame | null = null
  let bestMatch: MatchStackFrame | null = null

  while (stack.length) {
    const frame = stack.pop()!
    const { node, index, skipped, statics, dynamics, optionals } = frame
    let { extract, rawParams } = frame

    if (
      node.kind === SEGMENT_TYPE_WILDCARD &&
      node.route &&
      !isFrameMoreSpecific(bestMatch, frame)
    ) {
      continue
    }

    if (node.parse) {
      const result = validateParseParams(path, parts, frame)
      if (!result) continue
      rawParams = frame.rawParams
      extract = frame.extract
    }

    if (
      fuzzy &&
      node.route &&
      node.kind !== SEGMENT_TYPE_INDEX &&
      isFrameMoreSpecific(bestFuzzy, frame)
    ) {
      bestFuzzy = frame
    }

    const isBeyondPath = index === partsLength
    if (isBeyondPath) {
      if (
        node.route &&
        (!pathIsIndex || node.kind === SEGMENT_TYPE_INDEX || node.kind === SEGMENT_TYPE_WILDCARD) &&
        isFrameMoreSpecific(bestMatch, frame)
      ) {
        bestMatch = frame
      }
      if (!node.optional && !node.wildcard && !node.index && !node.pathless) continue
    }

    const part = isBeyondPath ? undefined : parts[index]!
    let lowerPart: string | undefined

    if (isBeyondPath && node.index) {
      const indexFrame: MatchStackFrame = {
        node: node.index,
        index,
        skipped,
        statics,
        dynamics,
        optionals,
        extract,
        rawParams,
      }
      let indexValid = true
      if (node.index.parse) {
        const result = validateParseParams(path, parts, indexFrame)
        if (!result) indexValid = false
      }
      if (indexValid) {
        if (!dynamics && !optionals && !skipped && isPerfectStaticMatch(statics, partsLength)) {
          return indexFrame
        }
        if (isFrameMoreSpecific(bestMatch, indexFrame)) {
          bestMatch = indexFrame
        }
      }
    }

    if (node.wildcard) {
      for (let i = node.wildcard.length - 1; i >= 0; i--) {
        const segment = node.wildcard[i]!
        const { prefix, suffix } = segment
        if (prefix) {
          if (isBeyondPath) continue
          const casePart = segment.caseSensitive ? part : (lowerPart ??= part!.toLowerCase())
          if (!casePart!.startsWith(prefix)) continue
        }
        if (suffix) {
          if (isBeyondPath) continue
          const end = parts.slice(index).join('/').slice(-suffix.length)
          const casePart = segment.caseSensitive ? end : end.toLowerCase()
          if (casePart !== suffix) continue
        }
        stack.push({
          node: segment,
          index: partsLength,
          skipped,
          statics,
          dynamics,
          optionals,
          extract,
          rawParams,
        })
      }
    }

    if (node.optional) {
      const nextSkipped = skipped | (1n << BigInt(node.depth + 1))
      for (let i = node.optional.length - 1; i >= 0; i--) {
        const segment = node.optional[i]!
        stack.push({
          node: segment,
          index,
          skipped: nextSkipped,
          statics,
          dynamics,
          optionals,
          extract,
          rawParams,
        })
      }
      if (!isBeyondPath) {
        for (let i = node.optional.length - 1; i >= 0; i--) {
          const segment = node.optional[i]!
          const { prefix, suffix } = segment
          if (prefix || suffix) {
            const casePart = segment.caseSensitive ? part! : (lowerPart ??= part!.toLowerCase())
            if (prefix && !casePart.startsWith(prefix)) continue
            if (suffix && !casePart.endsWith(suffix)) continue
          }
          stack.push({
            node: segment,
            index: index + 1,
            skipped,
            statics,
            dynamics,
            optionals: optionals + segmentScore(partsLength, index),
            extract,
            rawParams,
          })
        }
      }
    }

    if (!isBeyondPath && node.dynamic && part) {
      for (let i = node.dynamic.length - 1; i >= 0; i--) {
        const segment = node.dynamic[i]!
        const { prefix, suffix } = segment
        if (prefix || suffix) {
          const casePart = segment.caseSensitive ? part : (lowerPart ??= part.toLowerCase())
          if (prefix && !casePart.startsWith(prefix)) continue
          if (suffix && !casePart.endsWith(suffix)) continue
        }
        stack.push({
          node: segment,
          index: index + 1,
          skipped,
          statics,
          dynamics: dynamics + segmentScore(partsLength, index),
          optionals,
          extract,
          rawParams,
        })
      }
    }

    if (!isBeyondPath && node.staticInsensitive) {
      const match = node.staticInsensitive.get((lowerPart ??= part!.toLowerCase()))
      if (match) {
        stack.push({
          node: match,
          index: index + 1,
          skipped,
          statics: statics + segmentScore(partsLength, index),
          dynamics,
          optionals,
          extract,
          rawParams,
        })
      }
    }

    if (!isBeyondPath && node.static) {
      const match = node.static.get(part!)
      if (match) {
        stack.push({
          node: match,
          index: index + 1,
          skipped,
          statics: statics + segmentScore(partsLength, index),
          dynamics,
          optionals,
          extract,
          rawParams,
        })
      }
    }

    if (node.pathless) {
      for (let i = node.pathless.length - 1; i >= 0; i--) {
        const segment = node.pathless[i]!
        stack.push({
          node: segment,
          index,
          skipped,
          statics,
          dynamics,
          optionals,
          extract,
          rawParams,
        })
      }
    }
  }

  if (bestMatch) return bestMatch

  if (fuzzy && bestFuzzy) {
    let sliceIndex = bestFuzzy.index
    for (let i = 0; i < bestFuzzy.index; i++) {
      sliceIndex += parts[i]!.length
    }
    const splat = sliceIndex === path.length ? '/' : path.slice(sliceIndex)
    bestFuzzy.rawParams ??= Object.create(null)
    bestFuzzy.rawParams!['**'] = decodeURIComponent(splat)
    return bestFuzzy
  }

  return null
}

export function findSegmentMatch(
  path: string,
  segmentTree: SegmentTreeNode,
  fuzzy = false,
): SegmentMatch | null {
  const parts = path.split('/')
  const leaf = getNodeMatch(path, parts, segmentTree, fuzzy)
  if (!leaf) return null
  const [rawParams] = extractParams(path, parts, leaf)
  return {
    route: leaf.node.route!,
    rawParams,
  }
}

export function findCachedSegmentMatch(
  path: string,
  segmentTree: SegmentTreeNode,
  fuzzy: boolean,
  cache: LRUCache<string, SegmentMatch | null>,
): SegmentMatch | null {
  const key = fuzzy ? path : `nofuzz\0${path}`
  const cached = cache.get(key)
  if (cached !== undefined) return cached
  const normalized = path || '/'
  let result: SegmentMatch | null
  try {
    result = findSegmentMatch(normalized, segmentTree, fuzzy)
  } catch (err) {
    if (err instanceof URIError) {
      result = null
    } else {
      throw err
    }
  }
  cache.set(key, result)
  return result
}

export function findSingleSegmentMatch(
  from: string,
  caseSensitive: boolean,
  fuzzy: boolean,
  path: string,
  singleCache: LRUCache<string, SegmentTreeNode>,
): SegmentMatch | null {
  from ||= '/'
  path ||= '/'
  const key = caseSensitive ? `case\0${from}` : from
  let tree = singleCache.get(key)
  if (!tree) {
    tree = createStaticNode('/')
    const data = new Uint16Array(6)
    parseSegments(caseSensitive, data, { from } as SegmentTreeRoute, 1, tree, 0)
    singleCache.set(key, tree)
  }
  return findSegmentMatch(path, tree, fuzzy)
}

export function findFlatSegmentMatch(
  path: string,
  masksTree: SegmentTreeNode,
  cache: LRUCache<string, SegmentMatch | null>,
): SegmentMatch | null {
  path ||= '/'
  const cached = cache.get(path)
  if (cached !== undefined) return cached
  const result = findSegmentMatch(path, masksTree)
  cache.set(path, result)
  return result
}
