import { createRoute, type AnyRoute } from './route'
import type { Register } from './router'
import type {
  AnyContext,
  AnyPathParams,
  FileBaseRouteOptions,
  ResolveParams,
  Route,
  RouteConstraints,
  UpdatableRouteOptions,
} from './route'
import type { AnyValidator } from './validators'

export const createFileRoute = /*#__PURE__*/ (path: string) => {
  return (options: any = {}) => {
    const opts: any = { ...options }
    if (!opts.path && !opts.id) {
      if (path === '/' || path === '') opts.path = '/'
      else if (path.startsWith('/')) opts.path = path
      else opts.path = '/' + path
    }
    return createRoute(opts)
  }
}

export const createLazyFileRoute = /*#__PURE__*/ (_path: string) => {
  return (options: any = {}) => ({ options, isLazy: true })
}

export const createLazyRoute = /*#__PURE__*/ (_id: string) => {
  return (options: any = {}) => ({ options, isLazy: true })
}

export class FileRoute {
  path: string
  constructor(path: string) {
    this.path = path
  }
  createRoute = (options: any = {}) => createFileRoute(this.path)(options)
}

export class LazyRouteClass {
  options: any
  constructor(options: any = {}) {
    this.options = options
  }
}

export function FileRouteLoader(_path: string) {
  return (loader: any) => loader
}

export interface FileRouteTypes {
  fileRoutesByFullPath: any
  fullPaths: any
  to: any
  fileRoutesByTo: any
  id: any
  fileRoutesById: any
}

export type InferFileRouteTypes<TRouteTree extends AnyRoute> =
  unknown extends TRouteTree['types']['fileRouteTypes']
    ? never
    : TRouteTree['types']['fileRouteTypes'] extends FileRouteTypes
      ? TRouteTree['types']['fileRouteTypes']
      : never

export interface FileRoutesByPath {
  // '/': {
  //   parentRoute: typeof rootRoute
  // }
}

export interface FileRouteOptions<
  TRegister,
  TFilePath extends string,
  TParentRoute extends AnyRoute,
  TId extends RouteConstraints['TId'],
  TPath extends RouteConstraints['TPath'],
  TFullPath extends RouteConstraints['TFullPath'],
  TSearchValidator = undefined,
  TParams = ResolveParams<TPath>,
  TRouteContextFn = AnyContext,
  TBeforeLoadFn = AnyContext,
  TLoaderDeps extends Record<string, any> = {},
  TLoaderFn = undefined,
  TSSR = unknown,
  TServerMiddlewares = unknown,
  THandlers = undefined,
>
  extends
    FileBaseRouteOptions<
      TRegister,
      TParentRoute,
      TId,
      TPath,
      TSearchValidator,
      TParams,
      TLoaderDeps,
      TLoaderFn,
      AnyContext,
      TRouteContextFn,
      TBeforeLoadFn,
      AnyContext,
      TSSR,
      TServerMiddlewares,
      THandlers
    >,
    UpdatableRouteOptions<
      TParentRoute,
      TId,
      TFullPath,
      TParams,
      TSearchValidator,
      TLoaderFn,
      TLoaderDeps,
      AnyContext,
      TRouteContextFn,
      TBeforeLoadFn
    > {}

export type CreateFileRoute<
  TFilePath extends string,
  TParentRoute extends AnyRoute,
  TId extends RouteConstraints['TId'],
  TPath extends RouteConstraints['TPath'],
  TFullPath extends RouteConstraints['TFullPath'],
> = <
  TRegister = Register,
  TSearchValidator = undefined,
  TParams = ResolveParams<TPath>,
  TRouteContextFn = AnyContext,
  TBeforeLoadFn = AnyContext,
  TLoaderDeps extends Record<string, any> = {},
  TLoaderFn = undefined,
  TSSR = unknown,
  TServerMiddlewares = unknown,
  THandlers = undefined,
>(
  options?: FileRouteOptions<
    TRegister,
    TFilePath,
    TParentRoute,
    TId,
    TPath,
    TFullPath,
    TSearchValidator,
    TParams,
    TRouteContextFn,
    TBeforeLoadFn,
    TLoaderDeps,
    TLoaderFn,
    TSSR,
    TServerMiddlewares,
    THandlers
  >,
) => Route<
  TRegister,
  TParentRoute,
  TPath,
  TFullPath,
  TFilePath,
  TId,
  TSearchValidator,
  TParams,
  AnyContext,
  TRouteContextFn,
  TBeforeLoadFn,
  TLoaderDeps,
  TLoaderFn,
  unknown,
  unknown,
  TSSR,
  TServerMiddlewares,
  THandlers
>

export type LazyRouteOptions = Pick<
  UpdatableRouteOptions<
    AnyRoute,
    string,
    string,
    AnyPathParams,
    AnyValidator,
    {},
    AnyContext,
    AnyContext,
    AnyContext,
    AnyContext
  >,
  'component' | 'errorComponent' | 'pendingComponent' | 'notFoundComponent'
>

export interface LazyRoute<in out TRoute extends AnyRoute> {
  options: {
    id: string
  } & LazyRouteOptions
}

export type CreateLazyFileRoute<TRoute extends AnyRoute> = (
  opts: LazyRouteOptions,
) => LazyRoute<TRoute>
