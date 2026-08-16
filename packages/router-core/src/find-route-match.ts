import type { ProcessedTree, RouteMatchResult } from './match'

export type FindRouteMatchCompatResult = {
  route: RouteMatchResult['route']
  rawParams: RouteMatchResult['rawParams']
  params: RouteMatchResult['params']
  branch: Array<RouteMatchResult['route']>
}

export type FindRouteMatchResult = RouteMatchResult[] | FindRouteMatchCompatResult | null

// `hotPath` starts as a value no real pathname can equal, so the tree compare
// never runs against the empty sentinel (that deopts Maglev compare ICs).
const HOT_MISS = '\0'
export let hotTree: ProcessedTree | undefined
export let hotPath = HOT_MISS
export let hotMatch: RouteMatchResult[] | null = null

type Lookup = (
  treeOrPathname: ProcessedTree | string,
  pathnameOrTree?: string | ProcessedTree,
  flag?: boolean,
) => FindRouteMatchResult

let lookup: Lookup = () => {
  throw new Error('findRouteMatch lookup is not installed')
}

export function setFindRouteMatchLookup(fn: Lookup) {
  lookup = fn
}

export function rememberHotMatch(
  tree: ProcessedTree,
  pathname: string,
  result: RouteMatchResult[] | null,
): RouteMatchResult[] | null {
  hotTree = tree
  hotPath = pathname
  hotMatch = result
  return result
}

export function findRouteMatch(
  tree: ProcessedTree,
  pathname: string,
  caseSensitive?: boolean,
): RouteMatchResult[] | null
export function findRouteMatch(
  pathname: string,
  tree: ProcessedTree,
  fuzzy?: boolean,
): FindRouteMatchCompatResult | null
export function findRouteMatch(
  treeOrPathname: ProcessedTree | string,
  pathnameOrTree?: string | ProcessedTree,
  flag?: boolean,
): FindRouteMatchResult {
  if (pathnameOrTree === hotPath && treeOrPathname === hotTree) return hotMatch!
  return lookup(treeOrPathname, pathnameOrTree, flag)
}
