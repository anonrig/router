import {
  createBrowserHistory,
  parseHref,
  type HistoryLocation,
  type RouterHistory,
} from 'speedy-router-history'
import {
  buildRouteBranch,
  findFlatMatch,
  findRouteMatch,
  findRouteMatchFromTree,
  findSingleMatch,
  processRouteMasks,
  processRouteTree,
  type ProcessedTree,
} from './match'
import { isNotFound } from './not-found'
import { isServer } from './is-server'
import { loadRouteChunk, replaceRouteChunk } from './load-chunk'
import { PathParamError, SearchParamError } from './misc'
import { compileDecodeCharMap, interpolatePath, resolvePath, trimPath, trimPathRight } from './path'
import { isRedirect, type AnyRedirect } from './redirect'
import {
  composeRewrites,
  executeRewriteInput,
  executeRewriteOutput,
  rewriteBasepath,
} from './rewrite'
import { rootRouteId } from './root'
import type { ParsedLocation } from './location'
import type { AnyRouteMatch as PublicRouteMatch } from './matches'
import type { AnyContext as RouteAnyContext, AnyRoute } from './route'
import type { BuildLocationFn, NavigateFn } from './router-provider'
import { setupDefaultScroll } from './scroll-default'
import {
  applySearchMiddleware,
  extractStrictParams,
  findGlobalNotFoundRouteId,
  routeNeedsLoad,
  validateSearch,
} from './router-search'
import { defaultParseSearch, defaultStringifySearch } from './search-params'
import { createStore } from './store'
import {
  createNonReactiveMutableStore,
  createNonReactiveReadonlyStore,
  createRouterStores,
} from './stores'
import {
  decodePath,
  deepEqual,
  DEFAULT_PROTOCOL_ALLOWLIST,
  DEFAULT_PROTOCOL_SET,
  encodePathLikeUrl,
  functionalUpdate,
  hasOwn,
  isDangerousProtocol,
  isPlainObject,
  nullReplaceEqualDeep,
  replaceEqualDeep,
  type PickAsRequired,
  type StringMap,
} from './utils'

/**
 * Convert an unknown error into a minimal, serializable object.
 * Includes name and message (and stack in development).
 */
export function defaultSerializeError(err: unknown) {
  if (err instanceof Error) {
    const obj = {
      name: err.name,
      message: err.message,
    }

    if (process.env.NODE_ENV === 'development') {
      ;(obj as { stack?: string }).stack = err.stack
    }

    return obj
  }

  return {
    data: err,
  }
}

export const trailingSlashOptions = {
  always: 'always',
  never: 'never',
  preserve: 'preserve',
} as const

export type TrailingSlashOption = (typeof trailingSlashOptions)[keyof typeof trailingSlashOptions]

export interface Register {
  // Apps merge `router`, `config`, and `ssr` via `declare module`.
}

export type RegisteredRouter<TRegister = Register> = TRegister extends {
  router: infer TRouter
}
  ? TRouter
  : AnyRouter

export type RegisteredSsr<TRegister = Register> = TRegister extends {
  ssr: infer TSsr
}
  ? TSsr
  : any
export type AnyRouter = RouterCore<any, any, any, any, any>
export type CreateRouterFn = <
  TRouteTree extends AnyRoute,
  TTrailingSlashOption extends TrailingSlashOption = 'never',
  TDefaultStructuralSharingOption extends boolean = false,
  TRouterHistory extends RouterHistory = RouterHistory,
  TDehydrated extends Record<string, any> = Record<string, any>,
>(
  options: RouterConstructorOptions<
    TRouteTree,
    TTrailingSlashOption,
    TDefaultStructuralSharingOption,
    TRouterHistory,
    TDehydrated
  >,
) => RouterCore<
  TRouteTree,
  TTrailingSlashOption,
  TDefaultStructuralSharingOption,
  TRouterHistory,
  TDehydrated
>
export type InferRouterContext<TRouteTree extends AnyRoute> = TRouteTree['types']['routerContext']

export type RouterContextOptions<TRouteTree extends AnyRoute> =
  RouteAnyContext extends InferRouterContext<TRouteTree>
    ? {
        context?: InferRouterContext<TRouteTree>
      }
    : {
        context: InferRouterContext<TRouteTree>
      }

export type InvalidateFn<TRouter extends AnyRouter> = (opts?: {
  filter?: (d: import('./matches').MakeRouteMatchUnion<TRouter>) => boolean
  sync?: boolean
  forcePending?: boolean
}) => Promise<void>

export type ClearCacheFn<TRouter extends AnyRouter> = (opts?: {
  filter?: (d: import('./matches').MakeRouteMatchUnion<TRouter>) => boolean
}) => void

export interface MatchRoutesOpts {
  throwOnError?: boolean
}

export type SubscribeFn = (eventType: string, fn: ListenerFn) => () => void
export type PreloadRouteFn = (opts: NavigateOptions) => Promise<Array<PublicRouteMatch> | undefined>
export type MatchRouteFn = (location: ToOptions, opts?: MatchRouteOptions) => any
export type ParseLocationFn = (
  locationToParse: HistoryLocation,
  previousLocation?: ParsedLocation,
) => ParsedLocation
export type GetMatchRoutesFn = (
  pathname: string,
) => [
  matchedRoutes: ReadonlyArray<AnyRoute>,
  rawParams: Record<string, string>,
  foundRoute: AnyRoute | undefined,
]
export type EmitFn = (routerEvent: RouterEvent) => void
export type LoadFn = (opts?: {
  sync?: boolean
  action?: { type: string }
  _signal?: AbortSignal
}) => Promise<void>
export type CommitLocationFn = (next: ParsedLocation & CommitLocationOptions) => Promise<void>
export interface MatchRoutesFn {
  (pathname: string, locationSearch?: any, opts?: MatchRoutesOpts): Array<PublicRouteMatch>
  (next: ParsedLocation, opts?: MatchRoutesOpts): Array<PublicRouteMatch>
  (
    pathnameOrNext: string | ParsedLocation,
    locationSearchOrOpts?: any,
    opts?: MatchRoutesOpts,
  ): Array<PublicRouteMatch>
}
export type LoadRouteChunkFn = (route: AnyRoute) => Promise<Array<void>>

export type RouterConstructorOptions<
  TRouteTree extends AnyRoute = AnyRoute,
  TTrailing extends TrailingSlashOption = 'never',
  TSharing extends boolean = false,
  THistory = any,
  TDehydrated = any,
> = Omit<RouterOptions<TRouteTree, TTrailing, TSharing, THistory, TDehydrated>, 'context'> &
  RouterContextOptions<TRouteTree>

export interface RouterOptionsExtensions {}
export interface DefaultRouterOptionsExtensions {}

export interface RouterOptions<
  TRouteTree extends AnyRoute = AnyRoute,
  TTrailingSlashOption extends TrailingSlashOption = 'never',
  TDefaultStructuralSharingOption extends boolean = false,
  TRouterHistory = any,
  TDehydrated = any,
> extends RouterOptionsExtensions {
  routeTree?: TRouteTree
  history?: TRouterHistory
  stringifySearch?: typeof defaultStringifySearch
  parseSearch?: typeof defaultParseSearch
  defaultPreload?: false | 'intent' | 'viewport' | 'render'
  defaultPreloadDelay?: number
  defaultPreloadIntentProximity?: number
  defaultPendingMs?: number
  defaultPendingMinMs?: number
  defaultStaleTime?: number
  defaultGcTime?: number
  defaultPreloadStaleTime?: number
  defaultPreloadGcTime?: number
  defaultStructuralSharing?: TDefaultStructuralSharingOption
  defaultViewTransition?: boolean
  defaultHashScrollIntoView?: boolean
  caseSensitive?: boolean
  notFoundMode?: 'fuzzy' | 'root'
  context?: InferRouterContext<TRouteTree>
  trailingSlash?: TTrailingSlashOption
  basepath?: string
  rewrite?: any
  origin?: string
  isServer?: boolean
  isShell?: boolean
  pathParamsAllowedCharacters?: string[]
  protocolAllowlist?: string[]
  notFoundRoute?: any
  Wrap?: any
  InnerWrap?: any
  defaultComponent?: any
  defaultErrorComponent?: any
  defaultPendingComponent?: any
  defaultNotFoundComponent?: any
  defaultOnCatch?: any
  disableGlobalCatchBoundary?: boolean
  ssr?: { nonce?: string } & Record<string, any>
  scrollRestorationBehavior?: ScrollBehavior
  getScrollRestorationKey?: (location: any) => string
  serializer?: any
  serializationAdapters?: any[]
  routeMasks?: any[]
  slotPrefix?: string
  hydrate?: (data: any) => any
  additionalContext?: Record<string, any>
  defaultSsr?: any
  defaultStaleReloadMode?: any
  scrollToTopSelectors?: Array<string | (() => Element | null | undefined)>
  unmaskOnReload?: boolean
  scrollRestoration?: boolean | ((opts: { location: ParsedLocation }) => boolean)
}

export type { ParsedLocation } from './location'
export type RouteMatch = PublicRouteMatch & {
  rawParams?: Record<string, any>
  meta?: any
  links?: any
  scripts?: any
  headScripts?: any
  styles?: any
  publicHref?: string
  loadPromise?: Promise<void>
  _flight?: any
  _strictParams?: Record<string, any>
  _strictSearch?: Record<string, any>
}
export type AnyRouteMatch = RouteMatch
export type MakeRouteMatch = RouteMatch
export type MakeRouteMatchUnion = RouteMatch

export interface RouterState<
  in out TRouteTree extends AnyRoute = AnyRoute,
  in out TRouteMatch = import('./matches').MakeRouteMatchUnion,
> {
  status: 'pending' | 'idle'
  isLoading: boolean
  isTransitioning: boolean
  matches: Array<TRouteMatch>
  pendingMatches?: Array<TRouteMatch>
  location: import('./location').ParsedLocation<import('./route-info').FullSearchSchema<TRouteTree>>
  resolvedLocation?: import('./location').ParsedLocation<
    import('./route-info').FullSearchSchema<TRouteTree>
  >
  statusCode: number
  redirect?: AnyRedirect
}

/** Create an initial RouterState from a parsed location. */
export function getInitialRouterState(location: ParsedLocation): RouterState<any> {
  return {
    isLoading: false,
    isTransitioning: false,
    status: 'idle',
    resolvedLocation: undefined,
    location,
    matches: [],
    statusCode: 200,
  }
}

export type NavigateOptions = {
  to?: string
  from?: string
  href?: string
  params?: any
  search?: any
  hash?: any
  state?: any
  replace?: boolean
  resetScroll?: boolean
  viewTransition?: boolean | { types?: string[] }
  ignoreBlocker?: boolean
  reloadDocument?: boolean
  mask?: any
  publicHref?: string
  unsafeRelative?: any
  _fromLocation?: ParsedLocation
  leaveParams?: boolean
  _includeValidateSearch?: boolean
  _isRedirect?: boolean
  _isNavigate?: boolean
  slots?: Record<string, any>
}

export type ToOptions = NavigateOptions
export type MatchRouteOptions = {
  pending?: boolean
  caseSensitive?: boolean
  fuzzy?: boolean
  includeSearch?: boolean
}

export type BuildNextOptions = NavigateOptions & { from?: string }
export type CommitLocationOptions = {
  replace?: boolean
  ignoreBlocker?: boolean
  resetScroll?: boolean
  hashScrollIntoView?: any
  viewTransition?: boolean | { types?: string[] }
}
export type { NavigateFn, BuildLocationFn }

export type RouterEvent = { type: string; [key: string]: any }
export type RouterEvents = Record<string, RouterEvent>
export type RouterListener = (event: RouterEvent) => void
export type ListenerFn = RouterListener

const EMPTY_OBJ: Record<string, any> = Object.freeze(Object.create(null))
export const RESOLVED: Promise<void> = Promise.resolve()
let serverLoadCached: ((router: any, opts?: any) => void | Promise<void>) | undefined
let clientLoadCached: ((router: any, opts?: any) => void | Promise<void>) | undefined
let clientPreloadCached: ((router: any, opts?: any) => Promise<any>) | undefined

