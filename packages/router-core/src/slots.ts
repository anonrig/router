import { findRouteMatchFromTree, processRouteTree, type ProcessedTree } from './match'
import { interpolatePath, trimPathRight } from './path'
import { validateSearch } from './router-search'
import { functionalUpdate } from './utils'
import type { AnyRoute } from './route'
import type { ParsedLocation } from './location'
import type { AnyRouteMatch } from './matches'

export const DEFAULT_SLOT_PREFIX = '@'

export type SlotNavigateTo = {
  to?: string
  params?: any
  search?: any
  slots?: Record<string, SlotNavigateDest>
}

export type SlotNavigateDest = SlotNavigateTo | null | false

export type SlotRenderInfo = {
  name: string
  staticData: any
  isOpen: boolean
  path: string | null
  matches: AnyRouteMatch[]
  route: AnyRoute
}

type SlotRoute = AnyRoute & {
  _slotName?: string
  _slotRoot?: boolean
  _slots?: Record<string, SlotRoute>
  _slotTree?: ProcessedTree
}

const noopAbortController = {
  signal: { aborted: false, addEventListener() {}, removeEventListener() {} },
  abort() {},
} as unknown as AbortController

function isSlotKey(key: string, prefix = DEFAULT_SLOT_PREFIX) {
  return key.charCodeAt(0) === prefix.charCodeAt(0)
}

function slotParamKey(names: string[], prefix = DEFAULT_SLOT_PREFIX) {
  return prefix + names.join(prefix)
}

export function readSlotState(
  search: Record<string, any> | undefined,
  names: string[],
  prefix = DEFAULT_SLOT_PREFIX,
) {
  const key = slotParamKey(names, prefix)
  const raw = search?.[key]
  const slotSearch: Record<string, any> = Object.create(null)
  const searchPrefix = `${key}.`
  if (search) {
    for (const name in search) {
      if (name.startsWith(searchPrefix)) {
        slotSearch[name.slice(searchPrefix.length)] = search[name]
      }
    }
  }
  if (raw === false || raw === 'false') {
    return { path: null as string | null, disabled: true, search: slotSearch }
  }
  if (raw == null || raw === true || raw === '') {
    return { path: null as string | null, disabled: false, search: slotSearch }
  }
  return { path: String(raw), disabled: false, search: slotSearch }
}

function clearSlotKeys(search: Record<string, any>, names: string[], prefix = DEFAULT_SLOT_PREFIX) {
  const key = slotParamKey(names, prefix)
  const searchPrefix = `${key}.`
  for (const name of Object.keys(search)) {
    if (name === key || name.startsWith(searchPrefix)) delete search[name]
  }
}

function interpolateSlotPath(path: string, params: any) {
  if (!params || path.indexOf('$') === -1) return path
  return interpolatePath({ path, params }).interpolatedPath
}

export function applySlotsObject(
  search: Record<string, any>,
  slots: Record<string, SlotNavigateDest>,
  prefix = DEFAULT_SLOT_PREFIX,
  names: string[] = [],
) {
  for (const name in slots) {
    const dest = slots[name]
    const nextNames = [...names, name]
    if (dest === null) {
      clearSlotKeys(search, nextNames, prefix)
      continue
    }
    if (dest === false) {
      clearSlotKeys(search, nextNames, prefix)
      search[slotParamKey(nextNames, prefix)] = false
      continue
    }
    if (dest && typeof dest === 'object') {
      if (dest.to != null) {
        const path = interpolateSlotPath(dest.to, dest.params)
        const key = slotParamKey(nextNames, prefix)
        if (!path || path === '/') delete search[key]
        else search[key] = path.charCodeAt(0) === 47 ? path : `/${path}`
      } else if (dest.search == null && dest.slots == null) {
        delete search[slotParamKey(nextNames, prefix)]
      }
      if (dest.search != null) {
        const current = readSlotState(search, nextNames, prefix).search
        const nextSearch = functionalUpdate(dest.search, current)
        const key = slotParamKey(nextNames, prefix)
        const searchPrefix = `${key}.`
        for (const existing of Object.keys(search)) {
          if (existing.startsWith(searchPrefix)) delete search[existing]
        }
        if (nextSearch && typeof nextSearch === 'object') {
          for (const field in nextSearch) {
            const value = nextSearch[field]
            if (value !== undefined) search[`${key}.${field}`] = value
          }
        }
      }
      if (dest.slots) applySlotsObject(search, dest.slots, prefix, nextNames)
    }
  }
}

export function retainSlotSearch(
  currentSearch: Record<string, any>,
  nextSearch: Record<string, any>,
  prefix = DEFAULT_SLOT_PREFIX,
) {
  const result = { ...nextSearch }
  for (const key in currentSearch) {
    if (isSlotKey(key, prefix) && !(key in result)) {
      result[key] = currentSearch[key]
    }
  }
  return result
}

