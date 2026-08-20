import { bindRouteHooks, createRoute } from './route'

import type { UseParamsRoute } from './use-params'
import type { UseMatchRoute } from './use-match'
import type { UseSearchRoute } from './use-search'
import type {
  AnyContext,
  AnyRoute,
  AnyRouter,
  Constrain,
  ConstrainLiteral,
  FileBaseRouteOptions,
  FileRoutesByPath as CoreFileRoutesByPath,
  LazyRouteOptions,
  Register,
  RegisteredRouter,
  ResolveParams,
  Route,
  RouteById,
  RouteConstraints,
  RouteIds,
  RouteLoaderEntry,
  UpdatableRouteOptions,
  UseNavigateResult,
} from 'speedy-router-core'
import type { FileRoutesByPath as ReactFileRoutesByPath } from './augmentation'
import type { UseLoaderDepsRoute } from './use-loader-deps'
import type { UseLoaderDataRoute } from './use-loader-data'
import type { UseRouteContextRoute } from './use-route-context'

type FileRoutesByPath = CoreFileRoutesByPath & ReactFileRoutesByPath

/**
 * FileRoutesByPath key → public URL path. Pathless `_` / `@` / `(group)`
 * segments are dropped, matching speedy-router-plugin's `urlPathFromId`.
 */
function fileRouteFullPath(id: string): string | undefined {
  const trailingSlash = id.endsWith('/') && id !== '/'
  const parts: Array<string> = []
  for (const segment of id.split('/')) {
    if (!segment) continue
    if (
      segment.startsWith('_') ||
      segment.startsWith('@') ||
      (segment.startsWith('(') && segment.endsWith(')'))
    ) {
      continue
    }
    parts.push(segment.endsWith('_') ? segment.slice(0, -1) : segment)
  }
  if (parts.length === 0) {
    if (id === '/' || trailingSlash) return '/'
    return undefined
  }
  return `/${parts.join('/')}${trailingSlash ? '/' : ''}`
}

/**
 * Generator-style trees keep a stub in `routeTree` and lazy-load this module.
 * Hooks such as `Route.useParams()` read `this.id`, and `navigate({ from })`
 * reads `this.fullPath`. Bind those from the `createFileRoute` path so the
 * file-local Route object matches the stub even though `init()` never runs
 * on it.
 */
function bindFileRoutePath(route: Record<string, unknown>, path?: string) {
  route.isRoot = false
  if (typeof path !== 'string' || path === '') return
  route._id = path
  // Pure pathless ids (`/_auth`, `/@modal`, `/(auth)`) have no URL segments.
  // Match plugin `urlPathFromId(...) ?? '/'` and Route.init() under root.
  const fullPath = fileRouteFullPath(path) ?? '/'
  route._fullPath = fullPath
  route._to = fullPath !== '/' && fullPath.endsWith('/') ? fullPath.slice(0, -1) : fullPath
}

/**
 * Creates a file-based Route factory for a given path.
 *
 * Used by TanStack Router's file-based routing to associate a file with a
 * route. The returned function accepts standard route options. In normal usage
 * the `path` string is inserted and maintained by the `tsr` generator.
 *
 * @param path File path literal for the route (usually auto-generated).
 * @returns A function that accepts Route options and returns a Route instance.
 * @link https://tanstack.com/router/latest/docs/framework/react/api/router/createFileRouteFunction
 */
export function createFileRoute<
  TFilePath extends keyof FileRoutesByPath,
  TParentRoute extends AnyRoute = FileRoutesByPath[TFilePath]['parentRoute'],
  TId extends RouteConstraints['TId'] = FileRoutesByPath[TFilePath]['id'],
  TPath extends RouteConstraints['TPath'] = FileRoutesByPath[TFilePath]['path'],
  TFullPath extends RouteConstraints['TFullPath'] = FileRoutesByPath[TFilePath]['fullPath'],
>(path?: TFilePath): FileRoute<TFilePath, TParentRoute, TId, TPath, TFullPath>['createRoute'] {
  return (options) => {
    const route = createRoute(options as any)
    bindFileRoutePath(route as unknown as Record<string, unknown>, path as string | undefined)
    return route as any
  }
}

/**
  @deprecated It's no longer recommended to use the `FileRoute` class directly.
  Instead, use `createFileRoute('/path/to/file')(options)` to create a file route.
*/
export class FileRoute<
  TFilePath extends keyof FileRoutesByPath,
  TParentRoute extends AnyRoute = FileRoutesByPath[TFilePath]['parentRoute'],
  TId extends RouteConstraints['TId'] = FileRoutesByPath[TFilePath]['id'],
  TPath extends RouteConstraints['TPath'] = FileRoutesByPath[TFilePath]['path'],
  TFullPath extends RouteConstraints['TFullPath'] = FileRoutesByPath[TFilePath]['fullPath'],