/** SSR handlers and tests install the server loader so client Vite builds can DCE `load-server`. */
export function setLoadServerRoute(load: (router: any, opts?: any) => void | Promise<void>) {
  serverLoadCached = load
}

export function importLoadClient(router: any, opts?: any) {
  if (clientLoadCached) return clientLoadCached(router, opts)
  return import('./load-client').then(({ loadClientRoute }) => {
    clientLoadCached = loadClientRoute
    return loadClientRoute(router, opts)
  })
}

type WarmLoadFn = (
  router: any,
  location: ParsedLocation,
  id: number,
) => boolean | void | Promise<void>
let warmLoadCached: WarmLoadFn | undefined

/** Opt-in sync loader. Default clients DCE this; import `speedy-router-core/warm` to install it. */
export function setWarmLoad(load: WarmLoadFn) {
  warmLoadCached = load
}

function importPreloadClient(router: any, opts?: any) {
  if (clientPreloadCached) return clientPreloadCached(router, opts)
  return import('./load-client').then(({ preloadClientRoute }) => {
    clientPreloadCached = preloadClientRoute
    return preloadClientRoute(router, opts)
  })
}

/** Registered only when `createSlotRoute` is imported. Short keys keep the default graph small. */
type SlotRuntime = {
  o: WeakSet<object>
  s(routeTree: any): void
  i(
    routeTree: any,
    routesById: Record<string, any>,
    routesByPath: Record<string, any>,
    caseSensitive: boolean,
  ): boolean
  m(router: any, location: any, matches: any[]): any[]
  d(router: any, dest: any, current: any): any
  a(router: any, dest: any, currentSearch: any, nextSearch: any): any
  l(matches: any[]): any
  p(matches: any[], index: number, match: any): any
}

let slotRuntime: SlotRuntime | undefined
export function setSlotRuntime(runtime: SlotRuntime) {
  slotRuntime ??= runtime
}

/** True when subscribers, hydrate, or slot runtime make the sync loader unsafe. */
export function isWarmLoadBlocked(router: AnyRouter): boolean {
  return !!(router.subscribers.size || router.options.hydrate || slotRuntime?.o.has(router))
}

function lastMatch(matches: RouteMatch[] | undefined) {
  if (!matches?.length) return undefined
  return slotRuntime?.l?.(matches) ?? matches[matches.length - 1]
}

export function matchParentContext(matches: any[], index: number, match: any) {
  return slotRuntime?.p?.(matches, index, match) ?? matches[index - 1]?.context
}

const runNow = (fn: () => void) => fn()

const DEFAULT_STORE_CONFIG = {
  createMutableStore: createNonReactiveMutableStore,
  createReadonlyStore: createNonReactiveReadonlyStore,
  batch: runNow,
}

const OPTION_DEFAULTS = {
  defaultPreloadDelay: 50,
  defaultPendingMs: 1000,
  defaultPendingMinMs: 500,
  context: undefined as any,
  caseSensitive: false,
  notFoundMode: 'fuzzy' as const,
  stringifySearch: defaultStringifySearch,
  parseSearch: defaultParseSearch,
  protocolAllowlist: DEFAULT_PROTOCOL_ALLOWLIST,
}

function defaultGetStoreConfig() {
  return DEFAULT_STORE_CONFIG
}

function createBatchedStore<T>(
  initial: T,
  schedule: (notify: () => void) => void,
): ReturnType<typeof createStore<T>> {
  let value = initial
  let listeners: Set<(next: T) => void> | undefined
  return {
    get: () => value,
    set: (next) => {
      const resolved = typeof next === 'function' ? (next as (prev: T) => T)(value) : next
      if (resolved === value) return
      value = resolved
      schedule(() => listeners?.forEach((listener) => listener(value)))
    },
    subscribe: (listener) => {
      listeners ??= new Set()
      listeners.add(listener)
      return () => {
        listeners!.delete(listener)
      }
    },
  }
}

/** Run route lifecycle callbacks in leave/enter/stay phases. */
export function runRouteLifecycle(
  router: AnyRouter,
  previous: Array<RouteMatch>,
  matches: Array<RouteMatch>,
  isCurrent?: () => boolean,
): void {
  for (const match of previous) {
    if (isCurrent?.() === false) return
    if (!matches.some((candidate) => candidate.routeId === match.routeId)) {
      router.routesById[match.routeId]?.options.onLeave?.(match)
    }
  }
  for (const match of matches) {
    if (isCurrent?.() === false) return
    const route = router.routesById[match.routeId]
    if (!route) continue
    route.options[
      previous.some((candidate) => candidate.routeId === match.routeId) ? 'onStay' : 'onEnter'
    ]?.(match)
  }
}

export function getLocationChangeInfo(location: ParsedLocation, resolvedLocation?: ParsedLocation) {
  return {
    fromLocation: resolvedLocation,
    toLocation: location,
    pathChanged: resolvedLocation?.pathname !== location.pathname,
    hrefChanged: resolvedLocation?.href !== location.href,
    hashChanged: resolvedLocation?.hash !== location.hash,
  }
}

export { SearchParamError, PathParamError }

let tempLocationKeySeq = 0

const noopAbortController = {
  signal: {
    aborted: false,
    reason: undefined,
    onabort: null,
    throwIfAborted() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return false
    },
  },
  abort() {},
} as unknown as AbortController

export class RouterCore<
  TRouteTree extends AnyRoute = AnyRoute,
  TTrailingSlashOption extends TrailingSlashOption = 'never',
  TDefaultStructuralSharingOption extends boolean = false,
  TRouterHistory extends RouterHistory = RouterHistory,
  TDehydrated extends Record<string, any> = Record<string, any>,
