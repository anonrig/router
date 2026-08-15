// @ts-nocheck — runtime implementation; public types live in Matches/link/route modules
import {
  createBrowserHistory,
  parseHref,
  type RouterHistory,
  type HistoryLocation,
} from '@anonrig/history'
import {
  findFlatMatch,
  findRouteMatch,
  processRouteMasks,
  processRouteTree,
  type ProcessedTree,
} from './match'
import { isNotFound, notFound, type NotFoundError } from './not-found'
import { compileDecodeCharMap, interpolatePath, resolvePath } from './path'
import { isRedirect, type AnyRedirect } from './redirect'
import { rootRouteId } from './root'
import type { AnyContext, AnyRoute } from './route'
import { defaultParseSearch, defaultStringifySearch } from './search-params'
import { createStore } from './store'
import {
  createControlledPromise,
  createLRUCache,
  deepEqual,
  DEFAULT_PROTOCOL_ALLOWLIST,
  encodePathLikeUrl,
  functionalUpdate,
  last,
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
  AnyContext extends InferRouterContext<TRouteTree>
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
  scrollRestoration?: boolean
  scrollRestorationBehavior?: ScrollBehavior
  getScrollRestorationKey?: (location: any) => string
  serializer?: any
  serializationAdapters?: any[]
  routeMasks?: any[]
  hydrate?: (data: any) => any
}

export type ParsedLocation<TSearch = any> = HistoryLocation & {
  search: TSearch
  searchStr: string
  state: any
  publicHref?: string
  external?: boolean
  maskedLocation?: ParsedLocation<TSearch>
  unmaskOnReload?: boolean
}

export type AnyRouteMatch = RouteMatch
export type MakeRouteMatch = RouteMatch
export type MakeRouteMatchUnion = RouteMatch
export type RouteMatch = {
  id: string
  routeId: string
  pathname: string
  params: Record<string, any>
  rawParams: Record<string, any>
  status: 'pending' | 'success' | 'error' | 'redirected' | 'notFound'
  isFetching: boolean
  error?: unknown
  loadPromise?: Promise<void>
  loaderData?: any
  context: Record<string, any>
  search: Record<string, any>
  searchError?: unknown
  updatedAt: number
  abortController: AbortController
  cause: 'enter' | 'stay' | 'preload'
  invalid: boolean
  preload?: boolean
  ssr?: boolean | 'data-only'
  globalNotFound?: boolean
  notFoundError?: NotFoundError
  errorInfo?: any
  _forcePending?: boolean
  _assetEnd?: number
  _notFound?: boolean
  route?: AnyRoute
  meta?: any[]
  links?: any[]
  scripts?: any[]
  headScripts?: any[]
  styles?: any[]
  publicHref?: string
}

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
  resolvedLocation: import('./location').ParsedLocation<
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
}

export type ToOptions = NavigateOptions
export type MatchRouteOptions = {
  pending?: boolean
  caseSensitive?: boolean
  fuzzy?: boolean
  includeSearch?: boolean
}

export type BuildNextOptions = NavigateOptions & { from?: string }
export type CommitLocationOptions = { replace?: boolean; ignoreBlocker?: boolean }
export type { NavigateFn, BuildLocationFn } from './router-provider'

export type RouterEvent = { type: string; [key: string]: any }
export type RouterEvents = Record<string, RouterEvent>
export type RouterListener = (event: RouterEvent) => void
export type ListenerFn = RouterListener

let matchSeq = 0
const EMPTY_OBJ: Record<string, any> = Object.freeze(Object.create(null))
const RESOLVED: Promise<void> = Promise.resolve()

function nextMatchId(routeId: string, pathname: string) {
  return `${routeId}-${pathname}-${++matchSeq}`
}

function lastMatch(matches: RouteMatch[] | undefined) {
  return matches && matches.length ? matches[matches.length - 1] : undefined
}

function parseLocationFromHistory(
  historyLocation: HistoryLocation,
  parseSearch: (s: string) => any,
  previous?: ParsedLocation,
): ParsedLocation {
  const searchStr = historyLocation.search || ''
  const hash = historyLocation.hash || ''
  const publicHref = encodePathLikeUrl(`${historyLocation.pathname}${searchStr}${hash}`)
  return {
    href: historyLocation.href,
    pathname: historyLocation.pathname,
    search: parseSearch(searchStr),
    searchStr,
    hash,
    state: replaceEqualDeep(previous?.state, historyLocation.state),
    publicHref,
  }
}

