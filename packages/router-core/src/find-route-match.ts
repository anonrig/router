export let hotTree: unknown
export let hotPath: unknown
export let hotMatch: unknown

type Lookup = (tree: unknown, path: unknown, flag: unknown) => unknown

let lookup: Lookup = () => {
  throw new Error('findRouteMatch lookup is not installed')
}

export function setFindRouteMatchLookup(fn: Lookup) {
  lookup = fn
}

export function rememberHotMatch(tree: unknown, pathname: unknown, result: unknown) {
  hotTree = tree
  hotPath = pathname
  hotMatch = result
  return result
}

export function findRouteMatch(tree: unknown, path?: unknown, flag?: unknown) {
  if (tree === hotTree && path === hotPath) return hotMatch
  return lookup(tree, path, flag)
}
