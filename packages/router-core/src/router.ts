import {
  createBrowserHistory,
  parseHref,
  type RouterHistory,
  type HistoryLocation,
} from '@anonrig/history'
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
import { isNotFound, notFound, type NotFoundError } from './not-found'
import { isServer } from './is-server'
import {
  loadClientRoute,
  loadRouteChunk,
  preloadClientRoute,
  refreshClientRoute,
  replaceRouteChunk,
} from './load-client'
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
  createControlledPromise,
  createLRUCache,
  decodePath,
  deepEqual,
  DEFAULT_PROTOCOL_ALLOWLIST,
  DEFAULT_PROTOCOL_SET,
  encodePathLikeUrl,
  functionalUpdate,
  isDangerousProtocol,
  isPromise,
  last,
  nullReplaceEqualDeep,
  replaceEqualDeep,
} from './utils'

export const trailingSlashOptions = {
  always: 'always',
  never: 'never',
  preserve: 'preserve',
} as const

export type TrailingSlashOption = (typeof trailingSlashOptions)[keyof typeof trailingSlashOptions]

export interface Register {
  router?: any
  config?: any
  ssr?: any
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

let matchSeq = 0
const EMPTY_OBJ: Record<string, any> = Object.freeze(Object.create(null))
const RESOLVED: Promise<void> = Promise.resolve()
let loadServerRouteCached: ((router: any, opts?: any) => void | Promise<void>) | undefined

function nextMatchId(routeId: string, pathname: string) {
  return `${routeId}-${pathname}-${++matchSeq}`
}

function lastMatch(matches: RouteMatch[] | undefined) {
  return matches && matches.length ? matches[matches.length - 1] : undefined
}

function applySearchValidator(route: AnyRoute, search: Record<string, any>) {
  const validator = route.options?.validateSearch
  if (!validator) return search
  try {
    const validated = validateSearch(validator, search)
    return validated && typeof validated === 'object' ? { ...search, ...validated } : search
  } catch (err: any) {
    if (err instanceof SearchParamError) throw err
    throw new SearchParamError(err?.message ?? String(err), { cause: err })
  }
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
  options!: RouterOptions<
    TRouteTree,
    TTrailingSlashOption,
    TDefaultStructuralSharingOption,
    TRouterHistory,
    TDehydrated
  >
  history!: TRouterHistory
  origin?: string
  latestLocation!: ParsedLocation
  basepath = '/'
  routeTree!: TRouteTree
  routesById!: Record<string, AnyRoute>
  routesByPath!: Record<string, AnyRoute>
  processedTree!: ProcessedTree
  private _resolvePathCache?: ReturnType<typeof createLRUCache<string, string>>
  get resolvePathCache() {
    return (this._resolvePathCache ??= createLRUCache<string, string>(1000))
  }
  isServer = typeof document === 'undefined'
  pathParamsDecoder?: (encoded: string) => string
  protocolAllowlist = DEFAULT_PROTOCOL_SET
  ssr: any = undefined
  serverSsr: any = undefined
  serverSsrLifecycle?: { onServerSsrAttach?: Array<(serverSsr: any) => void> }
  stores: any
  batch: (fn: () => void) => void = runNow
  _rendered: any[] | undefined
  _cache = new Map<string, any>()
  _matchesByPath?: Map<string, RouteMatch[]>
  _committed: any[] = []
  _tx?: any
  _flights?: Map<string, any>
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

  private createStores(location: ParsedLocation) {
    const config = defaultGetStoreConfig()
    this.batch = config.batch
    const stores = createRouterStores(location, config)
    const setMatches = stores.setMatches.bind(stores)
    const state = createStore<RouterState>({
      status: 'pending',
      isLoading: true,
      isTransitioning: false,
      matches: [],
      location,
      resolvedLocation: undefined,
      statusCode: 200,
    })
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
      if (current) state.set({ ...current, ...patch } as any)
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
    return Object.assign(stores, {
      state,
      matchRoute,
      setMatches: (nextMatches: any[]) => {
        setMatches(nextMatches)
        const current = state.get()
        if (current) {
          state.set({
            ...current,
            matches: nextMatches,
            location: locationStore.get(),
            resolvedLocation: stores.resolvedLocation.get(),
            status: stores.status.get(),
            isLoading: stores.status.get() === 'pending',
          })
        }
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

  private loadId = 0
  private unsubHistory?: () => void
  private _committing = false

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
    this.options = { ...this.options, ...newOptions } as any
    this.isServer = this.options.isServer ?? typeof document === 'undefined'
    if (
      this.options.protocolAllowlist &&
      this.options.protocolAllowlist !== DEFAULT_PROTOCOL_ALLOWLIST
    ) {
      this.protocolAllowlist = new Set(this.options.protocolAllowlist)
    }

    if (this.options.pathParamsAllowedCharacters) {
      this.pathParamsDecoder = compileDecodeCharMap(this.options.pathParamsAllowedCharacters)
    }

    if (!this.history || (this.options.history && this.options.history !== this.history)) {
      if (this.options.history) this.history = this.options.history as TRouterHistory
      else if (!this.isServer) this.history = createBrowserHistory() as TRouterHistory
    }

    this.origin =
      this.options.origin ??
      (!this.isServer && typeof window !== 'undefined' && window.origin && window.origin !== 'null'
        ? window.origin
        : 'http://localhost')

    if (this.options.routeTree && this.options.routeTree !== prevTree) {
      this.routeTree = this.options.routeTree as TRouteTree
      this.processedTree = processRouteTree(
        this.routeTree as any,
        this.options.caseSensitive ?? false,
      )
      this.routesById = this.processedTree.routesById as any
      this.routesByPath = this.processedTree.routesByPath as any
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
          if (this._committing) return
          this.latestLocation = this.parseLocation(location, this.latestLocation)
          void this.load({ action })
        })
      }
    }

    return this
  }

  buildRouteTree() {
    if (!this.routeTree) return this
    this.processedTree = processRouteTree(
      this.routeTree as any,
      this.options.caseSensitive ?? false,
    )
    this.routesById = this.processedTree.routesById as any
    this.routesByPath = this.processedTree.routesByPath as any
    this._hasSearchWork = !!this.processedTree.hasSearchWork
    return this
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
    const dest = opts
    const current =
      dest._fromLocation || this._pendingLocation || this.latestLocation || this.state?.location
    const matches = this.stores?.matches?.get?.()?.length
      ? this.stores.matches.get()
      : this.state?.matches?.length
        ? this.state.matches
        : this._committed
    const currentMatch = lastMatch(matches)
    const { resolved, destRouteHint } = resolveBuildPath(this, dest, current, currentMatch)
    const nextSearch = resolveBuildSearch(this, dest, current, resolved)
    const searchStr = (this.options.stringifySearch ?? defaultStringifySearch)(
      nextSearch ?? EMPTY_OBJ,
    )
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
      this.history[historyAction === 'REPLACE' ? 'replace' : 'push'](
        nextHistory.publicHref || nextHistory.href,
        nextHistory.state,
        { ignoreBlocker },
      )
      if (!this.history.subscribers?.size) {
        this.load({ action: { type: historyAction } })
      }
    }

    this._scroll.next = resetScroll ?? true
    return this._commitPromise
  }