> {
  options!: PickAsRequired<
    RouterOptions<
      TRouteTree,
      TTrailingSlashOption,
      TDefaultStructuralSharingOption,
      TRouterHistory,
      TDehydrated
    >,
    'stringifySearch' | 'parseSearch' | 'context'
  >
  history!: TRouterHistory
  origin?: string
  latestLocation!: ParsedLocation
  basepath = '/'
  routeTree!: TRouteTree
  routesById!: Record<string, AnyRoute>
  routesByPath!: Record<string, AnyRoute>
  processedTree!: ProcessedTree
  isServer = typeof document === 'undefined'
  pathParamsDecoder?: (encoded: string) => string
  protocolAllowlist = DEFAULT_PROTOCOL_SET
  ssr: any = undefined
  serverSsr: any = undefined
  serverSsrLifecycle?: { onServerSsrAttach?: Array<(serverSsr: any) => void> }
  // Extra bag fields (`state`, client location atoms) stay open for the
  // runtime store implementations. `matches` is the public SSR/client API.
  stores!: {
    matches: {
      get: () => Array<AnyRouteMatch>
    }
    [key: string]: any
  }
  batch: (fn: () => void) => void = runNow
  _rendered: any[] | undefined
  _cache: Record<string, any> = Object.create(null)
  _matchesByPath?: StringMap<RouteMatch[]>
  _committed: any[] = []
  _tx?: any
  _flights?: StringMap<any>
  _preloads?: Map<AbortController, any[]>
  _refreshNextLoad?: boolean
  declare _replaceRouteChunk?: typeof replaceRouteChunk
  declare _refreshRoute?: () => Promise<void>
  navigate!: NavigateFn
  buildLocation!: BuildLocationFn
  _preflight?: AbortController
  _handoff?: any
  _pending?: any
  _serverResult?: any
  _pendingLocation?: ParsedLocation
  _commitPromise?: Promise<void> & { resolve: () => void }
  _forcePending = false
  tempLocationKey: string | undefined
  _scroll: {
    next: boolean
    hash?: boolean
    restoring?: boolean
    restoration?: boolean
    reset?: boolean
  } = { next: true }
  /** @internal */
  _scrollReady?: Promise<void>
  rewrite?: any
  _hasSearchWork = false
  /** Generation for in-flight warm loads. Created on first warm `runLoad`. */
  declare loadId: number
  /** Suppress the history subscriber while `navigateHrefFast` owns the commit. */
  #committing = 0

  private createStores(location: ParsedLocation) {
    const config = defaultGetStoreConfig()
    const stores = createRouterStores(location, config)
    const setMatches = stores.setMatches.bind(stores)
    if (isServer ?? this.isServer) {
      this.batch = config.batch
      const state = createStore<RouterState>({
        status: 'pending',
        isLoading: true,
        isTransitioning: false,
        matches: [],
        location,
        resolvedLocation: undefined,
        statusCode: 200,
      })
      const publishMatches = (nextMatches: any[]) => {
        setMatches(nextMatches)
        const current = state.get()
        if (!current) return
        const status = stores.status.get()
        const nextLocation = stores.location.get()
        const nextResolved = stores.resolvedLocation.get()
        const isLoading = status === 'pending'
        if (
          current.matches === nextMatches &&
          current.status === status &&
          current.location === nextLocation &&
          current.resolvedLocation === nextResolved &&
          current.isLoading === isLoading
        ) {
          return
        }
        state.set({
          ...current,
          matches: nextMatches,
          status,
          isLoading,
          isTransitioning: isLoading,
          location: nextLocation,
          resolvedLocation: nextResolved,
        })
      }
      return Object.assign(stores, {
        state,
        setMatches: publishMatches,
        commitIdleNavigation: (nextLocation: ParsedLocation, nextMatches: any[]) => {
          if (stores.status.get() !== 'idle') stores.status.set('idle')
          stores.location.set(nextLocation)
          stores.resolvedLocation.set(nextLocation)
          setMatches(nextMatches)
          const current = state.get()
          if (
            !current ||
            current.status !== 'idle' ||
            current.isLoading ||
            current.isTransitioning ||
            current.matches !== nextMatches ||
            current.location !== nextLocation ||
            current.resolvedLocation !== nextLocation ||
            current.statusCode !== 200 ||
            current.pendingMatches
          ) {
            state.set({
              status: 'idle',
              isLoading: false,
              isTransitioning: false,
              matches: nextMatches,
              pendingMatches: undefined,
              location: nextLocation,
              resolvedLocation: nextLocation,
              statusCode: 200,
            })
          }
        },
      })
    }
    let batchDepth = 0
    let pendingNotify: (() => void) | undefined
    const scheduleStateNotify = (notify: () => void) => {
      if (batchDepth === 0) {
        notify()
        return
      }
      pendingNotify = notify
    }
    this.batch = (fn) => {
      batchDepth++
      try {
        fn()
      } finally {
        batchDepth--
        if (batchDepth === 0 && pendingNotify) {
          const notify = pendingNotify
          pendingNotify = undefined
          notify()
        }
      }
    }
    const state = createBatchedStore<RouterState>(
      {
        status: 'pending',
        isLoading: true,
        isTransitioning: false,
        matches: [],
        location,
        resolvedLocation: undefined,
        statusCode: 200,
      },
      scheduleStateNotify,
    )
    const locationStore = stores.location
    const setLocation = locationStore.set.bind(locationStore)
    const setStatus = stores.status.set.bind(stores.status)
    const setResolved = stores.resolvedLocation.set.bind(stores.resolvedLocation)
    const matchRoute = createStore(0)
    const sameParsedLocation = (left: any, right: any) =>
      left === right ||
      (!!left &&
        !!right &&
        left.href === right.href &&
        left.pathname === right.pathname &&
        left.searchStr === right.searchStr &&
        left.hash === right.hash)
    const bumpMatchRoute = () => matchRoute.set(matchRoute.get() + 1)
    const syncState = (patch: Record<string, unknown>) => {
      const current = state.get()
      if (!current) return
      for (const key in patch) {
        if ((current as any)[key] !== (patch as any)[key]) {
          state.set({ ...current, ...patch } as any)
          return
        }
      }
    }
    locationStore.set = ((next: any) => {
      const previous = locationStore.get()
      setLocation(next)
      const location = locationStore.get()
      syncState({ location })
      if (!sameParsedLocation(previous, location)) bumpMatchRoute()
    }) as typeof locationStore.set
    stores.status.set = ((next: any) => {
      const previous = stores.status.get()
      setStatus(next)
      const status = stores.status.get()
      syncState({
        status,
        isLoading: status === 'pending',
        isTransitioning: status === 'pending',
      })
      if (previous !== status) bumpMatchRoute()
    }) as typeof stores.status.set
    stores.resolvedLocation.set = ((next: any) => {
      const previous = stores.resolvedLocation.get()
      setResolved(next)
      const resolvedLocation = stores.resolvedLocation.get()
      syncState({ resolvedLocation })
      if (!sameParsedLocation(previous, resolvedLocation)) bumpMatchRoute()
    }) as typeof stores.resolvedLocation.set
    const publishMatches = (nextMatches: any[]) => {
      setMatches(nextMatches)
      const current = state.get()
      if (!current) return
      const status = stores.status.get()
      const nextLocation = locationStore.get()
      const nextResolved = stores.resolvedLocation.get()
      const isLoading = status === 'pending'
      if (
        current.matches === nextMatches &&
        current.status === status &&
        current.location === nextLocation &&
        current.resolvedLocation === nextResolved &&
        current.isLoading === isLoading
      ) {
        return
      }
      state.set({
        ...current,
        matches: nextMatches,
        location: nextLocation,
        resolvedLocation: nextResolved,
        status,
        isLoading,
      })
    }
    return Object.assign(stores, {
      state,
      matchRoute,
      setMatches: publishMatches,
      commitIdleNavigation: (nextLocation: ParsedLocation, nextMatches: any[]) => {
        let bump = false
        if (stores.status.get() !== 'idle') {
          setStatus('idle')
          bump = true
        }
        const previous = locationStore.get()
        setLocation(nextLocation)
        setResolved(nextLocation)
        setMatches(nextMatches)
        const current = state.get()
        if (
          !current ||
          current.status !== 'idle' ||
          current.isLoading ||
          current.isTransitioning ||
          current.matches !== nextMatches ||
          current.location !== nextLocation ||
          current.resolvedLocation !== nextLocation ||
          current.statusCode !== 200 ||
          current.pendingMatches
        ) {
          state.set({
            status: 'idle',
            isLoading: false,
            isTransitioning: false,
            matches: nextMatches,
            pendingMatches: undefined,
            location: nextLocation,
            resolvedLocation: nextLocation,
            statusCode: 200,
          })
        }
        if (bump || !sameParsedLocation(previous, nextLocation)) bumpMatchRoute()
      },
    })
  }
  subscribers = new Set<ListenerFn>()
  async startTransition(fn: () => void, _expected?: any): Promise<boolean> {
    fn()
    // Presentation acknowledgement is the framework owner's job. Returning
    // true here would emit onRendered before RouterProvider mounts.
    return false
  }

  startViewTransition(fn: () => Promise<void>) {
    return fn()
  }

  private unsubHistory?: () => void

  /** @internal */
  _attachHistory() {
    if (!this.unsubHistory) this.update({})
  }

  /** @internal */
  _detachHistory() {
    this.unsubHistory?.()
    this.unsubHistory = undefined
  }

  constructor(
    options: RouterConstructorOptions<
      TRouteTree,
      TTrailingSlashOption,
      TDefaultStructuralSharingOption,
      TRouterHistory,
      TDehydrated
    >,
  ) {
    this.tempLocationKey = String(++tempLocationKeySeq)
    this.navigate = this.executeNavigate.bind(this) as NavigateFn
    this.buildLocation = this.executeBuildLocation.bind(this) as BuildLocationFn
    this.load = this.load.bind(this)
    this.update({
      ...OPTION_DEFAULTS,
      ...options,
      caseSensitive: options.caseSensitive ?? false,
      notFoundMode: options.notFoundMode ?? 'fuzzy',
      stringifySearch: options.stringifySearch ?? defaultStringifySearch,
      parseSearch: options.parseSearch ?? defaultParseSearch,
      protocolAllowlist: options.protocolAllowlist ?? DEFAULT_PROTOCOL_ALLOWLIST,
    } as any)
  }

  get state(): RouterState {
    const bag = this.stores?.state?.get?.() ?? {}
    const status = this.stores?.status?.get?.() ?? bag.status ?? 'pending'
    const matches = this.stores?.matches?.get?.() ?? bag.matches ?? []
    const location = this.stores?.location?.get?.() ?? bag.location
    const resolvedLocation = this.stores?.resolvedLocation
      ? this.stores.resolvedLocation.get()
      : bag.resolvedLocation
    return {
      ...bag,
      status,
      isLoading: status === 'pending',
      isTransitioning: status === 'pending' || bag.isTransitioning,
      matches,
      location,
      resolvedLocation,
      statusCode: bag.statusCode ?? 200,
    }
  }

  set state(next: RouterState) {
    this.stores?.state?.set?.(next)
    if (next.status) this.stores?.status?.set?.(next.status)
    if (next.matches) this.stores?.setMatches?.(next.matches)
    if (next.location) this.stores?.location?.set?.(next.location)
    if (next.resolvedLocation !== undefined) {
      this.stores?.resolvedLocation?.set?.(next.resolvedLocation)
    }
  }

  subscribe(eventType: string, fn: ListenerFn) {
    const wrapped: ListenerFn = (event) => {
      if (eventType === '*' || event.type === eventType) fn(event)
    }
    this.subscribers.add(wrapped)
    return () => {
      this.subscribers.delete(wrapped)
    }
  }

  emit(event: RouterEvent) {
    if (this.subscribers.size === 0) return
    this.subscribers.forEach((fn) => {
      try {
        fn(event)
      } catch (err) {
        console.error(err)
      }
    })
  }

  update(newOptions: RouterOptions) {
    const prevTree = this.routeTree
    const prevCaseSensitive = this.options?.caseSensitive ?? false
    const prevContext = this.options?.context
    this.options = { ...this.options, ...newOptions } as any
    const nextContext = this.options.context
    // `RouterContextProvider` rebuilds `context` on every render, so identity
    // alone would drop warm matches that are still valid. Only a value change
    // makes cached matches and their loader data stale.
    if (prevTree && nextContext !== prevContext && !sameContext(prevContext, nextContext)) {
      this.clearContextCache()
    }
    this.isServer = this.options.isServer ?? typeof document === 'undefined'
    if (
      this.options.protocolAllowlist &&
      this.options.protocolAllowlist !== DEFAULT_PROTOCOL_ALLOWLIST
    ) {
      this.protocolAllowlist = new Set(this.options.protocolAllowlist)
    } else {
      this.protocolAllowlist = DEFAULT_PROTOCOL_SET
    }

    if (this.options.pathParamsAllowedCharacters) {
      this.pathParamsDecoder = compileDecodeCharMap(this.options.pathParamsAllowedCharacters)
    } else {
      this.pathParamsDecoder = undefined
    }

    const prevHistory = this.history
    if (!this.history || (this.options.history && this.options.history !== this.history)) {
      if (this.options.history) this.history = this.options.history as TRouterHistory
      else if (!this.isServer) this.history = createBrowserHistory() as TRouterHistory
    }
    if (this.history !== prevHistory) {
      this.unsubHistory?.()
      this.unsubHistory = undefined
    }

    this.origin =
      this.options.origin ??
      (!this.isServer && typeof window !== 'undefined' && window.origin && window.origin !== 'null'
        ? window.origin
        : 'http://localhost')

    if (this.options.routeTree && this.options.routeTree !== prevTree) {
      this.routeTree = this.options.routeTree as TRouteTree
      this.processRouteTree()
    } else if (this.routeTree && (this.options.caseSensitive ?? false) !== prevCaseSensitive) {
      this.processRouteTree()
    }
    const notFoundRoute = this.options.notFoundRoute
    if (notFoundRoute && this.routesById) {
      if (!notFoundRoute.id) notFoundRoute.init({ originalIndex: 999999 })
      this.routesById[notFoundRoute.id] = notFoundRoute
    }
    if (this.options.routeMasks && this.processedTree) {
      processRouteMasks(this.options.routeMasks as any, this.processedTree)
    }

    this._hasSearchWork = !!this.processedTree?.hasSearchWork

    const nextBasepath = this.options.basepath
    if (!nextBasepath || nextBasepath === '/') {
      this.basepath = '/'
      this.rewrite = this.options.rewrite
    } else {
      const rewrites: Array<any> = []
      const trimmed = trimPath(nextBasepath)
      if (trimmed && trimmed !== '/') {
        rewrites.push(rewriteBasepath({ basepath: nextBasepath }))
      }
      if (this.options.rewrite) rewrites.push(this.options.rewrite)
      this.rewrite =
        rewrites.length === 0
          ? undefined
          : rewrites.length === 1
            ? rewrites[0]
            : composeRewrites(rewrites)
      this.basepath = nextBasepath
    }

    if (this.history) {
      this.latestLocation = this.parseLocation(this.history.location, this.latestLocation)
      if (!this.stores) {
        this.stores = this.createStores(this.latestLocation)
        if (!(isServer ?? this.isServer)) {
          if (this.options.scrollRestoration) {
            this._scrollReady = (async () => {
              const { setupScrollRestoration } = await import('./scroll-restoration')
              setupScrollRestoration(this)
            })()
          } else {
            setupDefaultScroll(this)
          }
        }
      } else {
        this.stores.location.set(this.latestLocation)
      }
      if (!this.unsubHistory) {
        this.unsubHistory = this.history.subscribe(({ location, action }) => {
          if (this.#committing > 0) return
          this.latestLocation = this.parseLocation(location, this.latestLocation)
          void this.load({ action })
        })
      }
    }

    return this
  }

  buildRouteTree() {
    if (!this.routeTree) return this
    this.processRouteTree()
    this._hasSearchWork = !!this.processedTree.hasSearchWork
    return this
  }

  private processRouteTree() {
    const runtime = slotRuntime
    runtime?.s(this.routeTree)
    this.processedTree = processRouteTree(
      this.routeTree as any,
      this.options.caseSensitive ?? false,
    )
    this.routesById = this.processedTree.routesById as any
    this.routesByPath = this.processedTree.routesByPath as any
    this._hasSearchWork = !!this.processedTree.hasSearchWork
    if (runtime) {
      runtime.o[
        runtime.i(
          this.routeTree,
          this.routesById,
          this.routesByPath,
          this.options.caseSensitive ?? false,
        )
          ? 'add'
          : 'delete'
      ](this)
    }
  }

  parseLocation(locationToParse: HistoryLocation, previous?: ParsedLocation): ParsedLocation {
    const parseSearch = this.options.parseSearch ?? defaultParseSearch
    const stringifySearch = this.options.stringifySearch ?? defaultStringifySearch
    const location = parseHistoryLocation(
      this,
      locationToParse,
      previous,
      parseSearch,
      stringifySearch,
    )
    const { __tempLocation, __tempKey } = (location.state ?? {}) as any
    if (__tempLocation && (!__tempKey || __tempKey === this.tempLocationKey)) {
      const parsedTempLocation = parseHistoryLocation(
        this,
        __tempLocation,
        previous,
        parseSearch,
        stringifySearch,
      ) as any
      parsedTempLocation.state.key = location.state.key
      parsedTempLocation.state.__TSR_key = location.state.__TSR_key
      delete parsedTempLocation.state.__tempLocation
      return {
        ...parsedTempLocation,
        maskedLocation: location,
      }
    }
    return location
  }

  private executeBuildLocation(opts: NavigateOptions = {}): ParsedLocation {
    const current =
      opts._fromLocation || this._pendingLocation || this.latestLocation || this.state?.location
    let dest = slotRuntime?.d(this, opts, current) ?? opts
    if (dest.href) {
      // Search-only ("?q=1") and hash-only ("#x") hrefs carry no pathname.
      // Resolve them against the current location so the route is kept and
      // only the specified part changes.
      let href = dest.href as string
      const href0 = href.charCodeAt(0)
      if (current && (href0 === 63 || href0 === 35)) {
        if (href0 === 35) {
          href = `${current.pathname}${current.searchStr}${href}`
        } else {
          // A search-only href keeps the current hash unless it carries its own.
          const inheritedHash =
            href.indexOf('#') === -1 && current.hash ? `#${stripLeadingHash(current.hash)}` : ''
          href = `${current.pathname}${href}${inheritedHash}`
        }
      }
      if (
        href0 === 47 &&
        href.indexOf('?') === -1 &&
        href.indexOf('#') === -1 &&
        !this.rewrite &&
        isPlainAsciiPath(href)
      ) {
        dest = { ...dest, to: href, search: EMPTY_OBJ, hash: '' }
      } else {
        const parsed = parseHref(href, {} as any)
        // Keep relative pathnames (`./x`, `../y`, `z`) as `to` values so
        // resolvePath can join them to the current location. Wrapping them in
        // `new URL(pathname, origin)` would pin them at the origin root.
        let to = decodePath(parsed.pathname).path
        if (this.rewrite) {
          const rewritePath =
            to && to.charCodeAt(0) !== 47 && current
              ? resolvePath({
                  base: current.pathname || '/',
                  to,
                  trailingSlash: (this.options.trailingSlash as any) ?? 'never',
                })
              : to || '/'
          to = executeRewriteInput(this.rewrite, new URL(rewritePath, this.origin)).pathname
        }
        dest = {
          ...dest,
          to,
          search: parsed.search
            ? (this.options.parseSearch ?? defaultParseSearch)(parsed.search)
            : EMPTY_OBJ,
          hash: stripLeadingHash(parsed.hash || ''),
        }
      }
    }
    const matches = this.stores?.matches?.get?.()?.length
      ? this.stores.matches.get()
      : this.state?.matches?.length
        ? this.state.matches
        : this._committed
    const currentMatch = lastMatch(matches)
    const { resolved, destRouteHint } = resolveBuildPath(this, dest, current, currentMatch)
    const nextSearch = resolveBuildSearch(this, dest, current, resolved)
    const searchStr =
      !nextSearch || nextSearch === EMPTY_OBJ
        ? ''
        : (this.options.stringifySearch ?? defaultStringifySearch)(nextSearch)
    const hash = resolveBuildHash(dest, current)
    const hashStr = hash ? `#${hash}` : ''
    const base = trimPath(this.basepath || '/')
    const prefix = base && base !== '/' ? `/${base}` : ''
    const href = `${prefix}${resolved}${searchStr}${hashStr}`
    if (process.env.NODE_ENV !== 'production') {
      if (dest.from) {
        const fromId = dest.from
        const hasFrom = matches?.some(
          (match: RouteMatch) => match.routeId === fromId || match.route?.fullPath === fromId,
        )
        if (!hasFrom) console.warn(`Could not find match for from: ${fromId}`)
      }
      if (!dest.leaveParams && this.processedTree) {
        if (destRouteHint) warnBuildLocationMismatch(this, resolved, destRouteHint)
        else this.getMatchedRoutes(resolved)
      }
    }
    const location: ParsedLocation = {
      href,
      pathname: resolved,
      search: nextSearch ?? EMPTY_OBJ,
      searchStr,
      hash: hashStr ? hash : '',
      state: resolveBuildState(dest, current),
      publicHref: encodePathLikeUrl(href),
      external: false,
    }
    applyBuildMask(this, dest, location)
    applyBuildRewrite(this, location)
    return location
  }

  async commitLocation(
    {
      viewTransition,
      ignoreBlocker,
      resetScroll,
      hashScrollIntoView,
      ...next
    }: ParsedLocation & CommitLocationOptions = {} as any,
  ) {
    const isSameLocation =
      trimPathRight(this.latestLocation?.href ?? '') === trimPathRight(next.href) &&
      deepEqual(
        _getUserHistoryState(next.state),
        _getUserHistoryState(this.latestLocation?.state ?? {}),
      )

    const previousCommitPromise = this._commitPromise
    let settle!: () => void
    const commitPromise = new Promise<void>((resolve) => {
      settle = resolve
    }) as Promise<void> & { resolve: () => void }
    commitPromise.resolve = () => {
      settle()
      previousCommitPromise?.resolve()
    }
    this._commitPromise = commitPromise

    if (isSameLocation) {
      this.load()
    } else {
      const { maskedLocation, ...restHistory } = next as ParsedLocation & {
        maskedLocation?: ParsedLocation
        hashScrollIntoView?: any
      }
      let nextHistory = restHistory
      if (maskedLocation) {
        nextHistory = {
          ...maskedLocation,
          state: {
            ...maskedLocation.state,
            __tempKey: undefined,
            __tempLocation: {
              ...nextHistory,
              search: nextHistory.searchStr,
              state: {
                ...nextHistory.state,
                __tempKey: undefined,
                __tempLocation: undefined,
                __TSR_key: undefined,
                key: undefined,
              },
            },
          } as any,
        }
        if (nextHistory.unmaskOnReload ?? this.options.unmaskOnReload ?? false) {
          ;(nextHistory.state as any).__tempKey = this.tempLocationKey
        }
      }

      nextHistory.state = {
        ...nextHistory.state,
        __hashScrollIntoViewOptions:
          hashScrollIntoView ?? this.options.defaultHashScrollIntoView ?? true,
      } as any

      this.shouldViewTransition = viewTransition
      const historyAction = next.replace ? 'REPLACE' : 'PUSH'
      const intendedHref = nextHistory.publicHref || nextHistory.href
      const commitResult = this.history[historyAction === 'REPLACE' ? 'replace' : 'push'](
        intendedHref,
        nextHistory.state,
        { ignoreBlocker },
      )

      const afterHistoryCommit = () => {
        // A blocker can deny the commit without notifying subscribers. Settle the
        // commit promise so await navigate() cannot hang forever.
        const landed =
          trimPathRight(this.history.location.href) === trimPathRight(intendedHref) ||
          trimPathRight(this.history.location.pathname + this.history.location.search) ===
            trimPathRight(intendedHref)
        if (!landed) {
          commitPromise.resolve()
          if (this._commitPromise === commitPromise) this._commitPromise = undefined
          return
        }
        if (!this.history.subscribers?.size) {
          this.load({ action: { type: historyAction } })
        }
      }

      if (commitResult != null && typeof (commitResult as Promise<void>).then === 'function') {
        return (commitResult as Promise<void>).then(() => {
          afterHistoryCommit()
          return commitPromise
        })
      }
      afterHistoryCommit()
    }

    this._scroll.next = resetScroll ?? true
    return this._commitPromise
  }

  private executeNavigate({
    to,
    reloadDocument,
    href,
    publicHref,
    ...rest
  }: any = {}): Promise<void> {
    let hrefIsUrl = false
    if (href) {
      const first = href.charCodeAt(0)
      if (first !== 47 && first !== 46 && first !== 63 && first !== 35) {
        hrefIsUrl = URL.canParse(`${href}`)
      }
    }
    if (
      href &&
      to === undefined &&
      !reloadDocument &&
      !hrefIsUrl &&
      !publicHref &&
      !this.rewrite &&
      !this.processedTree?.hasSearchMiddleware &&
      !this.options.routeMasks?.length &&
      rest.search == null &&
      rest.params == null &&
      rest.hash == null &&
      rest.mask == null &&
      rest.from == null &&
      !slotRuntime?.o.has(this) &&
      !rest._isRedirect
    ) {
      const href0 = href.charCodeAt(0)
      // Path-relative hrefs (`./x`, `../y`, `z`) must go through resolvePath.
      // Blockers use the slow path so `#committing` does not drop pops.
      if (
        (href0 === 47 || href0 === 63 || href0 === 35) &&
        (this.history.hasBlockers === undefined || !this.history.hasBlockers())
      ) {
        return this.navigateHrefFast(href, rest)
      }
    }
    if (
      typeof to === 'string' &&
      to.charCodeAt(0) === 47 &&
      !href &&
      !reloadDocument &&
      !publicHref &&
      !this.rewrite &&
      !this.processedTree?.hasSearchMiddleware &&
      !this.options.routeMasks?.length &&
      rest.search == null &&
      rest.hash == null &&
      rest.mask == null &&
      rest.from == null &&
      !rest._isRedirect &&
      rest._fromLocation == null &&
      rest.unsafeRelative == null &&
      rest.state == null &&
      rest.params !== true &&
      rest.params !== false &&
      typeof rest.params !== 'function' &&
      !slotRuntime?.o.has(this)
    ) {
      const fast = this.tryNavigateToFast(to, rest)
      if (fast) return fast
    }
    return this.executeNavigateSlow({
      to,
      reloadDocument: hrefIsUrl ? true : reloadDocument,
      href,
      publicHref,
      hrefIsUrl,
      ...rest,
    })
  }

  private async executeNavigateSlow({
    to,
    reloadDocument,
    href,
    publicHref,
    hrefIsUrl,
    ...rest
  }: any = {}): Promise<void> {
    if (reloadDocument) {
      if (to !== undefined || !href) {
        const location = this.buildLocation({ to, ...rest } as any)
        href = href ?? location.publicHref
        publicHref = publicHref ?? location.publicHref
      }
      const reloadHref = !hrefIsUrl && publicHref ? publicHref : href
      if (isDangerousProtocol(reloadHref, this.protocolAllowlist)) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(`Blocked navigation to dangerous protocol: ${reloadHref}`)
        }
        return
      }
      if (typeof document !== 'undefined') window.location.assign(reloadHref)
      return
    }
    return this.buildAndCommitLocation({ to, href, publicHref, ...rest })
  }

  private tryNavigateToFast(to: string, rest: any): Promise<void> | undefined {
    if (this.history.hasBlockers !== undefined && this.history.hasBlockers()) return
    if ((this.history.location.state as any)?.__tempLocation) return
    if (to.indexOf('?') !== -1 || to.indexOf('#') !== -1 || to.indexOf('{') !== -1) return
    let resolved = to
    if (to.indexOf('$') !== -1) {
      const params = rest.params
      if (params == null || typeof params !== 'object' || Array.isArray(params)) return
      const keys = collectSimpleParamKeys(to)
      if (!keys) return
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i]!
        if (!Object.hasOwn(params, key)) return
        if (!isSimpleParamValue(params[key])) return
      }
      const byPath = this.routesByPath
      if (
        !routeAllowsSimpleNav(
          (byPath?.[to] ??
            (to.charCodeAt(to.length - 1) === 47 ? byPath?.[trimPathRight(to)] : undefined)) as
            | AnyRoute
            | undefined,
        )
      ) {
        return
      }
      resolved = this.pathParamsDecoder
        ? interpolatePath({
            path: to,
            params,
            decoder: this.pathParamsDecoder,
          }).interpolatedPath
        : interpolateSimpleTo(to, params, keys)
    } else if (rest.params != null) {
      return
    }
    const trailing = rest.trailingSlash ?? this.options.trailingSlash
    if (trailing) {
      resolved = resolvePath({
        base: '/',
        to: resolved || '/',
        trailingSlash: trailing,
      })
    }
    this.shouldViewTransition = rest.viewTransition
    this._scroll.next = rest.resetScroll ?? true
    return this.navigateHrefFast(resolved, rest)
  }

  private navigateHrefFast(href: string, rest: any): Promise<void> {
    let pathname: string
    let searchStr: string
    let hash: string
    if (isSimpleHref(href)) {
      pathname = decodePath(href).path
      searchStr = ''
      hash = ''
    } else {
      const currentIndex = this.history.location.state?.__TSR_index
      const parsed = parseHref(href, {
        __TSR_index: rest.replace ? currentIndex : (currentIndex ?? 0) + 1,
      })
      searchStr = parsed.search
      hash = decodePath(stripLeadingHash(parsed.hash)).path
      pathname = decodePath(parsed.pathname).path
      const href0 = href.charCodeAt(0)
      if (!parsed.pathname && this.latestLocation && (href0 === 63 || href0 === 35)) {
        pathname = this.latestLocation.pathname
        if (href0 === 35) searchStr = this.latestLocation.searchStr
        else if (!hash) hash = stripLeadingHash(this.latestLocation.hash)
      }
    }
    const trailing = rest.trailingSlash ?? this.options.trailingSlash
    if (trailing) {
      pathname = resolvePath({
        base: '/',
        to: pathname || '/',
        trailingSlash: trailing,
      })
    }
    const hrefFull = encodePathLikeUrl(pathname) + searchStr + (hash ? `#${hash}` : '')
    const state = resolveBuildState(rest, this.latestLocation)
    const location: ParsedLocation = {
      href: hrefFull,
      publicHref: hrefFull,
      pathname,
      search: searchStr ? (this.options.parseSearch ?? defaultParseSearch)(searchStr) : EMPTY_OBJ,
      searchStr,
      hash,
      state,
      external: false,
    }
    if (rest._redirects) {
      ;(location as ParsedLocation & { _redirects?: number })._redirects = rest._redirects
    }

    const prev = this.latestLocation
    const same =
      prev &&
      prev.pathname === pathname &&
      prev.searchStr === searchStr &&
      prev.hash === hash &&
      deepEqual(_getUserHistoryState(location.state), _getUserHistoryState(prev.state))

    if (same) {
      location.state = this.history.location.state
      this.latestLocation = location
      this._pendingLocation = location
      const loaded = this.runLoad(location) ?? importLoadClient(this)
      if (loaded instanceof Promise) {
        return loaded.then(
          () => this.finishHrefNav(location),
          (err) => {
            this.finishHrefNav(location)
            throw err
          },
        )
      }
      this.finishHrefNav(location)
      return RESOLVED
    }

    const history = this.history
    const historyOpts = {
      ignoreBlocker: rest.ignoreBlocker,
      simple: searchStr === '' && hash === '' && pathname === hrefFull,
    }
    this.#committing++
    let pushed: void | Promise<void>
    try {
      pushed = rest.replace
        ? history.replace(hrefFull, state, historyOpts)
        : history.push(hrefFull, state, historyOpts)
    } catch (error) {
      this.#committing--
      throw error
    }

    const afterCommit = (): Promise<void> => {
      history.flush()
      this.#committing--
      const landed =
        decodePath(history.location.pathname).path === pathname &&
        (history.location.search || '') === (searchStr || '') &&
        decodePath(stripLeadingHash(history.location.hash)).path === hash
      if (!landed) return RESOLVED

      location.state = history.location.state
      this.latestLocation = location
      this._pendingLocation = location

      const loaded = this.runLoad(location) ?? importLoadClient(this)
      if (loaded instanceof Promise) {
        return loaded.then(
          () => this.finishHrefNav(location),
          (err) => {
            this.finishHrefNav(location)
            throw err
          },
        )
      }
      this.finishHrefNav(location)
      return RESOLVED
    }

    if (pushed != null && typeof (pushed as Promise<void>).then === 'function') {
      return (pushed as Promise<void>).then(afterCommit, (error) => {
        this.#committing--
        throw error
      })
    }
    return afterCommit()
  }

  private finishHrefNav(location: ParsedLocation) {
    if (this._pendingLocation === location) this._pendingLocation = undefined
    this._commitPromise?.resolve()
    this._commitPromise = undefined
  }

  back() {
    return this.history.back()
  }
  forward() {
    return this.history.forward()
  }
  canGoBack() {
    return this.history.canGoBack()
  }

  async invalidate(opts?: Parameters<InvalidateFn<this>>[0]) {
    const filter = opts?.filter
    const committedMatches = this._committed.length ? this._committed : this.state.matches
    const preloads = this._preloads
    const invalidIds = new Set<string>()
    const consider = (match: RouteMatch | undefined) => {
      if (match && (!filter || filter(match as any))) invalidIds.add(match.id)
    }
    for (let i = 0; i < committedMatches.length; i++) consider(committedMatches[i])
    for (const id in this._cache) consider(this._cache[id])
    if (preloads) {
      for (const preloadMatches of preloads.values()) {
        for (let i = 0; i < preloadMatches.length; i++) consider(preloadMatches[i])
      }
    }
    const txMatches = this._tx?.[3]
    if (txMatches) {
      for (let i = 0; i < txMatches.length; i++) consider(txMatches[i])
    }
    const discardedPreloads: Array<AbortController> = []
    for (const [controller, matches] of preloads ?? []) {
      if (matches.some((match) => invalidIds.has(match.id))) {
        preloads!.delete(controller)
        discardedPreloads.push(controller)
      }
    }
    const invalidateMatch = (d: RouteMatch) => {
      if (invalidIds.has(d.id)) {
        const route = this.routesById[d.routeId] as AnyRoute
        const next = {
          ...d,
          invalid: true,
          ...((opts?.forcePending || d.status === 'error' || d.status === 'notFound') &&
          routeNeedsLoad(route)
            ? ({ status: 'pending', error: undefined } as const)
            : undefined),
        }
        ;(d as RouteMatch & { _flight?: any })._flight = undefined
        return next
      }
      return d
    }

    this._committed = committedMatches.map(invalidateMatch)
    for (const id in this._cache) {
      const match = this._cache[id]!
      if (invalidIds.has(id)) {
        match.invalid = true
        if (opts?.forcePending) match.status = 'pending'
      }
    }
    for (const id of invalidIds) {
      this._flights?.delete(id)
    }
    for (const controller of discardedPreloads) {
      controller.abort()
    }

    this.shouldViewTransition = false
    this._matchesByPath?.clear()
    return this.load({ sync: opts?.sync })
  }

  /**
   * Drop the caches that captured the previous router context. In-flight work
   * is left alone: a navigation must still be able to adopt it, and `update`
   * cannot start a replacement load because React calls it during render.
   */
  private clearContextCache() {
    this._matchesByPath?.clear()
    const cached = this._cache
    for (const id in cached) {
      const match = cached[id]!
      if (match.isFetching || match.status === 'pending' || match._flight) continue
      delete cached[id]
    }
  }

  clearCache(opts?: Parameters<ClearCacheFn<this>>[0]) {
    this._matchesByPath?.clear()
    const cached = this._cache
    const preloads = this._preloads
    const filter = opts?.filter
    const discarded: Array<RouteMatch> = []
    const discardedIds: Array<string> = []
    for (const id in cached) {
      const match = cached[id]!
      if (!filter || filter(match as any)) {
        discardedIds.push(id)
        discarded.push(match)
      }
    }
    const abort: Array<AbortController> = []
    for (const [controller, matches] of preloads ?? []) {
      if (!filter || matches.some(filter as any)) {
        abort.push(controller)
        discarded.push(...matches)
      }
    }
    for (const id of discardedIds) delete cached[id]
    for (const controller of abort) preloads?.delete(controller)
    for (const match of discarded as Array<RouteMatch & { _flight?: any }>) {
      const flight = match._flight
      match._flight = undefined
      if (flight && !--(flight as any)[2]) {
        if (this._flights?.get(match.id) === flight) this._flights?.delete(match.id)
        abort.push(flight[1]!)
      }
    }
    for (const controller of abort) controller.abort()
  }

  load(opts?: { sync?: boolean; _signal?: AbortSignal; action?: any }): Promise<void> {
    this.updateLatestLocation()
    if (isServer || this.isServer) {
      if (opts?._signal?.aborted) {
        return Promise.reject(opts._signal.reason)
      }
      // A reused server router must never skip or replay another request's
      // loader payloads. Client `load()` may still skip a settled session.
      // In-request redirect hops keep `_pendingLocation._redirects`; isolating
      // those would reset the hop count and loop forever.
      try {
        if (
          !(this._pendingLocation as ParsedLocation & { _redirects?: number })?._redirects &&
          !(this.latestLocation as ParsedLocation & { _redirects?: number })?._redirects
        ) {
          this.isolateServerRequest()
        }
        const next = this.importLoadServer(opts)
        return next == null ? RESOLVED : Promise.resolve(next)
      } catch (err) {
        return Promise.reject(err)
      }
    }
    if (!opts?.action && this.canSkipSettledLoad()) {
      this._commitPromise?.resolve()
      this._commitPromise = undefined
      return RESOLVED
    }
    return Promise.resolve(this.runLoad(this.latestLocation) ?? importLoadClient(this, opts)).then(
      () => undefined,
    )
  }

  private importLoadServer(opts?: { sync?: boolean; _signal?: AbortSignal; action?: any }) {
    if (serverLoadCached) return serverLoadCached(this, opts)
    // `import.meta.env.SSR` is a Vite compile-time constant. A runtime
    // `this.isServer` check leaves `import('./load-server')` in the client graph.
    if (import.meta.env.SSR) {
      return import('./load-server').then(({ loadServerRoute }) => {
        serverLoadCached = loadServerRoute
        return loadServerRoute(this, opts)
      })
    }
    return importLoadClient(this, opts)
  }

  private isolateServerRequest() {
    this._cache = Object.create(null)
    this._matchesByPath = undefined
    this._flights = undefined
    this._preloads = undefined
    this._serverResult = undefined
    this._tx = undefined
    this._handoff = undefined
    this._pending = undefined
    this._pendingLocation = undefined
    this._forcePending = false
    const ids = this.stores?.ids?.get?.()
    if (ids?.length) this.stores.setMatches([])
  }

  private canSkipSettledLoad(): boolean {
    if (this._handoff || this._tx || this._refreshNextLoad || this._forcePending) return false
    if ((this as any).forceOnLatestPrefetch) return false
    if (this.stores?.status?.get() !== 'idle') return false
    const resolved = this.stores.resolvedLocation.get()
    if (!resolved || resolved.href !== this.latestLocation.href) return false
    const matches = this._committed.length ? this._committed : this.stores.matches.get()
    if (!matches?.length) return false
    for (let i = 0; i < matches.length; i++) {
      const match = matches[i]!
      if (match.status !== 'success' || match.invalid || match.isFetching) return false
      const shouldReload = this.routesById[match.routeId]?.options?.shouldReload
      if (shouldReload === true || typeof shouldReload === 'function') return false
    }
    return true
  }

  private runLoad(location: ParsedLocation): void | Promise<void> {
    const warm = warmLoadCached
    if (!warm) return
    ;(location as ParsedLocation & { _commit?: Promise<void> })._commit = this._commitPromise
    const next = warm(this, location, (this.loadId = (this.loadId | 0) + 1))
    if (next === true) return RESOLVED
    if (next) return next
  }

  getMatchedRoutes(pathname: string): ReturnType<GetMatchRoutesFn> {
    const path = trimPathRight(pathname || '/')
    const exact = findRouteMatchFromTree(
      this.processedTree,
      path,
      this.options.caseSensitive ?? false,
    )
    let result: ReturnType<GetMatchRoutesFn>
    if (exact?.length) {
      const last = exact[exact.length - 1]!
      const branch = buildRouteBranch(last.route as AnyRoute)
      result = [
        branch.length ? branch : exact.map((item) => item.route),
        last.rawParams,
        last.route,
      ] as unknown as ReturnType<GetMatchRoutesFn>
    } else {
      const match = findRouteMatchFromTree(
        this.processedTree,
        path,
        this.options.caseSensitive ?? false,
        true,
      )
      if (match?.length) {
        const last = match[match.length - 1]!
        result = [
          buildRouteBranch(last.route as AnyRoute),
          last.rawParams,
          last.route,
        ] as unknown as ReturnType<GetMatchRoutesFn>
      } else {
        result = [[this.routesById[rootRouteId]!], Object.create(null), undefined]
      }
    }
    return result
  }

  resolveRedirect(redirect: AnyRedirect): AnyRedirect {
    const locationHeader = redirect.headers.get('Location')

    if (!redirect.options.href || redirect.options._builtLocation) {
      const location = redirect.options._builtLocation ?? this.buildLocation(redirect.options)
      const href = location.publicHref || '/'
      redirect.options.href = href
      redirect.headers.set('Location', href)
    } else if (locationHeader) {
      try {
        const url = new URL(locationHeader)
        if (this.origin && url.origin === this.origin) {
          const href = url.pathname + url.search + url.hash
          redirect.options.href = href
          redirect.headers.set('Location', href)
        }
      } catch {
        // ignore invalid URLs
      }
    }

    if (
      redirect.options.href &&
      !redirect.options._builtLocation &&
      isDangerousProtocol(redirect.options.href, this.protocolAllowlist)
    ) {
      throw new Error(
        process.env.NODE_ENV !== 'production'
          ? `Redirect blocked: unsafe protocol in href "${redirect.options.href}". Allowed protocols: ${Array.from(this.protocolAllowlist).join(', ')}.`
          : 'Redirect blocked: unsafe protocol',
      )
    }

    if (!redirect.headers.get('Location')) {
      redirect.headers.set('Location', redirect.options.href)
    }

    return redirect
  }

  matchRoute(opts: NavigateOptions & MatchRouteOptions = {}, maybeOpts?: MatchRouteOptions): any {
    const dest = maybeOpts === undefined ? opts : { ...opts, ...maybeOpts }
    const options = maybeOpts ?? (opts as MatchRouteOptions)
    const isPending = this.stores?.status?.get?.() === 'pending'
    if (options.pending && !isPending) return false
    const pending = options.pending ?? !isPending
    const baseLocation = pending
      ? this.latestLocation
      : (this.stores?.resolvedLocation?.get?.() ??
        this.stores?.location?.get?.() ??
        this.latestLocation)
    if (!dest.to) return !!(this.state?.matches?.length || this.stores?.matches?.get?.()?.length)
    const next = this.buildLocation({
      ...dest,
      params: dest.params || {},
      leaveParams: true,
      _fromLocation: dest._fromLocation || baseLocation,
    })
    const match = findSingleMatch(
      next.pathname,
      options.caseSensitive ?? dest.caseSensitive ?? this.options.caseSensitive ?? false,
      options.fuzzy ?? dest.fuzzy ?? false,
      baseLocation?.pathname ?? '',
      this.processedTree,
    )
    if (!match) return false
    if (dest.params && !deepEqual(match.rawParams, dest.params, { partial: true })) {
      return false
    }
    if (
      (options.includeSearch ?? dest.includeSearch ?? true) &&
      !deepEqual(baseLocation?.search ?? EMPTY_OBJ, next.search, { partial: true })
    ) {
      return false
    }
    return match.rawParams
  }

  getMatch(matchId: string) {
    return this.state.matches.find((m) => m.id === matchId)
  }

  preloadRoute(opts: NavigateOptions = {}) {
    return importPreloadClient(this, opts)
  }

  loadRouteChunk = loadRouteChunk

  hasNotFoundMatch() {
    return this.state.matches.some((m) => m.status === 'notFound' || m.globalNotFound)
  }

  shouldViewTransition: any = (opts?: { viewTransition?: boolean | { types?: string[] } }) =>
    !!(opts?.viewTransition ?? this.options.defaultViewTransition)

  updateLatestLocation() {
    if (!this.history) return
    this.latestLocation = this.parseLocation(this.history.location, this.latestLocation)
  }

  matchRoutes(pathnameOrNext: string | ParsedLocation, locationSearchOrOpts?: any, opts?: any) {
    const matches =
      typeof pathnameOrNext === 'string'
        ? this.matchRoutesInternal(
            { pathname: pathnameOrNext, search: locationSearchOrOpts } as ParsedLocation,
            opts,
          )
        : this.matchRoutesInternal(pathnameOrNext, locationSearchOrOpts)
    const runtime = slotRuntime
    if (!runtime?.o.has(this)) return matches
    return runtime.m(
      this,
      typeof pathnameOrNext === 'string'
        ? ({ pathname: pathnameOrNext, search: locationSearchOrOpts } as ParsedLocation)
        : pathnameOrNext,
      matches,
    )
  }

  private matchRoutesInternal(next: ParsedLocation, opts?: any): RouteMatch[] {
    const [initialMatchedRoutes, rawParams, foundRoute] = this.getMatchedRoutes(next.pathname)
    let matchedRoutes = initialMatchedRoutes as AnyRoute[]
    let isGlobalNotFound = false

    if (rawParams['**'] || (!foundRoute && trimPathRight(next.pathname))) {
      if (this.options.notFoundRoute) {
        matchedRoutes = [...matchedRoutes, this.options.notFoundRoute]
      } else {
        isGlobalNotFound = true
      }
    }

    const notFoundRouteId = isGlobalNotFound
      ? findGlobalNotFoundRouteId(this.options.notFoundMode, matchedRoutes, rootRouteId)
      : undefined

    const matches: RouteMatch[] = new Array(matchedRoutes.length)
    const committed = this._committed
    const reuseCachedMatches = !(isServer || this.isServer)
    let strictParams: Record<string, any> | undefined

    for (let index = 0; index < matchedRoutes.length; index++) {
      const route = matchedRoutes[index]!
      const parentMatch = matches[index - 1]
      const parentSearch = parentMatch?.search ?? next.search
      const parentStrictSearch = parentMatch?._strictSearch
      let preMatchSearch = parentSearch
      let strictMatchSearch: Record<string, any> = parentStrictSearch
        ? { ...parentStrictSearch }
        : {}
      let searchError: any
      if (route.options?.validateSearch) {
        try {
          const strictSearch =
            validateSearch(route.options.validateSearch, { ...parentSearch }) ?? undefined
          preMatchSearch = { ...parentSearch, ...strictSearch }
          strictMatchSearch = { ...parentStrictSearch, ...strictSearch }
        } catch (err: any) {
          const searchParamError =
            err instanceof SearchParamError
              ? err
              : new SearchParamError(err?.message ?? String(err), { cause: err })
          if (opts?.throwOnError) throw searchParamError
          preMatchSearch = parentSearch
          strictMatchSearch = {}
          searchError = searchParamError
        }
      }

      let loaderDeps: any = ''
      let loaderDepsHash = ''
      if (route.options?.loaderDeps) {
        try {
          loaderDeps = route.options.loaderDeps({ search: preMatchSearch }) ?? ''
          loaderDepsHash = loaderDeps ? JSON.stringify(loaderDeps) || '' : ''
        } catch (cause) {
          if (opts?.throwOnError) throw cause
          searchError ??= cause
        }
      }

      let interpolatedPath = route.fullPath
      let usedParams: Record<string, unknown> | undefined
      if (route.fullPath && route.fullPath.indexOf('$') !== -1) {
        const interpolated = interpolatePath({
          path: route.fullPath,
          params: rawParams,
          decoder: this.pathParamsDecoder,
        })
        interpolatedPath = interpolated.interpolatedPath
        usedParams = interpolated.usedParams
      }

      const matchId = route.id + interpolatedPath + loaderDepsHash
      const previousMatch =
        committed[index]?.routeId === route.id
          ? committed[index]
          : committed.find((candidate) => candidate.routeId === route.id)
      const existingMatch =
        !reuseCachedMatches || (process.env.NODE_ENV !== 'production' && opts?._rematerialize)
          ? undefined
          : (this._cache[matchId] ?? (previousMatch?.id === matchId ? previousMatch : undefined))

      strictParams = existingMatch?._strictParams ?? Object.assign(usedParams ?? {}, strictParams)
      let paramsError: unknown
      if (!existingMatch) {
        try {
          extractStrictParams(route, strictParams ?? {})
        } catch (err: any) {
          paramsError =
            isNotFound(err) || isRedirect(err)
              ? err
              : new PathParamError(err.message, { cause: err })
          if (opts?.throwOnError) throw paramsError
        }
      }

      const cause = previousMatch ? 'stay' : 'enter'
      const needsLoad = routeNeedsLoad(route)
      let match: RouteMatch
      if (existingMatch) {
        match = {
          ...existingMatch,
          cause,
          search: nullReplaceEqualDeep(
            previousMatch?.search ?? existingMatch.search,
            preMatchSearch,
          ),
          _strictSearch: strictMatchSearch,
          searchError,
        } as RouteMatch
      } else {
        match = {
          id: matchId,
          routeId: route.id,
          index,
          route,
          pathname: interpolatedPath,
          params: previousMatch?.params ?? strictParams,
          rawParams,
          _strictParams: strictParams,
          _strictSearch: strictMatchSearch,
          status: needsLoad ? 'pending' : 'success',
          isFetching: false,
          error: undefined,
          context: {},
          search: previousMatch
            ? nullReplaceEqualDeep(previousMatch.search, preMatchSearch)
            : preMatchSearch,
          searchError,
          paramsError,
          updatedAt: Date.now(),
          abortController:
            opts?._controller ?? (needsLoad ? new AbortController() : noopAbortController),
          cause,
          loaderDeps: previousMatch
            ? replaceEqualDeep(previousMatch.loaderDeps, loaderDeps)
            : loaderDeps,
          invalid: false,
          preload: false,
          staticData: route.options?.staticData || {},
          fullPath: route.fullPath,
          ssr: (isServer ?? this.isServer) ? undefined : route.options?.ssr,
        } as RouteMatch
      }
      match._notFound = notFoundRouteId === route.id
      matches[index] = match
    }

    for (let index = 0; index < matches.length; index++) {
      const match = matches[index]!
      match.params =
        match.cause === 'stay' ? nullReplaceEqualDeep(match.params, strictParams) : strictParams!
      if (opts?._controller) match.context = {}
    }

    return matches
  }

  cancelMatch(matchId: string) {
    const match = this.state.matches.find((m) => m.id === matchId)
    match?.abortController.abort()
  }

  isShell() {
    return !!this.options.isShell
  }

  buildAndCommitLocation({
    replace,
    resetScroll,
    hashScrollIntoView,
    viewTransition,
    ignoreBlocker,
    _redirects,
    ...rest
  }: NavigateOptions & CommitLocationOptions & { _redirects?: number; href?: string } = {}) {
    const location = this.buildLocation({
      ...(rest as any),
      _includeValidateSearch: this._hasSearchWork || !!rest._includeValidateSearch,
    }) as ParsedLocation & { _redirects?: number }
    if (_redirects) location._redirects = _redirects

    this._pendingLocation = location
    const commitPromise = this.commitLocation({
      ...location,
      viewTransition,
      replace,
      resetScroll,
      hashScrollIntoView,
      ignoreBlocker,
    })
    queueMicrotask(() => {
      if (this._pendingLocation === location) this._pendingLocation = undefined
    })
    return commitPromise
  }
}