function applySearchValidator(route: AnyRoute, search: Record<string, any>) {
  const validator = route.options.validateSearch ?? route.options.search
  if (!validator) return search
  if (typeof validator === 'function') return validator(search) ?? search
  if (typeof validator.parse === 'function') return validator.parse(search)
  if (typeof validator === 'object' && typeof (validator as any).safeParse === 'function') {
    const result = (validator as any).safeParse(search)
    if (result.success) return result.data
    throw result.error
  }
  return search
}

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
  routesById: Record<string, AnyRoute> = Object.create(null)
  routesByPath: Record<string, AnyRoute> = Object.create(null)
  processedTree!: ProcessedTree
  resolvePathCache = createLRUCache<string, string>(1000)
  isServer = typeof document === 'undefined'
  pathParamsDecoder?: (encoded: string) => string
  protocolAllowlist = new Set(DEFAULT_PROTOCOL_ALLOWLIST)
  ssr: any = undefined
  serverSsr: any = undefined
  stores = this.createStores()
  _rendered: any[] | undefined
  _cache = new Map<string, { data: any; updatedAt: number }>()
  _forcePending = false

  private createStores() {
    const state = createStore<RouterState>(null as any)
    return {
      state,
      __store: state,
      matches: {
        get: () => state.get()?.matches ?? [],
        set: (matches: any[]) => {
          const current = state.get()
          if (current) state.set({ ...current, matches })
        },
        subscribe: (listener: (value: any[]) => void) =>
          state.subscribe((s) => listener(s.matches as any)),
      },
      location: {
        get: () => state.get()?.location,
        set: (location: ParsedLocation) => {
          const current = state.get()
          if (current) state.set({ ...current, location })
        },
        subscribe: (listener: (value: ParsedLocation) => void) =>
          state.subscribe((s) => listener(s.location)),
      },
      resolvedLocation: {
        get: () => state.get()?.resolvedLocation,
        set: (location: ParsedLocation) => {
          const current = state.get()
          if (current) state.set({ ...current, resolvedLocation: location })
        },
        subscribe: (listener: (value: ParsedLocation) => void) =>
          state.subscribe((s) => listener(s.resolvedLocation)),
      },
      getMatchStore: (routeId: string) => ({
        get: () => {
          const s = state.get()
          return (
            s?.matches.find((m) => m.routeId === routeId) ??
            s?.pendingMatches?.find((m) => m.routeId === routeId)
          )
        },
        subscribe: (listener: (value: any) => void) =>
          state.subscribe((s) =>
            listener(
              s.matches.find((m: any) => m.routeId === routeId) ??
                s.pendingMatches?.find((m: any) => m.routeId === routeId),
            ),
          ),
      }),
    }
  }
  subscribers = new Set<ListenerFn>()
  startTransition: (fn: () => void, _expected?: any) => any = (fn) => {
    fn()
    return false
  }

  private loadId = 0
  private pendingLoad: Promise<void> | undefined
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
    this.update({
      defaultPreloadDelay: 50,
      defaultPendingMs: 1000,
      defaultPendingMinMs: 500,
      context: undefined!,
      ...options,
      caseSensitive: options.caseSensitive ?? false,
      notFoundMode: options.notFoundMode ?? 'fuzzy',
      stringifySearch: options.stringifySearch ?? defaultStringifySearch,
      parseSearch: options.parseSearch ?? defaultParseSearch,
      protocolAllowlist: options.protocolAllowlist ?? DEFAULT_PROTOCOL_ALLOWLIST,
    })
  }

  get state(): RouterState {
    return this.stores.state.get()
  }

  set state(next: RouterState) {
    this.stores.state.set(next)
  }

  subscribe = (eventType: string, fn: ListenerFn) => {
    const wrapped: ListenerFn = (event) => {
      if (eventType === '*' || event.type === eventType) fn(event)
    }
    this.subscribers.add(wrapped)
    return () => {
      this.subscribers.delete(wrapped)
    }
  }

  emit = (event: RouterEvent) => {
    if (this.subscribers.size === 0) return
    this.subscribers.forEach((fn) => fn(event))
  }

  update = (newOptions: RouterOptions) => {
    const prevTree = this.routeTree
    this.options = { ...this.options, ...newOptions }
    this.isServer = this.options.isServer ?? typeof document === 'undefined'
    this.protocolAllowlist = new Set(this.options.protocolAllowlist ?? DEFAULT_PROTOCOL_ALLOWLIST)

    if (this.options.pathParamsAllowedCharacters) {
      this.pathParamsDecoder = compileDecodeCharMap(this.options.pathParamsAllowedCharacters)
    }

    if (!this.history || (this.options.history && this.options.history !== this.history)) {
      if (this.options.history) this.history = this.options.history as TRouterHistory
      else if (!this.isServer) this.history = createBrowserHistory() as TRouterHistory
    }

    this.origin = this.options.origin
    if (!this.origin) {
      if (
        !this.isServer &&
        typeof window !== 'undefined' &&
        window.origin &&
        window.origin !== 'null'
      ) {
        this.origin = window.origin
      } else {
        this.origin = 'http://localhost'
      }
    }

    this.basepath = this.options.basepath ?? '/'

    if (this.options.routeTree && this.options.routeTree !== prevTree) {
      this.routeTree = this.options.routeTree as TRouteTree
      this.processedTree = processRouteTree(
        this.routeTree as any,
        this.options.caseSensitive ?? false,
      )
      this.routesById = this.processedTree.routesById as any
      this.routesByPath = this.processedTree.routesByPath as any
    }
    if (this.options.routeMasks && this.processedTree) {
      processRouteMasks(this.options.routeMasks as any, this.processedTree)
    }

    if (this.history) {
      this.latestLocation = this.parseLocation(this.history.location, this.latestLocation)
      if (!this.stores.state.get()) {
        this.stores.state.set({
          status: 'pending',
          isLoading: true,
          isTransitioning: false,
          matches: [],
          location: this.latestLocation,
          resolvedLocation: this.latestLocation,
          statusCode: 200,
        })
      }
      if (!this.unsubHistory) {
        this.unsubHistory = this.history.subscribe(({ location }) => {
          if (this._committing) return
          this.latestLocation = this.parseLocation(location, this.latestLocation)
          void this.load()
        })
      }
    }

    return this
  }

  parseLocation = (location: HistoryLocation, previous?: ParsedLocation): ParsedLocation => {
    return parseLocationFromHistory(
      location,
      this.options.parseSearch ?? defaultParseSearch,
      previous,
    )
  }

  buildLocation = ((opts: NavigateOptions = {}): ParsedLocation => {
    const current = this.latestLocation ?? this.state?.location
    const dest = opts
    const fromPath = dest.from
      ? (this.routesById[dest.from]?.fullPath ?? dest.from)
      : (current?.pathname ?? '/')

    const currentMatch = lastMatch(this.state?.matches)
    let to = dest.to
    if (to === undefined || to === '.') {
      to = currentMatch?.routeId
        ? (this.routesById[currentMatch.routeId]?.fullPath ?? current?.pathname)
        : current?.pathname
    }
    if (typeof to !== 'string') to = current?.pathname ?? '/'

    const currentParams = currentMatch?.params ?? EMPTY_OBJ
    const nextParams =
      dest.params === true || dest.params === undefined
        ? currentParams
        : functionalUpdate(dest.params, currentParams)

    let interpolated = to
    if (to.includes('$')) {
      interpolated = interpolatePath({
        path: to,
        params: nextParams ?? EMPTY_OBJ,
        decoder: this.pathParamsDecoder,
      }).interpolatedPath
    } else if (dest.params && !dest.to) {
      const template = currentMatch ? this.routesById[currentMatch.routeId]?.fullPath : undefined
      if (template) {
        interpolated = interpolatePath({
          path: template,
          params: nextParams ?? EMPTY_OBJ,
          decoder: this.pathParamsDecoder,
        }).interpolatedPath
      }
    }

    const resolved = resolvePath({
      base: fromPath || '/',
      to: interpolated || '/',
      trailingSlash: (this.options.trailingSlash as any) ?? 'never',
      cache: this.resolvePathCache,
    })

    const currentSearch = current?.search ?? EMPTY_OBJ
    const nextSearch =
      dest.search === true
        ? currentSearch
        : dest.search
          ? functionalUpdate(dest.search, currentSearch)
          : dest.to
            ? EMPTY_OBJ
            : currentSearch

    const searchStr = (this.options.stringifySearch ?? defaultStringifySearch)(
      nextSearch ?? EMPTY_OBJ,
    )
    const hash =
      dest.hash === true
        ? (current?.hash ?? '')
        : dest.hash
          ? typeof dest.hash === 'function'
            ? dest.hash(current?.hash ?? '')
            : typeof dest.hash === 'string'
              ? dest.hash.startsWith('#')
                ? dest.hash
                : `#${dest.hash}`
              : String(dest.hash)
          : dest.to
            ? ''
            : (current?.hash ?? '')

    const href = `${resolved}${searchStr}${hash}`
    const nextState = dest.state === true ? current?.state : (dest.state ?? current?.state)
    const location: ParsedLocation = {
      href,
      pathname: resolved,
      search: nextSearch ?? EMPTY_OBJ,
      searchStr,
      hash,
      state: nextState ?? parseHref(href, undefined).state,
      publicHref: encodePathLikeUrl(href),
    }
    if (dest.mask) {
      location.maskedLocation = this.buildLocation({
        from: dest.from,
        ...dest.mask,
      })
    } else if (this.options.routeMasks && this.processedTree) {
      const mask = findFlatMatch(this.processedTree, location.pathname)
      if (mask && (mask as any).from) {
        location.maskedLocation = this.buildLocation({
          from: dest.from,
          ...(mask as any),
          params: dest.params ?? (mask as any).params,
        })
      }
    }
    return location
  }) as import('./router-provider').BuildLocationFn

  commitLocation = async (location: ParsedLocation, opts: CommitLocationOptions = {}) => {
    const href = `${location.pathname}${location.searchStr}${location.hash}`
    const prev = this.latestLocation
    if (
      prev &&
      prev.pathname === location.pathname &&
      prev.searchStr === location.searchStr &&
      prev.hash === location.hash &&
      !opts.replace
    ) {
      this.latestLocation = location
      await this.load()
      return
    }
    this._committing = true
    if (opts.replace) this.history.replace(href, location.state, opts)
    else this.history.push(href, location.state, opts)
    this.history.flush?.()
    this._committing = false
    this.latestLocation = location
    await this.load()
  }

  private redirectHops = 0

  navigate: import('./router-provider').NavigateFn = async (opts: any = {}) => {
    if (opts.reloadDocument && opts.href) {
      if (typeof document !== 'undefined') window.location.assign(opts.href)
      return
    }
    if (opts.href && !opts.to) {
      const parsed = parseHref(opts.href, undefined)
      await this.commitLocation(
        {
          href: parsed.href,
          pathname: parsed.pathname,
          search: (this.options.parseSearch ?? defaultParseSearch)(parsed.search),
          searchStr: parsed.search,
          hash: parsed.hash,
          state: parsed.state,
        },
        { replace: opts.replace, ignoreBlocker: opts.ignoreBlocker },
      )
      return
    }
    const next = this.buildLocation(opts)
    await this.commitLocation(next, {
      replace: opts.replace,
      ignoreBlocker: opts.ignoreBlocker,
    })
  }

  back = () => this.history.back()
  forward = () => this.history.forward()
  canGoBack = () => this.history.canGoBack()

  invalidate: InvalidateFn<this> = async (opts) => {
    const matches = this.state.matches
    for (const match of matches) {
      if (!opts?.filter || opts.filter(match)) {
        match.invalid = true
        if (opts?.forcePending) match._forcePending = true
      }
    }
    if (opts?.forcePending) this._forcePending = true
    await this.load()
    this._forcePending = false
  }

  clearCache: ClearCacheFn<this> = (opts) => {
    if (!opts?.filter) {
      this._cache.clear()
      return
    }
    for (const [id, _entry] of this._cache) {
      const match =
        this.state.matches.find((m) => m.id === id) ??
        this.state.pendingMatches?.find((m) => m.id === id)
      if (!match || opts.filter(match)) this._cache.delete(id)
    }
  }

  load = async (): Promise<void> => {
    const id = ++this.loadId
    const location = this.latestLocation ?? this.parseLocation(this.history.location)
    this.latestLocation = location

    const promise = this.runLoad(location, id)
    this.pendingLoad = promise
    await promise
  }

  private async runLoad(location: ParsedLocation, id: number): Promise<void> {
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
        isFetching: true,
        context: routerContext ? { ...routerContext } : EMPTY_OBJ,
        search: location.search,
        updatedAt: Date.now(),
        abortController: new AbortController(),
        cause: prev ? ('stay' as const) : ('enter' as const),
        invalid: false,
        _forcePending: this._forcePending || prev?._forcePending,
        meta:
          route.options.head?.({
            matches: [],
            match: undefined,
            params: result.params,
            loaderData: undefined,
          }) ?? route.options.meta,
        links: route.options.links,
        scripts: route.options.scripts,
        headScripts: route.options.headScripts,
        styles: route.options.styles,
        publicHref: location.publicHref,
      }
    }

    if (notFoundError) {
      const lastMatch = last(matches)
      if (lastMatch) {
        lastMatch.status = 'notFound'
        lastMatch.notFoundError = notFoundError
        lastMatch.globalNotFound = true
      }
    }

    this.stores.state.set({
      ...this.state,
      status: 'pending',
      isLoading: true,
      isTransitioning: true,
      pendingMatches: matches,
      location,
    })

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
            })
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
          const lazyMod = await route.lazyFn()
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
        if (match.cause === 'enter') route.options.onEnter?.(loaderContext)
        else route.options.onStay?.(loaderContext)

        finish.resolve()
      } catch (err) {
        if (isRedirect(err)) {
          match.status = 'redirected'
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
        route.options.onCatch?.(err)
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
      })
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

  matchRoute = (opts: NavigateOptions & MatchRouteOptions = {}): any => {
    const pending = opts.pending
    const matches = pending ? (this.state.pendingMatches ?? this.state.matches) : this.state.matches
    if (!opts.to) return !!matches.length
    const next = this.buildLocation(opts)
    const found = findRouteMatch(
      this.processedTree,
      next.pathname,
      opts.caseSensitive ?? this.options.caseSensitive ?? false,
    )
    if (!found) return false
    const lastFound = last(found)
    if (!lastFound) return false
    if (
      opts.params &&
      !deepEqual(lastFound.params, functionalUpdate(opts.params, lastFound.params), {
        partial: true,
      })
    ) {
      return opts.fuzzy ? lastFound.params : false
    }
    return lastFound.params
  }

  getMatch = (matchId: string) => this.state.matches.find((m) => m.id === matchId)

  preloadRoute = async (opts: NavigateOptions = {}) => {
    const next = this.buildLocation(opts)
    const found = findRouteMatch(
      this.processedTree,
      next.pathname,
      this.options.caseSensitive ?? false,
    )
    if (!found) return
    for (const result of found) {
      const route = result.route as AnyRoute
      if (route.lazyFn && !route._lazy) {
        const lazyMod = await route.lazyFn()
        const lazyRoute = lazyMod?.default ?? lazyMod
        if (lazyRoute?.options) Object.assign(route.options, lazyRoute.options)
        route._lazy = true
      }
      if (route.options.loader) {
        try {
          await route.options.loader({
            abortController: new AbortController(),
            preload: true,
            params: result.params,
            cause: 'preload',
            location: next,
            navigate: this.navigate,
            search: next.search,
            context: this.options.context ?? {},
            route,
          })
        } catch {
          // preload failures are ignored
        }
      }
    }
  }

  loadRouteChunk = async (route: AnyRoute) => {
    if (route.lazyFn && !route._lazy) {
      const lazyMod = await route.lazyFn()
      const lazyRoute = lazyMod?.default ?? lazyMod
      if (lazyRoute?.options) Object.assign(route.options, lazyRoute.options)
      route._lazy = true
    }
  }

  hasNotFoundMatch = () =>
    this.state.matches.some((m) => m.status === 'notFound' || m.globalNotFound)

  shouldViewTransition = (opts?: { viewTransition?: boolean | { types?: string[] } }) =>
    !!(opts?.viewTransition ?? this.options.defaultViewTransition)

  updateLatestLocation = () => {
    if (!this.history) return
    this.latestLocation = this.parseLocation(this.history.location, this.latestLocation)
  }

  matchRoutes = (location: ParsedLocation, _opts?: any) => {
    const found = findRouteMatch(
      this.processedTree,
      location.pathname,
      this.options.caseSensitive ?? false,
    )
    if (!found) return []
    return found.map((result) => ({
      id: nextMatchId(result.route.id, location.pathname),
      routeId: result.route.id,
      route: result.route,
      pathname: location.pathname,
      params: result.params,
      rawParams: result.rawParams,
      status: 'pending' as const,
      isFetching: true,
      context: { ...(this.options.context ?? {}) },
      search: location.search,
      updatedAt: Date.now(),
      abortController: new AbortController(),
      cause: 'enter' as const,
      invalid: false,
    }))
  }

  cancelMatch = (matchId: string) => {
    const match = this.state.matches.find((m) => m.id === matchId)
    match?.abortController.abort()
  }

  isShell() {
    return !!this.options.isShell
  }

  buildAndCommitLocation = async (opts: NavigateOptions = {}) => {
    await this.navigate(opts)
  }
}

export const createRouter: CreateRouterFn = (options) => new RouterCore(options)

export function getLocationChangeInfo(location: ParsedLocation, resolvedLocation?: ParsedLocation) {
  return {
    fromLocation: resolvedLocation,
    toLocation: location,
    pathChanged: resolvedLocation?.pathname !== location.pathname,
    hrefChanged: resolvedLocation?.href !== location.href,
    hashChanged: resolvedLocation?.hash !== location.hash,
  }
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