export function parseQualifiedSlotTo(
  to: string,
  routesById?: Record<string, AnyRoute>,
  routesByPath?: Record<string, AnyRoute>,
) {
  const trimmed = trimPathRight(to)
  const route = (routesById?.[trimmed] ??
    routesById?.[to] ??
    routesByPath?.[trimmed] ??
    routesByPath?.[to]) as SlotRoute | undefined
  const parts = trimmed.split('/').filter(Boolean)
  const firstSlot = parts.findIndex((part) => part.charCodeAt(0) === 64)
  if (firstSlot === -1) return undefined
  const names: string[] = []
  const internalParts: string[] = []
  for (let i = firstSlot; i < parts.length; i++) {
    const part = parts[i]!
    if (part.charCodeAt(0) === 64) names.push(part.slice(1))
    else internalParts.push(part)
  }
  if (!names.length) return undefined
  return {
    names,
    internal: internalParts.length ? `/${internalParts.join('/')}` : '/',
    route,
  }
}

export function splitSlotChildren(route: SlotRoute) {
  const kids = route.children
    ? Array.isArray(route.children)
      ? route.children
      : Object.values(route.children)
    : []
  const regular: AnyRoute[] = []
  const slots = { ...(route._slots ?? {}) }
  for (let i = 0; i < kids.length; i++) {
    const child = kids[i] as SlotRoute
    if (child._slotRoot && child._slotName) slots[child._slotName] = child
    else regular.push(child)
    splitSlotChildren(child)
  }
  if (Object.keys(slots).length) {
    route._slots = slots
    route.children = regular as any
  }
  for (const name in slots) splitSlotChildren(slots[name]!)
}

function collectSlotTrees(
  route: SlotRoute,
  out: Array<{ parent: SlotRoute; name: string; slotRoot: SlotRoute }>,
) {
  const slots = route._slots
  if (slots) {
    for (const name in slots) {
      const slotRoot = slots[name]!
      out.push({ parent: route, name, slotRoot })
      collectSlotTrees(slotRoot, out)
    }
  }
  const kids = route.children
    ? Array.isArray(route.children)
      ? route.children
      : Object.values(route.children)
    : []
  for (let i = 0; i < kids.length; i++) collectSlotTrees(kids[i] as SlotRoute, out)
}

export function installSlotTrees(
  routeTree: AnyRoute,
  routesById: Record<string, AnyRoute>,
  routesByPath: Record<string, AnyRoute>,
  caseSensitive: boolean,
) {
  splitSlotChildren(routeTree as SlotRoute)
  const collected: Array<{ parent: SlotRoute; name: string; slotRoot: SlotRoute }> = []
  collectSlotTrees(routeTree as SlotRoute, collected)
  if (!collected.length) return false
  for (const { slotRoot } of collected) {
    const tree = processRouteTree(slotRoot as any, caseSensitive)
    slotRoot._slotTree = tree
    Object.assign(routesById, tree.routesById)
    Object.assign(routesByPath, tree.routesByPath)
  }
  return true
}

function buildSlotMatch(
  router: {
    pathParamsDecoder?: (encoded: string) => string
    options: { context?: any }
  },
  result: { route: any; params: Record<string, string>; rawParams: Record<string, string> },
  search: Record<string, any>,
  parentMatch: AnyRouteMatch | undefined,
  slot: string,
  slotNames: string[],
  index: number,
): AnyRouteMatch {
  const route = result.route as SlotRoute
  let interpolatedPath = route.fullPath || '/'
  if (interpolatedPath.indexOf('$') !== -1) {
    interpolatedPath = interpolatePath({
      path: interpolatedPath,
      params: result.params,
      decoder: router.pathParamsDecoder,
    }).interpolatedPath
  }
  let validated = search
  if (route.options?.validateSearch) {
    try {
      validated = { ...search, ...(validateSearch(route.options.validateSearch, search) ?? {}) }
    } catch {
      validated = search
    }
  }
  return {
    id: route.id + interpolatedPath,
    routeId: route.id,
    index,
    route,
    pathname: interpolatedPath,
    params: { ...(parentMatch?.params ?? {}), ...result.params },
    rawParams: result.rawParams,
    _strictParams: result.params,
    _strictSearch: validated,
    status: route.options?.loader ? 'pending' : 'success',
    isFetching: false,
    error: undefined,
    paramsError: undefined,
    searchError: undefined,
    context: parentMatch?.context ?? router.options.context ?? {},
    search: validated,
    updatedAt: 0,
    abortController: route.options?.loader ? new AbortController() : noopAbortController,
    cause: 'enter',
    loaderDeps: '',
    invalid: false,
    preload: false,
    staticData: route.options?.staticData || {},
    fullPath: route.fullPath,
    slot,
    slotParentId: parentMatch?.routeId,
    slotNames,
  } as AnyRouteMatch
}