> {
  silent?: boolean

  constructor(
    public path?: TFilePath,
    _opts?: { silent: boolean },
  ) {
    this.silent = _opts?.silent
  }

  createRoute = <
    TRegister = Register,
    TSearchValidator = undefined,
    TParams = ResolveParams<TPath>,
    TRouteContextFn = AnyContext,
    TBeforeLoadFn = AnyContext,
    TLoaderDeps extends Record<string, any> = {},
    TLoaderFn = undefined,
    TChildren = unknown,
    TSSR = unknown,
    const TMiddlewares = unknown,
    THandlers = undefined,
  >(
    options?: FileBaseRouteOptions<
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
      TMiddlewares,
      THandlers
    > &
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
      >,
  ): Route<
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
    TChildren,
    unknown,
    TSSR,
    TMiddlewares,
    THandlers
  > => {
    if (process.env.NODE_ENV !== 'production') {
      if (!this.silent) {
        console.warn(
          'Warning: FileRoute is deprecated and will be removed in the next major version. Use the createFileRoute(path)(options) function instead.',
        )
      }
    }
    const route = createRoute(options as any)
    bindFileRoutePath(route as unknown as Record<string, unknown>, this.path as string | undefined)
    return route as any
  }
}

/**
  @deprecated It's recommended not to split loaders into separate files.
  Instead, place the loader function in the main route file via `createFileRoute`.
*/
export function FileRouteLoader<
  TFilePath extends keyof FileRoutesByPath,
  TRoute extends FileRoutesByPath[TFilePath]['preLoaderRoute'],
>(
  _path: TFilePath,
): <TLoaderFn>(
  loaderFn: Constrain<
    TLoaderFn,
    RouteLoaderEntry<
      Register,
      TRoute['parentRoute'],
      TRoute['types']['id'],
      TRoute['types']['params'],
      TRoute['types']['loaderDeps'],
      TRoute['types']['routerContext'],
      TRoute['types']['routeContextFn'],
      TRoute['types']['beforeLoadFn']
    >
  >,
) => TLoaderFn {
  if (process.env.NODE_ENV !== 'production') {
    console.warn(
      `Warning: FileRouteLoader is deprecated and will be removed in the next major version. Please place the loader function in the main route file, inside the \`createFileRoute('/path/to/file')(options)\` options`,
    )
  }
  return (loaderFn) => loaderFn as any
}

declare module 'speedy-router-core' {
  export interface LazyRoute<in out TRoute extends AnyRoute> {
    useMatch: UseMatchRoute<TRoute['id']>
    useRouteContext: UseRouteContextRoute<TRoute['id']>
    useSearch: UseSearchRoute<TRoute['id']>
    useParams: UseParamsRoute<TRoute['id']>
    useLoaderDeps: UseLoaderDepsRoute<TRoute['id']>
    useLoaderData: UseLoaderDataRoute<TRoute['id']>
    useNavigate: () => UseNavigateResult<TRoute['fullPath']>
  }
}

export class LazyRoute<TRoute extends AnyRoute> {
  options: {
    id: string
  } & LazyRouteOptions

  constructor(
    opts: {
      id: string
    } & LazyRouteOptions,
  ) {
    this.options = opts
    bindRouteHooks(this, () => this.options.id, undefined, { lookupFullPath: true })
  }

  declare useMatch: UseMatchRoute<TRoute['id']>
  declare useRouteContext: UseRouteContextRoute<TRoute['id']>
  declare useSearch: UseSearchRoute<TRoute['id']>
  declare useParams: UseParamsRoute<TRoute['id']>
  declare useLoaderDeps: UseLoaderDepsRoute<TRoute['id']>
  declare useLoaderData: UseLoaderDataRoute<TRoute['id']>
  declare useNavigate: () => UseNavigateResult<TRoute['fullPath']>
}

/**
 * Creates a lazily-configurable code-based route stub by ID.
 *
 * Use this for code-splitting with code-based routes. The returned function
 * accepts only non-critical route options like `component`, `pendingComponent`,
 * `errorComponent`, and `notFoundComponent` which are applied when the route
 * is matched.
 *
 * @param id Route ID string literal to associate with the lazy route.
 * @returns A function that accepts lazy route options and returns a `LazyRoute`.
 * @link https://tanstack.com/router/latest/docs/framework/react/api/router/createLazyRouteFunction
 */
export function createLazyRoute<
  TRouter extends AnyRouter = RegisteredRouter,
  TId extends string = string,
  TRoute extends AnyRoute = RouteById<TRouter['routeTree'], TId>,
>(id: ConstrainLiteral<TId, RouteIds<TRouter['routeTree']>>) {
  return (opts: LazyRouteOptions) => {
    return new LazyRoute<TRoute>({
      id: id,
      ...opts,
    })
  }
}

/**
 * Creates a lazily-configurable file-based route stub by file path.
 *
 * Use this for code-splitting with file-based routes (eg. `.lazy.tsx` files).
 * The returned function accepts only non-critical route options like
 * `component`, `pendingComponent`, `errorComponent`, and `notFoundComponent`.
 *
 * @param id File path literal for the route file.
 * @returns A function that accepts lazy route options and returns a `LazyRoute`.
 * @link https://tanstack.com/router/latest/docs/framework/react/api/router/createLazyFileRouteFunction
 */
export function createLazyFileRoute<
  TFilePath extends keyof FileRoutesByPath,
  TRoute extends FileRoutesByPath[TFilePath]['preLoaderRoute'],
>(id: TFilePath): (opts: LazyRouteOptions) => LazyRoute<TRoute> {
  if (typeof id === 'object') {
    return new LazyRoute<TRoute>(id) as any
  }

  return (opts: LazyRouteOptions) => new LazyRoute<TRoute>({ id, ...opts })
}