export const createRouter: CreateRouterFn = /*#__PURE__*/ (options) => new RouterCore(options)

if (process.env.NODE_ENV !== 'production') {
  RouterCore.prototype._replaceRouteChunk = replaceRouteChunk
  RouterCore.prototype._refreshRoute = async function () {
    this._serverResult = undefined
    this.updateLatestLocation()
    const { refreshClientRoute } = await import('./load-hmr')
    await refreshClientRoute(this)
  }
}

function resolveBuildPath(
  router: any,
  dest: any,
  current: ParsedLocation | undefined,
  currentMatch: RouteMatch | undefined,
) {
  const fromRoute = dest.from
    ? (router.routesById[dest.from] ?? router.routesByPath?.[trimPathRight(dest.from)])
    : currentMatch
      ? router.routesById[currentMatch.routeId]
      : undefined
  const fromPath =
    dest.unsafeRelative === 'path'
      ? (current?.pathname ?? '/')
      : (fromRoute?.fullPath ?? dest.from ?? current?.pathname ?? '/')

  let to = dest.to
  if (to === undefined || to === '.') {
    // `params: false` is a real spec (clear inherited params) and must still
    // rebuild from the route template. Only a missing spec keeps the pathname.
    to =
      dest.params !== undefined
        ? (fromRoute?.fullPath ?? current?.pathname ?? fromPath)
        : dest.from
          ? fromPath
          : (current?.pathname ?? fromPath)
  }
  if (typeof to !== 'string') to = current?.pathname ?? '/'

  const destRouteHint =
    typeof to === 'string' ? router.routesByPath?.[trimPathRight(to)] : undefined

  // Absolute/static destinations do not inherit or stringify params.
  // `from` is a route template (`/posts/$postId`), so relative dests like
  // `./info` still need the current params after resolvePath.
  if (
    dest.params === undefined &&
    !dest.leaveParams &&
    to.indexOf('$') === -1 &&
    fromPath.indexOf('$') === -1
  ) {
    return {
      resolved: resolvePath({
        base: fromPath || '/',
        to: to || '/',
        trailingSlash: (router.options.trailingSlash as any) ?? 'never',
      }),
      destRouteHint,
    }
  }

  const currentParams = Object.assign(Object.create(null), currentMatch?.params ?? EMPTY_OBJ)
  if (current?.pathname && router.processedTree) {
    const found = findRouteMatch(
      router.processedTree,
      current.pathname,
      router.options.caseSensitive ?? false,
    )
    const foundParams = found?.[found.length - 1]?.params
    if (foundParams) {
      for (const key in foundParams) {
        if (currentParams[key] == null) currentParams[key] = foundParams[key]
      }
    }
  }
  const nextParams = resolveNextParams(dest.params, currentParams)

  const stringifyRoutes = destRouteHint
    ? buildRouteBranch(destRouteHint as AnyRoute)
    : currentMatch
      ? buildRouteBranch(router.routesById[currentMatch.routeId] as AnyRoute)
      : []
  if (stringifyRoutes.length && nextParams) {
    for (const route of stringifyRoutes) {
      const fn = route.options?.params?.stringify ?? route.options?.stringifyParams
      if (fn) {
        try {
          Object.assign(nextParams, fn(nextParams))
        } catch {
          // matchRoutes rethrows via parse
        }
      }
    }
  }

  const interpolateDest = (path: string) =>
    interpolatePath({
      path,
      params: nextParams ?? EMPTY_OBJ,
      decoder: router.pathParamsDecoder,
    }).interpolatedPath

  let interpolated = to
  if (!dest.leaveParams && typeof to === 'string' && to.includes('$')) {
    interpolated = interpolateDest(to)
  } else if (dest.params && !dest.to && !dest.leaveParams) {
    const template = currentMatch ? router.routesById[currentMatch.routeId]?.fullPath : undefined
    if (template) interpolated = interpolateDest(template)
  }

  const interpolatedInput = interpolated
  let resolved = resolvePath({
    base: fromPath || '/',
    to: interpolated || '/',
    trailingSlash: (router.options.trailingSlash as any) ?? 'never',
  })
  if (resolved !== interpolatedInput && resolved.includes('$')) {
    resolved = interpolateDest(resolved)
  }
  return { resolved, destRouteHint }
}