export function appendSlotMatches(
  router: {
    pathParamsDecoder?: (encoded: string) => string
    options: { context?: any; slotPrefix?: string; caseSensitive?: boolean }
    routesById: Record<string, AnyRoute>
  },
  location: ParsedLocation,
  mainMatches: AnyRouteMatch[],
): AnyRouteMatch[] {
  const prefix = router.options.slotPrefix ?? DEFAULT_SLOT_PREFIX
  const extra: AnyRouteMatch[] = []
  const seen = new Set<string>()

  const consider = (
    parentRoute: SlotRoute | undefined,
    parentMatch: AnyRouteMatch | undefined,
    names: string[],
  ) => {
    const slots = parentRoute?._slots
    if (!slots) return
    for (const name in slots) {
      const slotRoot = slots[name]!
      const nextNames = [...names, name]
      const seenKey = nextNames.join('\0')
      if (seen.has(seenKey)) continue
      seen.add(seenKey)
      const state = readSlotState(location.search, nextNames, prefix)
      if (state.disabled) continue
      const enabled = slotRoot.options?.enabled
      if (enabled === false) continue
      if (typeof enabled === 'function') {
        const allow = enabled({
          context: parentMatch?.context ?? router.options.context,
          location,
          params: parentMatch?.params,
          search: location.search,
        })
        if (!allow) continue
      }
      const tree = slotRoot._slotTree
      const path = state.path || '/'
      const pathPrefix = slotRoot.fullPath && slotRoot.fullPath !== '/' ? slotRoot.fullPath : ''
      const matchPath =
        path === '/' ? '/' : `${pathPrefix}${path.charCodeAt(0) === 47 ? path : `/${path}`}`
      const found =
        (tree && findRouteMatchFromTree(tree, matchPath, router.options.caseSensitive ?? false)) ||
        (tree && matchPath !== '/'
          ? findRouteMatchFromTree(tree, '/', router.options.caseSensitive ?? false)
          : undefined)
      if (!found?.length) {
        extra.push(
          buildSlotMatch(
            router,
            { route: slotRoot, params: Object.create(null), rawParams: Object.create(null) },
            { ...(parentMatch?.search ?? {}), ...state.search },
            parentMatch,
            name,
            nextNames,
            mainMatches.length + extra.length,
          ),
        )
        consider(slotRoot, extra[extra.length - 1], nextNames)
        continue
      }
      const built: AnyRouteMatch[] = []
      for (let i = 0; i < found.length; i++) {
        const match = buildSlotMatch(
          router,
          found[i]! as any,
          { ...(parentMatch?.search ?? {}), ...state.search },
          i === 0 ? parentMatch : built[i - 1],
          name,
          nextNames,
          mainMatches.length + extra.length + i,
        )
        built.push(match)
        extra.push(match)
      }
      const last = built[built.length - 1]
      consider(last?.route as SlotRoute, last, nextNames)
      consider(slotRoot, built[0], nextNames)
    }
  }

  for (let i = 0; i < mainMatches.length; i++) {
    const match = mainMatches[i]!
    consider(match.route as SlotRoute, match, [])
  }
  return extra.length ? mainMatches.concat(extra) : mainMatches
}

export function listParentSlots(
  route: SlotRoute | undefined,
  matches: AnyRouteMatch[],
  prefix = DEFAULT_SLOT_PREFIX,
): SlotRenderInfo[] {
  const slots = route?._slots
  if (!slots) return []
  const infos: SlotRenderInfo[] = []
  for (const name in slots) {
    const slotRoot = slots[name]!
    const slotMatches = matches.filter(
      (match) => match.slot === name && match.slotParentId === (route as AnyRoute).id,
    )
    infos.push({
      name,
      staticData: slotRoot.options?.staticData,
      isOpen: slotMatches.length > 0,
      path: slotMatches.length ? (slotMatches[slotMatches.length - 1]!.pathname ?? '/') : null,
      matches: slotMatches,
      route: slotRoot,
    })
    void prefix
  }
  return infos
}

export function markSlotRoute(route: any, options: { slot?: string; enabled?: any }) {
  const parentSlot = (route as SlotRoute).parentRoute
    ? ((route as SlotRoute).parentRoute as SlotRoute)._slotName
    : undefined
  const slot = options.slot ?? parentSlot
  const slotRoute = route as SlotRoute
  slotRoute._slotName = slot
  slotRoute._slotRoot = !!options.slot
  if (options.enabled !== undefined) {
    slotRoute.options = { ...slotRoute.options, enabled: options.enabled }
  }
  const originalInit = slotRoute.init.bind(slotRoute)
  slotRoute.init = (opts) => {
    originalInit(opts)
    if (slotRoute._slotRoot && slotRoute._slotName) {
      const parentRoute = slotRoute.parentRoute as SlotRoute | undefined
      const parentPath = !parentRoute || parentRoute.fullPath === '/' ? '' : parentRoute.fullPath
      const fullPath = `${parentPath}/@${slotRoute._slotName}`
      const writable = slotRoute as SlotRoute & { _fullPath: string; _to: string; _id: string }
      writable._fullPath = fullPath
      writable._to = fullPath
      writable._id = fullPath
    }
  }
  return route
}
