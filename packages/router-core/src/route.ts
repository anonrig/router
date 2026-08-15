import { joinPaths, trimPathLeft, trimPathRight } from './path'
import { notFound, type NotFoundError } from './not-found'
import { redirect } from './redirect'
import { rootRouteId } from './root'
import { invariant } from './utils'

export type AnyPathParams = Record<string, any>
export type AnyContext = Record<string, any>
export type RouteContext = AnyContext
export type SearchSchemaInput = Record<string, unknown>
export type AnyRoute = Route<any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any>
export type AnyRouteWithContext<TContext = any> = AnyRoute
export type PreloadableObj = any
export type StaticDataRouteOption = any
export type RoutePathOptions = { path?: string; id?: string }
export type RoutePathOptionsIntersection = RoutePathOptions
export type UpdatableStaticRouteOption = any
export type MetaDescriptor = any
export type RouteLinkEntry = any
export type ParseParamsFn = any
export type StringifyParamsFn = any
export type SearchFilter = any
export type ParamsOptions = any
export type SearchMiddleware = any
export type SearchMiddlewareMeta = any
export type RouteLoaderFn = (...args: any[]) => any
export type LoaderFnContext = any
export type RouteContextFn = any
export type BeforeLoadContextOptions = any
export type RouteContextOptions = any
export type ContextOptions = any
export type FileBaseRouteOptions = any
export type BaseRouteOptions = any
export type UpdatableRouteOptions = any
export type RouteOptions = Record<string, any> & {
  getParentRoute?: () => AnyRoute
  path?: string
  id?: string
  component?: any
  errorComponent?: any
  pendingComponent?: any
  notFoundComponent?: any
  loader?: RouteLoaderFn
  beforeLoad?: (...args: any[]) => any
  loaderDeps?: (...args: any[]) => any
  validateSearch?: any
  search?: any
  params?: any
  context?: any
  onEnter?: (...args: any[]) => any
  onStay?: (...args: any[]) => any
  onLeave?: (...args: any[]) => any
  onCatch?: (...args: any[]) => any
  wrapInSuspense?: boolean
  ssr?: boolean | 'data-only'
  caseSensitive?: boolean
  pendingMs?: number
  pendingMinMs?: number
  staleTime?: number
  gcTime?: number
  preload?: boolean
  preloadStaleTime?: number
  preloadGcTime?: number
  remountDeps?: (...args: any[]) => any
  headers?: (...args: any[]) => any
  head?: (...args: any[]) => any
  scripts?: (...args: any[]) => any
  staticData?: any
  ignoreRouteInSearch?: boolean
}
export type RootRouteOptions = RouteOptions & { shellComponent?: any }
export type FileRouteTypes = any
export type RouteConstraints = {
  TParentRoute: any
  TPath: any
  TFullPath: any
  TCustomId: any
  TId: any
}
export type ResolveFullPath<TParent, TPath> = string
export type ResolveId<TParent, TCustomId, TPath> = string
export type ResolveParams<TPath> = Record<string, string>
export type ResolveOptionalParams<T> = T
export type ResolveRequiredParams<T> = T
export type InferFullSearchSchema<T> = any
export type InferFullSearchSchemaInput<T> = any
export type InferAllParams<T> = any
export type InferAllContext<T> = any
export type ResolveLoaderData<T> = any
export type ResolveRouteContext<T> = any
export type ErrorRouteProps = { error: unknown; reset: () => void; info?: { componentStack?: string } }
export type ErrorComponentProps = ErrorRouteProps
export type NotFoundRouteProps = { data?: unknown }
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
export type ResolveValidatorInput<T> = any
export type ResolveValidatorOutput<T> = any
export type ResolveValidatorInputFn<T> = any
export type ResolveValidatorOutputFn<T> = any
export type ResolveSearchValidatorInput<T> = any
export type ResolveSearchValidatorInputFn<T> = any
export type ContextReturnType<T> = any
export type ContextAsyncReturnType<T> = any
export type LoaderStaleReloadMode = any
export type MakeRemountDepsOptionsUnion<T = any> = any
export type RouteMask = any
export type DefaultRouteTypes = any
export type RouteTypes = any
export type RouteTypesById<TRouter, TId> = any

export interface UpdatableRouteOptionsExtensions {}
export interface RootRouteOptionsExtensions {}
export interface RouteExtensions<TId extends string = string, TFullPath extends string = string> {}

export class BaseRouteApi<TId = any, TRouter = any> {
  id: TId
  constructor({ id }: { id: TId }) {
    this.id = id
  }
  notFound = (opts?: NotFoundError) => notFound({ routeId: this.id as string, ...opts })
}