function resolveBuildSearch(
  router: any,
  dest: any,
  current: ParsedLocation | undefined,
  resolved: string,
) {
  if (!router._hasSearchWork && !slotRuntime) {
    if (dest.search === true) return current?.search ?? EMPTY_OBJ
    if (dest.search) return functionalUpdate(dest.search, current?.search ?? EMPTY_OBJ)
    return dest.to ? EMPTY_OBJ : (current?.search ?? EMPTY_OBJ)
  }
  const currentSearch = { ...(current?.search ?? EMPTY_OBJ) }
  const destRoute = router.routesByPath?.[trimPathRight(resolved)] as AnyRoute | undefined
  const destRoutes = destRoute
    ? buildRouteBranch(destRoute)
    : router._hasSearchWork && router.processedTree
      ? (router.getMatchedRoutes(resolved)[0] as AnyRoute[])
      : []
  const fromLocation = dest._fromLocation as ParsedLocation | undefined
  const fromRoutes =
    fromLocation?.pathname && router.processedTree
      ? (router.getMatchedRoutes(fromLocation.pathname)[0] as AnyRoute[])
      : router.state?.matches?.length
        ? router.state.matches
            .map((match: RouteMatch) => router.routesById[match.routeId])
            .filter(Boolean)
        : destRoutes
  for (const route of fromRoutes as AnyRoute[]) {
    try {
      Object.assign(currentSearch, validateSearch(route.options?.validateSearch, currentSearch))
    } catch {
      // ignore, matchRoutes reports the error
    }
  }
  let nextSearch: Record<string, any>
  if (destRoutes.length > 0) {
    nextSearch = applySearchMiddleware(
      currentSearch,
      dest,
      destRoutes as AnyRoute[],
      dest._includeValidateSearch && !router.options.search?.strict,
    ) as Record<string, any>
  } else if (dest.search === true) {
    nextSearch = currentSearch
  } else if (dest.search) {
    nextSearch = functionalUpdate(dest.search, currentSearch)
  } else {
    nextSearch = dest.to ? EMPTY_OBJ : currentSearch
  }

  if (dest._includeValidateSearch && router.options.search?.strict) {
    const validatedSearch: Record<string, any> = {}
    const routes = destRoutes.length ? destRoutes : (fromRoutes as AnyRoute[])
    for (const route of routes) {
      if (!route.options?.validateSearch) continue
      try {
        Object.assign(
          validatedSearch,
          validateSearch(route.options.validateSearch, {
            ...validatedSearch,
            ...nextSearch,
          }),
        )
      } catch {
        // matchRoutes reports the error
      }
    }
    nextSearch = validatedSearch
  }
  return slotRuntime?.a(router, dest, currentSearch, nextSearch) ?? nextSearch
}