  private redirectHops = 0

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
      !this._hasSearchWork &&
      !this.options.routeMasks?.length &&
      rest.search == null &&
      rest.params == null &&
      rest.hash == null &&
      rest.mask == null &&
      rest.from == null &&
      !rest._isRedirect
    ) {
      return this.navigateHrefFast(href, rest)
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
    const invalidIds = new Set(
      [
        ...committedMatches,
        ...this._cache.values(),
        ...[...(preloads?.values() ?? [])].flat(),
        ...(this._tx?.[3] ?? []),
      ]
        .filter((match) => !filter || filter(match as any))
        .map((match) => match.id),
    )
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
    for (const [id, match] of this._cache) {
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

  clearCache(opts?: Parameters<ClearCacheFn<this>>[0]) {
    this._matchesByPath?.clear()
    const cached = this._cache
    const preloads = this._preloads
    const filter = opts?.filter
    const discarded: Array<RouteMatch> = []
    const discardedIds: Array<string> = []
    for (const [id, match] of cached) {
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
    for (const id of discardedIds) cached.delete(id)
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

  async load(opts?: { sync?: boolean; _signal?: AbortSignal; action?: any }): Promise<void> {
    this.updateLatestLocation()
    if (isServer || this.isServer) {
      if (opts?._signal?.aborted) {
        throw opts._signal.reason
      }
      // Request-scoped SSR passes `_signal` and must re-run. A warm
      // `load()` on an already-idle server router (the Node bench) can skip.
      if (!opts?.action && !opts?._signal && this.canSkipSettledLoad()) {
        this._commitPromise?.resolve()
        this._commitPromise = undefined
        return
      }
      return this.importLoadServer(opts)
    }
    if (!opts?.action && this.canSkipSettledLoad()) {
      this._commitPromise?.resolve()
      this._commitPromise = undefined
      return
    }
    await loadClientRoute(this, opts)
  }

  private importLoadServer(opts?: { sync?: boolean; _signal?: AbortSignal; action?: any }) {
    if (loadServerRouteCached) return loadServerRouteCached(this, opts)
    return import('./load-server').then(({ loadServerRoute }) => {
      loadServerRouteCached = loadServerRoute
      return loadServerRoute(this, opts)
    })
  }

  private canSkipSettledLoad(): boolean {
    if (this._handoff || this._tx || this._refreshNextLoad || this._forcePending) return false
    if ((this as any).forceOnLatestPrefetch) return false
    if (this.stores?.status?.get() !== 'idle') return false
    const resolved = this.stores.resolvedLocation.get()
    if (!resolved || resolved.href !== this.latestLocation.href) return false
    const matches = this.stores.matches.get()
    if (!matches?.length) return false
    for (let i = 0; i < matches.length; i++) {
      const match = matches[i]!
      if (match.status !== 'success' || match.invalid || match.isFetching) return false
      const shouldReload = this.routesById[match.routeId]?.options?.shouldReload
      if (shouldReload === true || typeof shouldReload === 'function') return false
    }
    return true
  }

  private navigateHrefFast(href: string, rest: any): Promise<void> {
    const currentIndex = this.history.location.state?.__TSR_index
    const parsed = parseHref(href, {
      __TSR_index: rest.replace ? currentIndex : (currentIndex ?? 0) + 1,
    })
    const searchStr = parsed.search
    const hashRaw = parsed.hash
    const hash = !hashRaw ? '' : hashRaw.charCodeAt(0) === 35 ? hashRaw.slice(1) : hashRaw
    const hashStr = hash ? `#${hash}` : ''
    const pathname = parsed.pathname
    const hrefFull = `${pathname}${searchStr}${hashStr}`
    const location: ParsedLocation = {
      href: hrefFull,
      publicHref: hrefFull,
      pathname,
      search: searchStr
        ? (this.options.parseSearch ?? defaultParseSearch)(searchStr)
        : Object.create(null),
      searchStr,
      hash,
      state: parsed.state ?? {},
      external: false,
    }

    const prev = this.latestLocation
    const same =
      prev && prev.pathname === pathname && prev.searchStr === searchStr && prev.hash === hash

    this.latestLocation = location
    this._pendingLocation = location

    if (!same) {
      this._committing = true
      this.history[rest.replace ? 'replace' : 'push'](hrefFull, location.state, {
        ignoreBlocker: rest.ignoreBlocker,
      })
      this.history.flush?.()
      this._committing = false
    }

    const id = ++this.loadId
    const loaded = this.runLoad(location, id)
    if (isPromise(loaded)) {
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

  private finishHrefNav(location: ParsedLocation) {
    if (this._pendingLocation === location) this._pendingLocation = undefined
    this._commitPromise?.resolve()
    this._commitPromise = undefined
  }

  private runLoad(location: ParsedLocation, id: number): void | Promise<void> {
    const warm = this.tryWarmLoad(location, id)
    if (warm === true) return
    if (warm) return warm
    return this.runLoadFallback(location, id)
  }

  private tryWarmLoad(location: ParsedLocation, id: number): boolean | Promise<void> {
    if (this._forcePending || this._handoff || this._tx || this._refreshNextLoad) return false

    const cacheKey = location.searchStr
      ? `${location.pathname}\0${location.searchStr}`
      : location.pathname
    const cached = this._matchesByPath?.get(cacheKey)
    if (cached && this.canReuseWarmMatches(cached)) {
      if (this.subscribers.size) {
        this.emit({
          type: 'onBeforeLoad',
          fromLocation: this.stores.resolvedLocation.get(),
          toLocation: location,
        })
      }
      this.completeWarmLoad(location, cached)
      return true
    }

    const found = findRouteMatch(
      this.processedTree,
      location.pathname,
      this.options.caseSensitive ?? false,
    )
    if (!found) return false

    for (let i = 0; i < found.length; i++) {
      const route = found[i]!.route as AnyRoute
      if ((route.lazyFn && !route._lazy) || route.options.beforeLoad) return false
    }

    if (this.subscribers.size) {
      this.emit({
        type: 'onBeforeLoad',
        fromLocation: this.stores.resolvedLocation.get(),
        toLocation: location,
      })
    }

    const prevMatches = this._committed
    const prevByRoute = prevMatches.length > 4 ? null : prevMatches
    const prevMap = prevMatches.length > 4 ? new Map<string, RouteMatch>() : null
    if (prevMap) {
      for (let i = 0; i < prevMatches.length; i++) {
        const prev = prevMatches[i]!
        prevMap.set(prev.routeId, prev)
      }
    }

    const routerContext = this.options.context
    const context = routerContext ? { ...routerContext } : EMPTY_OBJ
    const matches: RouteMatch[] = new Array(found.length)

    for (let i = 0; i < found.length; i++) {
      const result = found[i]!
      const prev = prevMap
        ? prevMap.get(result.route.id)
        : findPrevMatch(prevByRoute!, result.route.id)
      const sameParams = prev && deepEqual(prev.params, result.params)
      const samePath = prev && prev.pathname === location.pathname
      if (prev && sameParams && samePath && !prev.invalid) {
        prev.search = location.search
        prev.cause = 'stay'
        prev.publicHref = location.publicHref
        prev._forcePending = prev._forcePending || this._forcePending
        matches[i] = prev
        continue
      }
      const route = result.route as AnyRoute
      const options = route.options
      const needsLoad = !!options.loader
      matches[i] = {
        id: `${result.route.id}-${location.pathname}`,
        routeId: result.route.id,
        route,
        pathname: location.pathname,
        params: result.params,
        rawParams: result.rawParams,
        status: needsLoad ? 'pending' : 'success',
        isFetching: needsLoad ? 'loader' : false,
        context,
        search: location.search,
        updatedAt: 0,
        abortController: needsLoad ? new AbortController() : noopAbortController,
        cause: prev ? ('stay' as const) : ('enter' as const),
        invalid: false,
        _forcePending: this._forcePending || prev?._forcePending,
        publicHref: location.publicHref,
      } as RouteMatch
    }

    const next = this.finishWarmMatches(location, id, matches, cacheKey, 0, context)
    return next ?? true
  }

  private finishWarmMatches(
    location: ParsedLocation,
    id: number,
    matches: RouteMatch[],
    cacheKey: string,
    start: number,
    context: Record<string, any>,
  ): void | Promise<void> {
    for (let i = start; i < matches.length; i++) {
      if (id !== this.loadId) return
      const match = matches[i]!
      const route = this.routesById[match.routeId]!
      const opts = route.options
      if (match.status === 'success' && match.cause === 'stay' && !match.invalid) {
        match.context = context
        continue
      }
      if (!opts.loader) {
        match.context = context
        match.status = 'success'
        match.isFetching = false
        const hook = match.cause === 'enter' ? opts.onEnter : opts.onStay
        if (hook) {
          hook({
            abortController: match.abortController,
            preload: false,
            params: match.params,
            rawParams: match.rawParams,
            cause: match.cause,
            location,
            navigate: this.navigate,
            search: match.search,
            context,
            route,
            matches,
          } as any)
        }
        continue
      }

      const loaderContext = {
        abortController: match.abortController,
        preload: false,
        params: match.params,
        rawParams: match.rawParams,
        cause: match.cause,
        location,
        navigate: this.navigate,
        search: match.search,
        context,
        route,
        matches,
      }
      try {
        const data = opts.loader(loaderContext)
        if (isPromise(data)) {
          return Promise.resolve(data).then((value) => {
            if (isRedirect(value) || isNotFound(value)) {
              return this.runLoadFallback(location, id)
            }
            match.loaderData = value
            match.status = 'success'
            match.isFetching = false
            match.context = context
            this._cache.set(match.id, { data: value, updatedAt: 0 })
            return this.finishWarmMatches(location, id, matches, cacheKey, i + 1, context)
          })
        }
        if (isRedirect(data) || isNotFound(data)) return this.runLoadFallback(location, id)
        match.loaderData = data
        match.status = 'success'
        match.isFetching = false
        match.context = context
        this._cache.set(match.id, { data, updatedAt: 0 })
        if (match.cause === 'enter') opts.onEnter?.(loaderContext as any)
        else opts.onStay?.(loaderContext as any)
      } catch {
        return this.runLoadFallback(location, id)
      }
    }

    if (id !== this.loadId) return
    this.leaveWarmMatches(matches)
    this.completeWarmLoad(location, matches)
    rememberWarmMatches(this, cacheKey, matches)
  }

  private canReuseWarmMatches(matches: RouteMatch[]) {
    for (let i = 0; i < matches.length; i++) {
      const match = matches[i]!
      if (match.status !== 'success' || match.invalid || match.isFetching) return false
      const route = this.routesById[match.routeId]
      const shouldReload = route?.options?.shouldReload
      if (shouldReload === true || typeof shouldReload === 'function') return false
      if ((route?.lazyFn && !route._lazy) || route?.options?.beforeLoad) return false
    }
    return true
  }

  private leaveWarmMatches(matches: RouteMatch[]) {
    const prevMatches = this._committed
    for (let i = 0; i < prevMatches.length; i++) {
      const left = prevMatches[i]!
      const hook = this.routesById[left.routeId]?.options.onLeave
      if (!hook) continue
      let still = false
      for (let j = 0; j < matches.length; j++) {
        if (matches[j]!.routeId === left.routeId) {
          still = true
          break
        }
      }
      if (still) continue
      hook({
        params: left.params,
        search: left.search,
        context: left.context,
        cause: 'leave',
      } as any)
    }
  }

  private completeWarmLoad(location: ParsedLocation, matches: RouteMatch[]) {
    let statusCode = 200
    for (let i = 0; i < matches.length; i++) {
      const status = matches[i]!.status
      if (status === 'notFound') {
        statusCode = 404
        break
      }
      if (status === 'error') statusCode = 500
    }
    const prevResolved = this.stores.resolvedLocation.get()
    this._committed = matches
    for (let i = 0; i < matches.length; i++) {
      this._cache.set(matches[i]!.id, matches[i]!)
    }
    this.stores.status.set('idle')
    this.stores.location.set(location)
    this.stores.resolvedLocation.set(location)
    this.stores.setMatches(matches)
    this.stores.state.set({
      status: 'idle',
      isLoading: false,
      isTransitioning: false,
      matches,
      pendingMatches: undefined,
      location,
      resolvedLocation: location,
      statusCode,
    })
    this.redirectHops = 0
    if (this.subscribers.size) {
      const change = getLocationChangeInfo(location, prevResolved)
      this.emit({ type: 'onLoad', ...change })
      this.emit({ type: 'onResolved', ...change })
      this.emit({ type: 'onRendered', ...change })
    }
    const rendered = this._rendered
    if (rendered?.[1]) {
      const settle = rendered[1]
      rendered.length = 0
      settle(true)
    }
  }

  private async runLoadFallback(location: ParsedLocation, id: number): Promise<void> {
    this.emit({
      type: 'onBeforeLoad',
      fromLocation: this.state.resolvedLocation,
      toLocation: location,
    })

    const found = findRouteMatch(
      this.processedTree,
      location.pathname,
      this.options.caseSensitive ?? false,
    )

    let matchResults = found
    let notFoundError: NotFoundError | undefined
    if (!matchResults) {
      notFoundError = notFound({ _global: true })
      matchResults = [
        {
          route: this.routesById[rootRouteId] as any,
          params: {},
          rawParams: {},
        },
      ]
    }

    const prevMatches = this.state.matches ?? []
    const prevByRoute = new Map<string, RouteMatch>()
    for (let i = 0; i < prevMatches.length; i++) {
      const prev = prevMatches[i]!
      prevByRoute.set(prev.routeId, prev)
    }

    const matches: RouteMatch[] = new Array(matchResults.length)
    for (let i = 0; i < matchResults.length; i++) {
      const result = matchResults[i]!
      const prev = prevByRoute.get(result.route.id)
      const sameParams = prev && deepEqual(prev.params, result.params)
      const samePath = prev && prev.pathname === location.pathname
      if (prev && sameParams && samePath && !prev.invalid) {
        prev.search = location.search
        prev.cause = 'stay'
        if (!prev.abortController || prev.abortController.signal.aborted) {
          prev.abortController = new AbortController()
        }
        prev._forcePending = prev._forcePending || this._forcePending
        prev.publicHref = location.publicHref
        matches[i] = prev
        continue
      }
      const route = result.route as AnyRoute
      const routerContext = this.options.context
      matches[i] = {
        id: nextMatchId(result.route.id, location.pathname),
        routeId: result.route.id,
        route,
        pathname: location.pathname,
        params: result.params,
        rawParams: result.rawParams,
        status: 'pending' as const,
        isFetching: 'loader',
        context: routerContext ? { ...routerContext } : EMPTY_OBJ,
        search: location.search,
        updatedAt: Date.now(),
        abortController: new AbortController(),
        cause: prev ? ('stay' as const) : ('enter' as const),
        invalid: false,
        _forcePending: this._forcePending || prev?._forcePending,
        meta:
          (route.options as any).head?.({
            matches: [],
            match: undefined,
            params: result.params,
            loaderData: undefined,
          }) ?? (route.options as any).meta,
        links: (route.options as any).links,
        scripts: (route.options as any).scripts,
        headScripts: (route.options as any).headScripts,
        styles: (route.options as any).styles,
        publicHref: location.publicHref,
      } as RouteMatch
    }

    if (notFoundError) {
      const lastMatch = last(matches)
      if (lastMatch) {
        lastMatch.status = 'notFound'
        lastMatch.notFoundError = notFoundError
        lastMatch.globalNotFound = true
      }
    }

    let needsAsync = false
    for (let i = 0; i < matches.length; i++) {
      const route = this.routesById[matches[i]!.routeId]!
      const options = route.options
      if ((route.lazyFn && !route._lazy) || options.beforeLoad || options.loader) {
        needsAsync = true
        break
      }
    }
    if (needsAsync) {
      this.stores.state.set({
        ...this.state,
        status: 'pending',
        isLoading: true,
        isTransitioning: true,
        pendingMatches: matches,
        location,
      })
    }

    const routerContext = this.options.context
    let context: Record<string, any> = routerContext ? { ...routerContext } : EMPTY_OBJ
    const parentPromises: Promise<void>[] = []

    for (let i = 0; i < matches.length; i++) {
      if (id !== this.loadId) return
      const match = matches[i]!
      const route = this.routesById[match.routeId]!
      const parentPromise = parentPromises[i - 1]
      const opts = route.options
      const needsAsync = (route.lazyFn && !route._lazy) || opts.beforeLoad || opts.loader
      let finish: ReturnType<typeof createControlledPromise<void>> | undefined

      try {
        let search = location.search
        try {
          search = applySearchValidator(route, location.search)
          match.search =
            search === location.search ? location.search : { ...location.search, ...search }
        } catch (err) {
          match.searchError = err
          match.search = location.search
        }

        if (!needsAsync) {
          match.context = context
          match.status = 'success'
          match._forcePending = false
          match.isFetching = false
          match.updatedAt = Date.now()
          const hook = match.cause === 'enter' ? opts.onEnter : opts.onStay
          if (hook) {
            hook({
              abortController: match.abortController,
              preload: false,
              params: match.params,
              rawParams: match.rawParams,
              cause: match.cause,
              location,
              navigate: this.navigate,
              search: match.search,
              context,
              route,
              matches,
              parentMatchPromise: parentPromise,
            } as any)
          }
          parentPromises.push(RESOLVED)
          continue
        }

        finish = createControlledPromise<void>()
        parentPromises.push(finish)

        const loaderContext = {
          abortController: match.abortController,
          preload: false,
          params: match.params,
          rawParams: match.rawParams,
          cause: match.cause,
          location,
          navigate: this.navigate,
          search: match.search,
          context,
          route,
          matches,
          parentMatchPromise: parentPromise,
        }

        if (route.lazyFn && !route._lazy) {
          const lazyMod = (await route.lazyFn()) as any
          const lazyRoute = lazyMod?.default ?? lazyMod
          if (lazyRoute?.options) Object.assign(route.options, lazyRoute.options)
          route._lazy = true
        }

        if (route.options.beforeLoad) {
          const before = await route.options.beforeLoad(loaderContext)
          if (isRedirect(before)) throw before
          if (isNotFound(before)) throw before
          if (before && typeof before === 'object') {
            context = { ...context, ...before }
          }
        }
        match.context = context

        if (route.options.loader) {
          loaderContext.context = context
          const data = await route.options.loader(loaderContext)
          if (isRedirect(data)) throw data
          if (isNotFound(data)) throw data
          match.loaderData = data
          this._cache.set(match.id, { data, updatedAt: Date.now() })
        }

        match.status = 'success'
        match._forcePending = false
        match.isFetching = false
        match.updatedAt = Date.now()

        loaderContext.context = context
        if (match.cause === 'enter') route.options.onEnter?.(loaderContext as any)
        else route.options.onStay?.(loaderContext as any)

        finish.resolve()
      } catch (err) {
        if (isRedirect(err)) {
          match.status = 'redirected' as RouteMatch['status']
          match.isFetching = false
          finish?.resolve()
          if (id !== this.loadId) return
          const dest = err.options
          if (dest.href && dest.reloadDocument) {
            if (typeof document !== 'undefined') window.location.assign(dest.href)
            return
          }
          this.redirectHops++
          if (this.redirectHops > 20) {
            this.redirectHops = 0
            match.status = 'error'
            match.error = new Error('Redirect loop detected')
            match.isFetching = false
            continue
          }
          await this.navigate({ ...dest, replace: dest.replace ?? true })
          this.redirectHops = 0
          return
        }
        if (isNotFound(err)) {
          match.status = 'notFound'
          match.notFoundError = err
          match.isFetching = false
          finish?.resolve()
          continue
        }
        match.status = 'error'
        match.error = err
        match.isFetching = false
        route.options.onCatch?.(err as Error)
        finish?.resolve()
      }
    }

    if (id !== this.loadId) return

    for (let i = 0; i < prevMatches.length; i++) {
      const left = prevMatches[i]!
      let still = false
      for (let j = 0; j < matches.length; j++) {
        if (matches[j]!.routeId === left.routeId) {
          still = true
          break
        }
      }
      if (still) continue
      this.routesById[left.routeId]?.options.onLeave?.({
        params: left.params,
        search: left.search,
        context: left.context,
        cause: 'leave',
      } as any)
    }

    let statusCode = 200
    for (let i = 0; i < matches.length; i++) {
      const status = matches[i]!.status
      if (status === 'notFound') {
        statusCode = 404
        break
      }
      if (status === 'error') statusCode = 500
    }
    const prevResolved = this.state.resolvedLocation
    this.stores.state.set({
      status: 'idle',
      isLoading: false,
      isTransitioning: false,
      matches,
      pendingMatches: undefined,
      location,
      resolvedLocation: location,
      statusCode,
    })

    this.redirectHops = 0
    this._committed = matches
    for (let i = 0; i < matches.length; i++) {
      this._cache.set(matches[i]!.id, matches[i]!)
    }
    const change = getLocationChangeInfo(location, prevResolved)
    this.emit({ type: 'onLoad', ...change })
    this.emit({ type: 'onResolved', ...change })
    this.emit({ type: 'onRendered', ...change })
    const rendered = this._rendered
    if (rendered?.[1]) {
      const settle = rendered[1]
      rendered.length = 0
      settle(true)
    }
  }

  getMatchedRoutes(pathname: string) {
    const path = trimPathRight(pathname || '/')
    const cache = this.processedTree.matchedRoutesCache
    const cached = cache?.get(path)
    if (cached) return cached

    const exact = findRouteMatchFromTree(
      this.processedTree,
      path,
      this.options.caseSensitive ?? false,
    )
    let result: readonly [any[], Record<string, any>, any]
    if (exact?.length) {
      const last = exact[exact.length - 1]!
      const branch = buildRouteBranch(last.route as AnyRoute)
      result = [
        branch.length ? branch : exact.map((item) => item.route),
        last.rawParams,
        last.route,
      ]
    } else {
      const match = findRouteMatch(path, this.processedTree, true)
      result = match
        ? [match.branch || [this.routesById[rootRouteId]!], match.rawParams, match.route]
        : [[this.routesById[rootRouteId]!], Object.create(null), undefined]
    }
    cache?.set(path, result)
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
      const url = URL.parse(locationHeader)
      if (url && this.origin && url.origin === this.origin) {
        const href = url.pathname + url.search + url.hash
        redirect.options.href = href
        redirect.headers.set('Location', href)
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
    return preloadClientRoute(this, opts)
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
    if (typeof pathnameOrNext === 'string') {
      return this.matchRoutesInternal(
        { pathname: pathnameOrNext, search: locationSearchOrOpts } as ParsedLocation,
        opts,
      )
    }
    return this.matchRoutesInternal(pathnameOrNext, locationSearchOrOpts)
  }

  private matchRoutesInternal(next: ParsedLocation, opts?: any): RouteMatch[] {
    const templateCache = this.processedTree.matchedTemplateCache
    if (
      templateCache &&
      !this._hasSearchWork &&
      !next.searchStr &&
      !opts?.throwOnError &&
      !opts?._rematerialize &&
      !opts?._controller
    ) {
      const cached = templateCache.get(next.pathname)
      if (cached) return cloneCachedMatches(cached)
    }

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
          server: this.isServer,
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
        process.env.NODE_ENV !== 'production' && opts?._rematerialize
          ? undefined
          : (this._cache.get(matchId) ??
            (previousMatch?.id === matchId ? previousMatch : undefined))

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

    if (
      templateCache &&
      !this._hasSearchWork &&
      !next.searchStr &&
      !opts?.throwOnError &&
      !opts?._rematerialize &&
      !opts?._controller
    ) {
      const snapshot = new Array(matches.length)
      for (let i = 0; i < matches.length; i++) snapshot[i] = { ...matches[i] }
      templateCache.set(next.pathname, snapshot)
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
    href,
    ...rest
  }: NavigateOptions & CommitLocationOptions & { _redirects?: number; href?: string } = {}) {
    if (href) {
      const currentIndex = this.history.location.state?.__TSR_index
      const parsed = parseHref(href, {
        __TSR_index: replace ? currentIndex : (currentIndex ?? 0) + 1,
      })
      if (this.rewrite) {
        const hrefUrl = new URL(parsed.pathname, this.origin)
        const rewrittenUrl = executeRewriteInput(this.rewrite, hrefUrl)
        rest.to = rewrittenUrl.pathname
      } else {
        rest.to = parsed.pathname
      }
      rest.search = (this.options.parseSearch ?? defaultParseSearch)(parsed.search)
      rest.hash = (parsed.hash || '').replace(/^#/, '')
    }

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
    to = dest.params
      ? (fromRoute?.fullPath ?? current?.pathname ?? fromPath)
      : dest.from
        ? fromPath
        : (current?.pathname ?? fromPath)
  }
  if (typeof to !== 'string') to = current?.pathname ?? '/'

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

  const destRouteHint =
    typeof to === 'string' ? router.routesByPath?.[trimPathRight(to)] : undefined
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

  let interpolated = to
  if (!dest.leaveParams && typeof to === 'string' && to.includes('$')) {
    interpolated = interpolatePath({
      path: to,
      params: nextParams ?? EMPTY_OBJ,
      decoder: router.pathParamsDecoder,
    }).interpolatedPath
  } else if (dest.params && !dest.to && !dest.leaveParams) {
    const template = currentMatch ? router.routesById[currentMatch.routeId]?.fullPath : undefined
    if (template) {
      interpolated = interpolatePath({
        path: template,
        params: nextParams ?? EMPTY_OBJ,
        decoder: router.pathParamsDecoder,
      }).interpolatedPath
    }
  }

  const interpolatedInput = interpolated
  let resolved = resolvePath({
    base: fromPath || '/',
    to: interpolated || '/',
    trailingSlash: (router.options.trailingSlash as any) ?? 'never',
    cache: router.resolvePathCache,
  })
  if (resolved !== interpolatedInput && resolved.includes('$')) {
    resolved = interpolatePath({
      path: resolved,
      params: nextParams ?? EMPTY_OBJ,
      decoder: router.pathParamsDecoder,
    }).interpolatedPath
  }
  return { resolved, destRouteHint }
}

function resolveBuildSearch(
  router: any,
  dest: any,
  current: ParsedLocation | undefined,
  resolved: string,
) {
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
      dest._includeValidateSearch,
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
    return validatedSearch
  }
  return nextSearch
}

function resolveBuildHash(dest: any, current: ParsedLocation | undefined) {
  const currentHash = (current?.hash ?? '').replace(/^#/, '')
  let hash =
    dest.hash === true
      ? currentHash
      : dest.hash
        ? typeof dest.hash === 'function'
          ? dest.hash(currentHash)
          : typeof dest.hash === 'string'
            ? dest.hash.replace(/^#/, '')
            : String(dest.hash)
        : dest.to
          ? ''
          : currentHash
  if (typeof hash !== 'string') hash = String(hash ?? '')
  return hash
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

function cloneCachedMatches(cached: RouteMatch[]): RouteMatch[] {
  const now = Date.now()
  const out = new Array(cached.length)
  for (let i = 0; i < cached.length; i++) {
    const match = cached[i]!
    out[i] = {
      ...match,
      updatedAt: now,
      abortController: routeNeedsLoad(match.route as AnyRoute)
        ? new AbortController()
        : noopAbortController,
      context: {},
      isFetching: false,
    }
  }
  return out
}

function isPlainAsciiPath(path: string) {
  for (let i = 0; i < path.length; i++) {
    const c = path.charCodeAt(i)
    if (c <= 0x1f || c === 0x20 || c === 0x7f || c > 0x7f) return false
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
    const hashValue = !hash ? '' : hash.charCodeAt(0) === 35 ? hash.slice(1) : hash
    const pathname = decodePath(location.pathname).path
    const encodedPath = encodePathLikeUrl(pathname)
    if (!location.search && parseSearch === defaultParseSearch) {
      const href = hash ? encodedPath + hash : encodedPath
      return {
        href,
        publicHref: href,
        pathname,
        external: false,
        searchStr: '',
        search: Object.create(null),
        hash: hashValue,
        state: previous ? replaceEqualDeep(previous.state, location.state) : location.state,
      }
    }
    const parsedSearch = parseSearch(location.search)
    const searchStr = stringifySearch(parsedSearch)
    return {
      href: encodedPath + searchStr + hash,
      publicHref: encodedPath + searchStr + hash,
      pathname,
      external: false,
      searchStr,
      search: nullReplaceEqualDeep(previous?.search, parsedSearch),
      hash: hashValue,
      state: previous ? replaceEqualDeep(previous.state, location.state) : location.state,
    }
  }
  const fullUrl = new URL(location.href, router.origin)
  const url = executeRewriteInput(router.rewrite, fullUrl)
  const parsedSearch = parseSearch(url.search)
  const searchStr = stringifySearch(parsedSearch)
  const pathname = decodePath(url.pathname).path
  const hashValue = decodePath(url.hash.replace(/^#/, '')).path
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

const WARM_MATCH_CACHE_MAX = 64

function findPrevMatch(matches: RouteMatch[], routeId: string) {
  for (let i = 0; i < matches.length; i++) {
    if (matches[i]!.routeId === routeId) return matches[i]
  }
  return undefined
}

function rememberWarmMatches(
  router: { _matchesByPath?: Map<string, RouteMatch[]> },
  key: string,
  matches: RouteMatch[],
) {
  const cache = (router._matchesByPath ??= new Map())
  if (cache.size >= WARM_MATCH_CACHE_MAX && !cache.has(key)) {
    const first = cache.keys().next().value
    if (first !== undefined) cache.delete(first)
  }
  cache.set(key, matches)
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
