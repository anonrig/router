import { createLRUCache } from './utils'
import {
  buildRouteBranch,
  processRouteTree as processRouteTreeCore,
  type AnyRouteLike,
  type ProcessedTree,
} from './match'
import {
  buildMasksTree,
  buildSegmentTree,
  findCachedSegmentMatch,
  findFlatSegmentMatch,
  findSingleSegmentMatch,
} from './segment-tree'
import type { SegmentMatch } from './segment-tree'

export {
  parseSegment,
  SEGMENT_TYPE_PATHNAME,
  SEGMENT_TYPE_PARAM,
  SEGMENT_TYPE_WILDCARD,
  SEGMENT_TYPE_OPTIONAL_PARAM,
  buildRouteBranch,
} from './match'
export type {
  SegmentKind,
  ProcessedTree,
  RouteMatchResult,
  AnyRouteLike,
  SegmentNode,
} from './match'

export function processRouteTree<T extends AnyRouteLike>(
  routeTree: T,
  caseSensitive = false,
): ProcessedTree & { processedTree: ProcessedTree } {
  const result = processRouteTreeCore(routeTree, caseSensitive)
  const processedTree = result.processedTree
  if (!processedTree.singleCache) {
    processedTree.singleCache = createLRUCache<string, any>(1000)
    processedTree.segmentMatchCache = createLRUCache<string, SegmentMatch | null>(1000)
  }
  if (!Object.getOwnPropertyDescriptor(processedTree, 'segmentTree')?.get) {
    let segmentTree: ReturnType<typeof buildSegmentTree> | undefined
    const getSegmentTree = () => (segmentTree ??= buildSegmentTree(routeTree, caseSensitive))
    Object.defineProperty(processedTree, 'segmentTree', {
      get: getSegmentTree,
      enumerable: true,
      configurable: true,
    })
    Object.defineProperty(result, 'segmentTree', {
      get: getSegmentTree,
      enumerable: true,
      configurable: true,
    })
  }
  return result
}

export function findRouteMatch(
  pathname: string,
  tree: ProcessedTree,
  fuzzy?: boolean,
): {
  route: AnyRouteLike
  rawParams: Record<string, string>
  params: Record<string, string>
  branch: AnyRouteLike[]
} | null {
  const result = findCachedSegmentMatch(pathname, tree.segmentTree, !!fuzzy, tree.segmentMatchCache)
  if (!result) return null
  const route = result.route as AnyRouteLike
  return {
    route,
    rawParams: result.rawParams,
    params: result.rawParams,
    branch: buildRouteBranch(route),
  }
}

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
  const matched = findSingleSegmentMatch(
    pattern,
    caseSensitive,
    fuzzy,
    pathname ?? '',
    tree.singleCache,
  )
  if (!matched) return null
  return { rawParams: matched.rawParams, params: matched.rawParams }
}

export function findFlatMatch(
  treeOrPath: ProcessedTree | string,
  fromOrTree?: string | ProcessedTree,
): any {
  if (typeof treeOrPath === 'string') {
    const tree = fromOrTree as ProcessedTree | undefined
    if (!tree) return undefined
    if (tree.masksTree && tree.flatCache) {
      return findFlatSegmentMatch(treeOrPath, tree.masksTree, tree.flatCache)
    }
    const match = findRouteMatch(treeOrPath, tree)
    if (!match) return null
    return { route: match.route, rawParams: match.rawParams }
  }
  const from = fromOrTree as string
  const mask = treeOrPath.masks?.find((item) => item.from === from)
  if (mask) return mask as unknown as AnyRouteLike
  return treeOrPath.routesById[from] ?? treeOrPath.routesByPath[from]
}

export function processRouteMasks(
  routeList: Array<{ from: string; [key: string]: any }> = [],
  processedTree?: ProcessedTree,
) {
  if (processedTree) {
    processedTree.masks = routeList
    processedTree.masksTree = buildMasksTree(routeList)
    processedTree.flatCache = createLRUCache<string, SegmentMatch | null>(1000)
  }
  return routeList
}