function resolveBuildHash(dest: any, current: ParsedLocation | undefined) {
  const currentHash = stripLeadingHash(current?.hash ?? '')
  if (dest.hash === true) return currentHash
  if (typeof dest.hash === 'function') {
    const result = dest.hash(currentHash)
    return typeof result === 'string'
      ? stripLeadingHash(result)
      : stripLeadingHash(String(result ?? ''))
  }
  if (typeof dest.hash === 'string') {
    return stripLeadingHash(dest.hash)
  }
  if (dest.hash !== undefined) {
    return stripLeadingHash(String(dest.hash))
  }
  return dest.to ? '' : currentHash
}

function resolveBuildState(dest: any, current: ParsedLocation | undefined) {
  const nextState =
    dest.state === true
      ? current?.state
      : dest.state
        ? typeof dest.state === 'function'
          ? dest.state(current?.state ?? {})
          : dest.state
        : {}
  return nextState ?? {}
}

function warnBuildLocationMismatch(router: any, resolved: string, destRouteHint: AnyRoute) {
  if (process.env.NODE_ENV === 'production') return
  try {
    const foundRoute = router.getMatchedRoutes(resolved)[2]
    if (foundRoute && foundRoute.id !== destRouteHint.id) {
      const destPath = trimPathRight(destRouteHint.fullPath || destRouteHint.path || '')
      const foundPath = trimPathRight(foundRoute.fullPath || foundRoute.path || '')
      if (destPath === foundPath) return
      console.warn(
        `Generated path "${resolved}" for route "${destRouteHint.id}" matched route "${foundRoute.id}" instead. This can happen when multiple route templates resolve to the same URL. Use the route template that matches the intended route, or adjust params.stringify if it changed the target path.`,
      )
    }
  } catch {
    // ignore roundtrip validation errors
  }
}

