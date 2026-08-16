import { findRouteMatchFromTree, processRouteTree, type ProcessedTree } from './match'
import { interpolatePath, trimPathRight } from './path'
import { BaseRoute } from './route'
import { validateSearch } from './router-search'
import { setSlotRuntime } from './router'
import { functionalUpdate } from './utils'
import type { AnyRoute } from './route'
import type { ParsedLocation } from './location'
import type { AnyRouteMatch } from './matches'

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

const EMPTY_PARAMS: Record<string, string> = Object.freeze(Object.create(null))
const noopAbortController = {
  signal: { aborted: false, addEventListener() {}, removeEventListener() {} },
  abort() {},
} as unknown as AbortController

function kids(route: SlotRoute): SlotRoute[] {
  const children = route.children
  return children ? (Array.isArray(children) ? children : Object.values(children)) : []
}

function slotKey(names: string[], prefix: string) {
  return prefix + names.join(prefix)
}

function interpolateSlotPath(path: string, params: any) {
  if (!params || params === true || typeof params === 'function' || path.indexOf('$') === -1) {
    return path
  }
  return interpolatePath({ path, params }).interpolatedPath
}

function readSlotState(search: Record<string, any> | undefined, names: string[], prefix: string) {
  const key = slotKey(names, prefix)
  const raw = search?.[key]
  const slotSearch: Record<string, any> = Object.create(null)
  const searchPrefix = `${key}.`
  if (search) {
    for (const name in search) {
      if (name.startsWith(searchPrefix)) slotSearch[name.slice(searchPrefix.length)] = search[name]
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

function clearSlotKeys(search: Record<string, any>, names: string[], prefix: string) {
  const key = slotKey(names, prefix)
  const nestedPrefix = key + prefix
  const searchPrefix = `${key}.`
  for (const name of Object.keys(search)) {
    if (name === key || name.startsWith(searchPrefix) || name.startsWith(nestedPrefix)) {
      delete search[name]
    }
  }
}

function applySlotsObject(
  search: Record<string, any>,
  slots: Record<string, SlotNavigateDest>,
  prefix: string,
  names: string[] = [],
) {
  for (const name in slots) {
    const dest = slots[name]
    const nextNames = names.length ? [...names, name] : [name]
    if (dest === null) {
      clearSlotKeys(search, nextNames, prefix)
      continue
    }
    if (dest === false) {
      clearSlotKeys(search, nextNames, prefix)
      search[slotKey(nextNames, prefix)] = false
      continue
    }
    if (!dest || typeof dest !== 'object') continue
    const key = slotKey(nextNames, prefix)
    if (dest.to != null) {
      const path = interpolateSlotPath(dest.to, dest.params)
      if (!path || path === '/') delete search[key]
      else search[key] = path.charCodeAt(0) === 47 ? path : `/${path}`
    } else if (dest.search == null && dest.slots == null) {
      delete search[key]
    }
    if (dest.search != null) {
      const nextSearch = functionalUpdate(
        dest.search,
        readSlotState(search, nextNames, prefix).search,
      )
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

function retainSlotSearch(
  currentSearch: Record<string, any>,
  nextSearch: Record<string, any>,
  prefix: string,
) {
  const result = { ...nextSearch }
  for (const key in currentSearch) {
    if (key.startsWith(prefix) && !(key in result)) {
      result[key] = currentSearch[key]
    }
  }
  return result
}

function parseQualifiedSlotTo(to: string) {
  const names: string[] = []
  const internal: string[] = []
  let seen = false
  const parts = trimPathRight(to).split('/')
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    if (!part) continue
    if (part.charCodeAt(0) === 64) {
      seen = true
      names.push(part.slice(1))
    } else if (seen) {
      internal.push(part)
    }
  }
  return names.length
    ? { names, internal: internal.length ? `/${internal.join('/')}` : '/' }
    : undefined
}

export function splitSlotChildren(route: SlotRoute) {
  const regular: SlotRoute[] = []
  const slots = { ...(route._slots ?? {}) }
  for (const child of kids(route)) {
    if (child._slotRoot && child._slotName) slots[child._slotName] = child
    else regular.push(child)
    splitSlotChildren(child)
  }
  if (Object.keys(slots).length) {
    route._slots = slots
    route.children = regular as any
    for (const name in slots) splitSlotChildren(slots[name]!)
  }
}

export function installSlotTrees(
  routeTree: AnyRoute,
  routesById: Record<string, AnyRoute>,
  routesByPath: Record<string, AnyRoute>,
  caseSensitive: boolean,
) {
  splitSlotChildren(routeTree as SlotRoute)
  let found = false
  const walk = (route: SlotRoute) => {
    const slots = route._slots
    if (slots) {
      for (const name in slots) {
        found = true
        const slotRoot = slots[name]!
        const tree = processRouteTree(slotRoot as any, caseSensitive)
        slotRoot._slotTree = tree
        Object.assign(routesById, tree.routesById)
        Object.assign(routesByPath, tree.routesByPath)
        walk(slotRoot)
      }
    }
    for (const child of kids(route)) walk(child)
  }
  walk(routeTree as SlotRoute)
  return found
}

function buildSlotMatch(
  router: { pathParamsDecoder?: (encoded: string) => string; options: { context?: any } },
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
    params: { ...(parentMatch?.params ?? EMPTY_PARAMS), ...result.params },
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
  },
  location: ParsedLocation,
  mainMatches: AnyRouteMatch[],
): AnyRouteMatch[] {
  const prefix = router.options.slotPrefix ?? '@'
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
      const nextNames = names.length ? [...names, name] : [name]
      const seenKey = nextNames.join('\0')
      if (seen.has(seenKey)) continue
      seen.add(seenKey)
      const state = readSlotState(location.search, nextNames, prefix)
      if (state.disabled) continue
      if (state.path == null) {
        const enabled = slotRoot.options?.enabled
        if (enabled === false) continue
        if (typeof enabled === 'function') {
          if (
            !enabled({
              context: parentMatch?.context ?? router.options.context,
              location,
              params: parentMatch?.params,
              search: location.search,
            })
          ) {
            continue
          }
        }
      }
      const tree = slotRoot._slotTree
      const path = state.path || '/'
      const pathPrefix = slotRoot.fullPath && slotRoot.fullPath !== '/' ? slotRoot.fullPath : ''
      const matchPath =
        path === '/' ? '/' : `${pathPrefix}${path.charCodeAt(0) === 47 ? path : `/${path}`}`
      const caseSensitive = router.options.caseSensitive ?? false
      const found =
        (tree && findRouteMatchFromTree(tree, matchPath, caseSensitive)) ||
        (tree && matchPath !== '/' ? findRouteMatchFromTree(tree, '/', caseSensitive) : undefined)
      const search = { ...(parentMatch?.search ?? EMPTY_PARAMS), ...state.search }
      if (!found?.length) {
        extra.push(
          buildSlotMatch(
            router,
            { route: slotRoot, params: EMPTY_PARAMS, rawParams: EMPTY_PARAMS },
            search,
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
          search,
          i === 0 ? parentMatch : built[i - 1],
          name,
          nextNames,
          mainMatches.length + extra.length + i,
        )
        built.push(match)
        extra.push(match)
      }
      consider(built[built.length - 1]?.route as SlotRoute, built[built.length - 1], nextNames)
      consider(slotRoot, built[0], nextNames)
    }
  }
  for (let i = 0; i < mainMatches.length; i++) {
    consider(mainMatches[i]!.route as SlotRoute, mainMatches[i], [])
  }
  if (!extra.length) return mainMatches
  const out: AnyRouteMatch[] = []
  const flush = (parentId: string | undefined) => {
    for (let i = 0; i < extra.length; i++) {
      const match = extra[i]!
      if (match.slotParentId !== parentId) continue
      out.push(match)
      flush(match.routeId)
    }
  }
  for (let i = 0; i < mainMatches.length; i++) {
    const match = mainMatches[i]!
    out.push(match)
    flush(match.routeId)
  }
  return out
}

function resolveSlotNavigateDest(
  router: any,
  dest: any,
  current: ParsedLocation | undefined,
  on: WeakSet<object>,
) {
  if (!on.has(router)) return dest
  const qualified = typeof dest.to === 'string' ? parseQualifiedSlotTo(dest.to) : undefined
  if (!qualified && dest.slots == null) return dest
  return {
    ...dest,
    to: qualified ? (current?.pathname ?? '/') : dest.to,
    search: qualified ? true : dest.search,
    params: qualified ? true : dest.params,
    _slotNav: { qualified, slots: dest.slots, params: dest.params, search: dest.search },
  }
}

function nestSlotDest(names: string[], dest: { to?: string; search?: any }): any {
  let current: any = dest
  for (let i = names.length - 1; i >= 1; i--) current = { slots: { [names[i]!]: current } }
  return { [names[0]!]: current }
}

function applySlotSearchUpdates(
  router: any,
  dest: any,
  currentSearch: Record<string, any>,
  nextSearch: Record<string, any>,
  on: WeakSet<object>,
) {
  if (!on.has(router)) return nextSearch
  const prefix = router.options.slotPrefix ?? '@'
  const result = retainSlotSearch(currentSearch, { ...nextSearch }, prefix)
  const nav = dest._slotNav
  if (nav?.qualified) {
    applySlotsObject(
      result,
      nestSlotDest(nav.qualified.names, {
        to: interpolateSlotPath(nav.qualified.internal, nav.params),
        search: nav.search,
      }),
      prefix,
    )
  }
  if (nav?.slots || dest.slots) applySlotsObject(result, nav?.slots ?? dest.slots, prefix)
  return result
}

export function listParentSlots(
  route: SlotRoute | undefined,
  matches: AnyRouteMatch[],
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
  }
  return infos
}

function lastNonSlotMatch(matches: any[]) {
  for (let i = matches.length - 1; i >= 0; i--) {
    if (!matches[i].slot) return matches[i]
  }
  return matches[matches.length - 1]
}

let slotRuntimeInstalled = false
function ensureSlotRuntime() {
  if (slotRuntimeInstalled) return
  slotRuntimeInstalled = true
  const on = new WeakSet<object>()
  setSlotRuntime({
    o: on,
    s: splitSlotChildren,
    i: installSlotTrees,
    m: appendSlotMatches,
    d: (router, dest, current) => resolveSlotNavigateDest(router, dest, current, on),
    a: (router, dest, currentSearch, nextSearch) =>
      applySlotSearchUpdates(router, dest, currentSearch, nextSearch, on),
    l: lastNonSlotMatch,
  })
}

export function markSlotRoute(route: any, options: { slot?: string; enabled?: any }) {
  ensureSlotRuntime()
  const slotRoute = route as SlotRoute
  slotRoute._slotName = options.slot ?? (slotRoute.parentRoute as SlotRoute | undefined)?._slotName
  slotRoute._slotRoot = !!options.slot
  if (options.enabled !== undefined) {
    slotRoute.options = { ...slotRoute.options, enabled: options.enabled }
  }
  const originalInit = slotRoute.init.bind(slotRoute)
  slotRoute.init = (opts) => {
    originalInit(opts)
    if (!slotRoute._slotRoot || !slotRoute._slotName) return
    const parentRoute = slotRoute.parentRoute as SlotRoute | undefined
    const parentPath = !parentRoute || parentRoute.fullPath === '/' ? '' : parentRoute.fullPath
    const fullPath = `${parentPath}/@${slotRoute._slotName}`
    const writable = slotRoute as SlotRoute & { _fullPath: string; _to: string; _id: string }
    writable._fullPath = fullPath
    writable._to = fullPath
    writable._id = fullPath
  }
  return route
}

export function createSlotRoute(options: any = {}) {
  return markSlotRoute(
    new BaseRoute({
      ...options,
      ...(options.slot && !options.path && !options.id ? { id: `@${options.slot}` } : {}),
    } as any),
    options,
  )
}