export class BaseRoute<
  TRegister = unknown,
  TParentRoute extends AnyRoute = AnyRoute,
  TPath extends string = string,
  TFullPath extends string = string,
  TCustomId extends string = string,
  TId extends string = string,
  TSearchValidator = undefined,
  TParams = any,
  TRouterContext = any,
  TRouteContextFn = any,
  TBeforeLoadFn = any,
  TLoaderDeps extends Record<string, any> = {},
  TLoaderFn = undefined,
  TChildren = unknown,
  TFileRouteTypes = unknown,
  TSSR = unknown,
  TServerMiddlewares = unknown,
  THandlers = undefined,
> {
  options: RouteOptions
  isRoot: boolean
  parentRoute!: AnyRoute
  children?: TChildren
  originalIndex?: number
  rank!: number
  lazyFn?: () => Promise<any>
  _lazy?: Promise<void> | true

  private _id!: TId
  private _path!: TPath
  private _fullPath!: TFullPath
  private _to!: string
  private _initialized = false

  constructor(options?: RouteOptions) {
    this.options = options || {}
    this.isRoot = !options?.getParentRoute
    if ((options as any)?.id && (options as any)?.path) {
      throw new Error(`Route cannot have both an 'id' and a 'path' option.`)
    }
  }

  get to() {
    return this._to
  }
  get id() {
    return this._id
  }
  get path() {
    return this._path
  }
  get fullPath() {
    return this._fullPath
  }

  init = (opts: { originalIndex: number }): void => {
    this.originalIndex = opts.originalIndex
    this._initialized = true
    const options = this.options
    const isRoot = !options?.path && !options?.id && !options?.getParentRoute

    this.parentRoute = this.options.getParentRoute?.() as AnyRoute

    if (isRoot) {
      this._path = rootRouteId as TPath
    } else if (!this.parentRoute) {
      invariant(false, `Child Route instances must pass a 'getParentRoute: () => ParentRoute' option that returns a Route instance.`)
    }

    let path: undefined | string = isRoot ? rootRouteId : options?.path
    if (path && path !== '/') path = trimPathLeft(path)

    const customId = options?.id || path
    let id = isRoot
      ? rootRouteId
      : joinPaths([
          this.parentRoute.id === rootRouteId ? '' : this.parentRoute.id,
          customId,
        ])

    if (path === rootRouteId) path = '/'
    if (id !== rootRouteId) id = joinPaths(['/', id])

    const fullPath =
      id === rootRouteId ? '/' : joinPaths([this.parentRoute.fullPath, path])

    this._path = path as TPath
    this._id = id as TId
    this._fullPath = fullPath as TFullPath
    this._to = trimPathRight(fullPath)
  }

  addChildren = (children: any): this => {
    return this._addFileChildren(children)
  }

  _addFileChildren = (children: any): this => {
    if (Array.isArray(children)) this.children = children as TChildren
    else if (typeof children === 'object' && children !== null) {
      this.children = Object.values(children) as TChildren
    }
    return this
  }

  _addFileTypes = () => this as any

  update = (options: Record<string, any>) => {
    Object.assign(this.options, options)
    return this
  }

  updateLoader = (options: { loader: any }) => {
    Object.assign(this.options, options)
    return this
  }

  lazy = (lazyFn: () => Promise<any>) => {
    this.lazyFn = lazyFn
    return this
  }

  redirect = (opts: any) => redirect({ from: this.fullPath, ...opts })
}

export class BaseRootRoute<
  TRegister = unknown,
  TSearchValidator = undefined,
  TRouterContext = any,
  TRouteContextFn = any,
  TBeforeLoadFn = any,
  TLoaderDeps extends Record<string, any> = {},
  TLoaderFn = undefined,
  TChildren = unknown,
  TFileRouteTypes = unknown,
  TSSR = unknown,
  TServerMiddlewares = unknown,
  THandlers = undefined,
> extends BaseRoute<
  TRegister,
  any,
  '/',
  '/',
  string,
  typeof rootRouteId,
  TSearchValidator,
  {},
  TRouterContext,
  TRouteContextFn,
  TBeforeLoadFn,
  TLoaderDeps,
  TLoaderFn,
  TChildren,
  TFileRouteTypes,
  TSSR,
  TServerMiddlewares,
  THandlers
> {
  constructor(options?: RootRouteOptions) {
    super(options as any)
    this.isRoot = true
  }
}

export function createRoute(options?: RouteOptions): AnyRoute {
  return new BaseRoute(options) as AnyRoute
}

export function createRootRoute(options?: RootRouteOptions): AnyRoute {
  return new BaseRootRoute(options) as AnyRoute
}

export function createRootRouteWithContext<TContext>() {
  return (options?: RootRouteOptions) => createRootRoute(options) as AnyRoute
}

export function rootRouteWithContext<TContext>() {
  return createRootRouteWithContext<TContext>()
}

export function createRouteMask(opts: any) {
  return opts
}

export class NotFoundRoute extends BaseRoute {
  constructor(options: RouteOptions) {
    super({ ...options, id: 'not-found' })
  }
}

export type RootRoute = BaseRootRoute
export type Route = BaseRoute
export { BaseRoute as RouteClass }