function applyBuildMask(router: any, dest: any, location: ParsedLocation) {
  if (dest.mask) {
    location.maskedLocation = router.buildLocation({
      from: dest.from,
      ...dest.mask,
    })
    return
  }
  if (!router.options.routeMasks?.length || !router.processedTree) return
  const match = findFlatMatch(location.pathname, router.processedTree)
  if (!match) return
  const params = Object.assign(Object.create(null), match.rawParams)
  const { from: _from, params: maskParams, ...maskProps } = match.route
  location.maskedLocation = router.buildLocation({
    from: dest.from,
    ...maskProps,
    params: resolveNextParams(maskParams, params),
  })
}

function applyBuildRewrite(router: any, location: ParsedLocation) {
  if (!router.rewrite) return
  const url = new URL(
    `${location.pathname}${location.searchStr}${location.hash ? `#${location.hash}` : ''}`,
    router.origin,
  )
  const rewrittenUrl = executeRewriteOutput(router.rewrite, url)
  location.href = url.href.replace(url.origin, '')
  if (rewrittenUrl.origin !== router.origin) {
    location.publicHref = rewrittenUrl.href
    location.external = true
  } else {
    location.publicHref = rewrittenUrl.pathname + rewrittenUrl.search + rewrittenUrl.hash
  }
}

function isPlainAsciiPath(path: string) {
  return !/[\0- %\\\x7f-\uFFFF]/.test(path)
}

function stripLeadingHash(hash: string) {
  return !hash ? '' : hash.charCodeAt(0) === 35 ? hash.slice(1) : hash
}

let lastSimpleParamPath = ''
let lastSimpleParamKeys: string[] | null = null

function collectSimpleParamKeys(path: string): string[] | null {
  if (path === lastSimpleParamPath) return lastSimpleParamKeys
  const keys: string[] = []
  for (let i = 0; i < path.length; i++) {
    if (path.charCodeAt(i) !== 36) continue
    let j = i + 1
    if (j >= path.length || path.charCodeAt(j) === 47) return null
    while (j < path.length && path.charCodeAt(j) !== 47) j++
    const key = path.slice(i + 1, j)
    if (key === '*' || key === '_splat') return null
    keys.push(key)
    i = j - 1
  }
  lastSimpleParamPath = path
  lastSimpleParamKeys = keys
  return keys
}

function isSimpleParamValue(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value !== 'string' || value.length === 0) return false
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i)
    if (
      !(
        (c >= 48 && c <= 57) ||
        (c >= 65 && c <= 90) ||
        (c >= 97 && c <= 122) ||
        c === 45 ||
        c === 46 ||
        c === 95 ||
        c === 126
      )
    ) {
      return false
    }
  }
  return true
}

type SimpleToApply = (params: Record<string, any>) => string

const simpleToApplyByPath = new Map<string, SimpleToApply>()

function compileSimpleTo(path: string, keys: string[]): SimpleToApply {
  if (keys.length === 1) {
    const key = keys[0]!
    const idx = path.indexOf('$' + key)
    const pre = path.slice(0, idx)
    const post = path.slice(idx + key.length + 1)
    return (params) => pre + params[key] + post
  }
  const parts: Array<string | { k: string }> = []
  let last = 0
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]!
    const idx = path.indexOf('$' + key, last)
    if (idx > last) parts.push(path.slice(last, idx))
    parts.push({ k: key })
    last = idx + key.length + 1
  }
  if (last < path.length) parts.push(path.slice(last))
  return (params) => {
    let out = ''
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!
      out += typeof part === 'string' ? part : params[part.k]
    }
    return out
  }
}

function interpolateSimpleTo(path: string, params: Record<string, any>, keys: string[]): string {
  let apply = simpleToApplyByPath.get(path)
  if (apply === undefined) {
    apply = compileSimpleTo(path, keys)
    simpleToApplyByPath.set(path, apply)
  }
  return apply(params)
}

function routeAllowsSimpleNav(route: AnyRoute | undefined): boolean {
  if (!route) return true
  const cached = (route as { _simpleNav?: 0 | 1 })._simpleNav
  if (cached === 1) return true
  if (cached === 0) return false
  let current: AnyRoute | undefined = route
  while (current) {
    if (current.options?.params?.stringify || current.options?.stringifyParams) {
      ;(route as { _simpleNav?: 0 | 1 })._simpleNav = 0
      return false
    }
    current = current.parentRoute as AnyRoute | undefined
  }
  ;(route as { _simpleNav?: 0 | 1 })._simpleNav = 1
  return true
}

function isSimpleHref(href: string) {
  const len = href.length
  if (len === 0 || href.charCodeAt(0) !== 47 || (len > 1 && href.charCodeAt(1) === 47)) {
    return false
  }
  for (let i = 1; i < len; i++) {
    const c = href.charCodeAt(i)
    if (c <= 0x1f || c === 0x7f || c === 63 || c === 35) return false
  }
  return true
}

function parseHistoryLocation(
  router: { rewrite?: any; origin?: string },
  location: HistoryLocation,
  previous: ParsedLocation | undefined,
  parseSearch: (search: string) => any,
  stringifySearch: (search: any) => string,
): ParsedLocation {
  if (!router.rewrite && isPlainAsciiPath(location.pathname)) {
    const hash = location.hash
    const pathname = location.pathname
    const state = previous ? replaceEqualDeep(previous.state, location.state) : location.state
    if (!location.search && parseSearch === defaultParseSearch) {
      const href = pathname + hash
      return {
        href,
        publicHref: href,
        pathname,
        external: false,
        searchStr: '',
        search: EMPTY_OBJ,
        hash: stripLeadingHash(hash),
        state,
      }
    }
    const parsedSearch = parseSearch(location.search)
    const searchStr = stringifySearch(parsedSearch)
    const href = pathname + searchStr + hash
    return {
      href,
      publicHref: href,
      pathname,
      external: false,
      searchStr,
      search: nullReplaceEqualDeep(previous?.search, parsedSearch),
      hash: stripLeadingHash(hash),
      state,
    }
  }
  const fullUrl = new URL(location.href, router.origin)
  const url = executeRewriteInput(router.rewrite, fullUrl)
  const parsedSearch = parseSearch(url.search)
  const searchStr = stringifySearch(parsedSearch)
  const pathname = decodePath(url.pathname).path
  const hashValue = decodePath(stripLeadingHash(url.hash)).path
  const href = encodePathLikeUrl(pathname) + searchStr + (hashValue ? `#${hashValue}` : '')
  return {
    href,
    publicHref: router.rewrite ? location.href : href,
    pathname,
    external: !!router.rewrite && url.origin !== router.origin,
    searchStr,
    search: nullReplaceEqualDeep(previous?.search, parsedSearch),
    hash: hashValue,
    state: replaceEqualDeep(previous?.state, location.state),
  }
}

const CONTEXT_COMPARE_MAX_DEPTH = 4

/**
 * Compare router context by value. Router context may hold cyclic values, so
 * `deepEqual` cannot be used here: the depth bound doubles as the cycle guard,
 * and values below it must match by identity.
 */
function sameContext(prev: any, next: any, depth = 0): boolean {
  if (prev === next) return true
  if (depth === CONTEXT_COMPARE_MAX_DEPTH) return false
  if (!isPlainObject(prev) || !isPlainObject(next)) return false
  let keys = 0
  for (const key in next) {
    if (!hasOwn.call(next, key)) continue
    keys++
    if (!hasOwn.call(prev, key) || !sameContext(prev[key], next[key], depth + 1)) return false
  }
  for (const key in prev) {
    if (hasOwn.call(prev, key)) keys--
  }
  return keys === 0
}

function resolveNextParams(spec: unknown, base: Record<string, unknown>): Record<string, unknown> {
  return spec === false || spec === null
    ? Object.create(null)
    : (spec ?? true) === true
      ? base
      : Object.assign(base, functionalUpdate(spec as any, base))
}

export function _getUserHistoryState({
  key: _key,
  __TSR_key: _tsrKey,
  __TSR_index: _tsrIndex,
  __hashScrollIntoViewOptions: _hashScroll,
  ...state
}: any) {
  return state
}

export type ControllablePromise<T = any> = Promise<T> & {
  resolve: (value: T) => void
  reject: (value?: any) => void
}
export type InjectedHtmlEntry = Promise<string>
export type DefaultRemountDepsFn<T = any> = (opts: any) => any
export type SSROption = boolean | 'data-only'
export type AnyRouterWithContext<T = any> = AnyRouter
export type FileRoutesByPath = Record<string, any>
export type CreateFileRoute = any
export type CreateLazyFileRoute = any
export type LazyRoute = any
export type LazyRouteOptions = any
export type InferFileRouteTypes = any
export type RouteById<T, I> = any
export type RouteByPath<T, P> = any
export type RouteIds<T> = string
export type RoutePaths<T> = string
export type RoutesById<T> = Record<string, AnyRoute>
export type RoutesByPath<T> = Record<string, AnyRoute>
export type FullSearchSchema<T> = any
export type FullSearchSchemaInput<T> = any
export type AllParams<T> = any
export type AllContext<T> = any
export type AllLoaderData<T> = any
export type ParseRoute<T> = any
export type RouteToPath<T> = any
export type CodeRouteToPath<T> = any
export type TrailingSlashOptionByRouter<T> = TrailingSlashOption
export type ActiveOptions = {
  exact?: boolean
  includeHash?: boolean
  includeSearch?: boolean
  explicitUndefined?: boolean
}
export type ResolveRelativePath<TFrom, TTo> = string
export type InferDescendantToPaths<T> = string
export type RelativeToPath<T> = string
export type RelativeToParentPath<T> = string
export type RelativeToCurrentPath<T> = string
export type AbsoluteToPath<T> = string
export type RelativeToPathAutoComplete<T> = string
export type ToMaskOptions = any
export type ToSubOptions = any
export type ResolveRoute<T> = any
export type SearchParamOptions = any
export type PathParamOptions = any
export type ToPathOption = any
export type LinkOptions = NavigateOptions & { activeOptions?: ActiveOptions }
export type MakeOptionalPathParams<T> = any
export type FileRouteTypes = any
export type RouteContextParameter = any
export type BeforeLoadContextParameter = any
export type ResolveAllContext<T> = any
export type ResolveAllParamsFromParent<T> = any
export type ResolveFullSearchSchema<T> = any
export type ResolveFullSearchSchemaInput<T> = any
export type UseNavigateResult<T = any> = NavigateFn
export type FullSearchSchemaOption = any
export type MakeRemountDepsOptionsUnion = any
export type RemountDepsOptions = any
export type ResolveFullPath<T> = string
export type FromPathOption = any
export type MakeOptionalSearchParams<T> = any
export type MaskOptions = any
export type ToSubOptionsProps = any
export type RequiredToOptions = any
export type LinkOptionsProps = any
export type RemoveTrailingSlashes<T> = T
export type RemoveLeadingSlashes<T> = T
export type TrimPath<T> = T
export type TrimPathLeft<T> = T
export type TrimPathRight<T> = T
export type { AnyRedirect, Redirect, RedirectOptions, ResolvedRedirect } from './redirect'
export type MatchLocation = any
export type UseNavigateResultType = NavigateFn
export type RouteContextFn = any
export type RouteContextOptions = any
export type BeforeLoadContextOptions = any
export type ContextOptions = any
export type FileBaseRouteOptions = any
export type BaseRouteOptions = any
export type UpdatableRouteOptions = any
export type RouteLoaderFn = any
export type LoaderFnContext = any
export type LazyRouteOptionsType = any
export type AnyRootRoute = AnyRoute
export type AsyncRouteComponent = any
export type RouteComponent = any
export type ErrorRouteComponent = any
export type NotFoundRouteComponent = any
export type DefaultRouteTypes = any
export type RouteTypes = any
export type ValidateFromPath = any
export type ValidateToPath = any
export type ValidateSearch = any
export type ValidateParams = any
export type InferFrom = any
export type InferTo = any
export type InferMaskTo = any
export type InferMaskFrom = any
export type ValidateNavigateOptions = any
export type ValidateNavigateOptionsArray = any
export type ValidateRedirectOptions = any
export type ValidateRedirectOptionsArray = any
export type ValidateId = any
export type InferStrict = any
export type InferShouldThrow = any
export type InferSelected = any
export type ValidateUseSearchResult = any
export type ValidateUseParamsResult = any
export type SerializerExtensions = any
export type RegisteredSerializableInput = any
export type Serializable = any
export type AnySerializationAdapter = any
export type SerializationAdapter = any
export type SerializableExtensions = any
export type LocationRewrite = {
  input?: LocationRewriteFunction
  output?: LocationRewriteFunction
}
export type LocationRewriteFunction = ({ url }: { url: URL }) => undefined | string | URL
export type Manifest = any
export type RouterManagedTag = any
export type ControlledPromise<T = any> = ControllablePromise<T>
export type Constrain<T, C> = T extends C ? T : C
export type Expand<T> = T
export type MergeAll<T> = T
export type Assign<A, B> = Omit<A, keyof B> & B
export type IntersectAssign<A, B> = A & B
export type SearchSerializer = (searchObj: Record<string, any>) => string
export type SearchParser = (searchStr: string) => Record<string, any>
export type SearchMiddleware = any
export type InferStructuralSharing = any
export type ValidateLinkOptions = any
export type ValidateUseSearchOptions = any
export type ValidateUseParamsOptions = any
export type ValidateLinkOptionsArray = any
export type RouteMatchExtensions = any
export type MakeRouteMatchFromRoute<T> = RouteMatch
export type AnyMatchAndValue = any
export type FindValueByIndex = any
export type FindValueByKey = any
export type CreateMatchAndValue = any
export type NextMatchAndValue = any
export type IsMatchKeyOf = any
export type IsMatchPath = any
export type IsMatchResult = any
export type IsMatchParse = any
export type IsMatch = any
export type DeferredPromiseState = any
export type DeferredPromise = Promise<any> & { deferredStatus?: string }
export type AddTrailingSlash<T> = T
export type AddLeadingSlash<T> = T
export type IsRequiredParams<T> = T
export type FindDescendantToPaths<T> = any
export type ResolveCurrentPath<T> = any
export type ResolveParentPath<T> = any
export type DeepPartial<T> = T
export type LooseReturnType<T> = any
export type LooseAsyncReturnType<T> = any
export type ContextReturnType<T> = any
export type ContextAsyncReturnType<T> = any
export type ResolveLoaderData<T> = any
export type ResolveRouteContext<T> = any
export type ResolveValidatorInput<T> = any
export type ResolveValidatorOutput<T> = any
export type ResolveValidatorInputFn<T> = any
export type ResolveValidatorOutputFn<T> = any
export type ResolveSearchValidatorInput<T> = any
export type ResolveSearchValidatorInputFn<T> = any
export type AnyValidator = any
export type DefaultValidator = any
export type ValidatorFn = any
export type AnySchema = any
export type AnyValidatorAdapter = any
export type AnyValidatorFn = any
export type AnyValidatorObj = any
export type Validator = any
export type ValidatorAdapter = any
export type ValidatorObj = any
export type FileRoutesByPathType = any
export type RootRouteOptions = any
export type CreateFileRouteType = any
export type AnyPathParams = Record<string, any>
export type SearchSchemaInput = any
export type AnyContext = any
export type RouteContext = any
export type PreloadableObj = any
export type RoutePathOptions = any
export type StaticDataRouteOption = any
export type RoutePathOptionsIntersection = any
export type UpdatableStaticRouteOption = any
export type MetaDescriptor = any
export type RouteLinkEntry = any
export type ParseParamsFn = any
export type SearchFilter = any
export type ResolveId<T> = any
export type InferFullSearchSchema<T> = any
export type InferFullSearchSchemaInput<T> = any
export type ErrorRouteProps = { error: unknown; reset: () => void }
export type ErrorComponentProps = ErrorRouteProps
export type NotFoundRouteProps = { data?: unknown }
export type StringifyParamsFn = any
export type ParamsOptions = any
export type InferAllParams<T> = any
export type InferAllContext<T> = any
export type RootRouteId = typeof rootRouteId
export type RouteByIdType = any
export type RegisteredConfigType<TRegister, TKey> = TRegister extends {
  config: infer TConfig
}
  ? TConfig extends {
      '~types': infer TTypes
    }
    ? TKey extends keyof TTypes
      ? TTypes[TKey]
      : unknown
    : unknown
  : unknown
export type DefaultRemountDepsFnType = any
export type RouterOptionsExtensionsType = any
export type UpdateFn = any
export type StartTransitionFn = (fn: () => void) => any
export type ViewTransitionOptions = any
export type RouterConstructorOptionsType = any
export type LinkOptionsType = any
export type UseLinkPropsOptions = any
export type ActiveLinkOptions = any
export type LinkProps = any
export type LinkComponent = any
export type LinkComponentProps = any
export type CreateLinkProps = any
export type UseMatchRouteOptions = any
export type MakeMatchRouteOptions = any
export type UseBlockerOpts = any
export type ShouldBlockFn = any
export type AwaitOptions = any
export type RouterProps = any
export type AnyRouteWithContext<T = any> = AnyRoute
