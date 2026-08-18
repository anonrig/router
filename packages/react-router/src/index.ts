export {
  defer,
  isMatch,
  joinPaths,
  cleanPath,
  trimPathLeft,
  trimPathRight,
  trimPath,
  resolvePath,
  interpolatePath,
  rootRouteId,
  defaultParseSearch,
  defaultStringifySearch,
  parseSearchWith,
  stringifySearchWith,
  functionalUpdate,
  replaceEqualDeep,
  isPlainObject,
  isPlainArray,
  deepEqual,
  createControlledPromise,
  retainSearchParams,
  stripSearchParams,
  createSerializationAdapter,
  redirect,
  isRedirect,
  createRouterConfig,
  DEFAULT_PROTOCOL_ALLOWLIST,
  lazyFn,
  SearchParamError,
  notFound,
  isNotFound,
  composeRewrites,
  rewriteBasepath,
  executeRewriteInput,
  executeRewriteOutput,
  hydrate,
  _getAssetMatches,
  _getRenderedMatches,
} from 'speedy-router-core'

export type {
  AnyRoute,
  DeferredPromiseState,
  DeferredPromise,
  ParsedLocation,
  RemoveTrailingSlashes,
  RemoveLeadingSlashes,
  ActiveOptions,
  ResolveRelativePath,
  RootRouteId,
  AnyPathParams,
  ResolveParams,
  ResolveOptionalParams,
  ResolveRequiredParams,
  SearchSchemaInput,
  AnyContext,
  RouteContext,
  PreloadableObj,
  RoutePathOptions,
  RoutePathOptionsIntersection,
  UpdatableStaticRouteOption,
  MetaDescriptor,
  RouteLinkEntry,
  ParseParamsFn,
  SearchFilter,
  ResolveId,
  InferFullSearchSchema,
  InferFullSearchSchemaInput,
  ErrorRouteProps,
  ErrorComponentProps,
  NotFoundRouteProps,
  TrimPath,
  TrimPathLeft,
  TrimPathRight,
  StringifyParamsFn,
  ParamsOptions,
  InferAllParams,
  InferAllContext,
  LooseReturnType,
  LooseAsyncReturnType,
  ContextReturnType,
  ContextAsyncReturnType,
  ResolveLoaderData,
  ResolveRouteContext,
  SearchSerializer,
  SearchParser,
  SearchMiddleware,
  TrailingSlashOption,
  Manifest,
  RouterManagedTag,
  ControlledPromise,
  Constrain,
  Expand,
  MergeAll,
  Assign,
  IntersectAssign,
  ResolveValidatorInput,
  ResolveValidatorOutput,
  AnyValidator,
  DefaultValidator,
  ValidatorFn,
  AnySchema,
  AnyValidatorAdapter,
  AnyValidatorFn,
  AnyValidatorObj,
  ResolveValidatorInputFn,
  ResolveValidatorOutputFn,
  ResolveSearchValidatorInput,
  ResolveSearchValidatorInputFn,
  Validator,
  ValidatorAdapter,
  ValidatorObj,
  RouteById,
  RootRouteOptions,
  CreateFileRoute,
  SerializationAdapter,
  AnySerializationAdapter,
  SerializableExtensions,
  NotFoundError,
  LocationRewrite,
  LocationRewriteFunction,
  ValidateFromPath,
  ValidateToPath,
  ValidateSearch,
  ValidateParams,
  InferFrom,
  InferTo,
  InferMaskTo,
  InferMaskFrom,
  ValidateNavigateOptions,
  ValidateNavigateOptionsArray,
  ValidateRedirectOptions,
  ValidateRedirectOptionsArray,
  ValidateId,
  InferStrict,
  InferShouldThrow,
  InferSelected,
  ValidateUseSearchResult,
  ValidateUseParamsResult,
  SerializerExtensions,
  RegisteredSerializableInput,
  Serializable,
} from 'speedy-router-core'

export interface Register {}

export interface StaticDataRouteOption {}

export interface FileRoutesByPath {}

export {
  createHistory,
  createBrowserHistory,
  createHashHistory,
  createMemoryHistory,
} from './history'

export type { BlockerFn, HistoryLocation, RouterHistory, ParsedPath, HistoryState } from './history'

export { useAwaited, Await } from './awaited'
export type { AwaitOptions } from './awaited'

export { CatchBoundary, ErrorComponent } from './catch-boundary'
export { ClientOnly, useHydrated } from './client-only'
export { reactUse, useLayoutEffect } from './utils'

export {
  FileRoute,
  createFileRoute,
  FileRouteLoader,
  LazyRoute,
  createLazyRoute,
  createLazyFileRoute,
} from './file-route'

export { lazyRouteComponent } from './lazy-route-component'

export { useLinkProps, Link } from './link'
export { createLink, linkOptions } from './link-factories'
export type {
  InferDescendantToPaths,
  RelativeToPath,
  RelativeToParentPath,
  RelativeToCurrentPath,
  AbsoluteToPath,
  RelativeToPathAutoComplete,
  NavigateOptions,
  ToOptions,
  ToMaskOptions,
  ToSubOptions,
  ResolveRoute,
  SearchParamOptions,
  PathParamOptions,
  ToPathOption,
  LinkOptions,
  MakeOptionalPathParams,
  FileRouteTypes,
  RouteContextParameter,
  BeforeLoadContextParameter,
  ResolveAllContext,
  ResolveAllParamsFromParent,
  ResolveFullSearchSchema,
  ResolveFullSearchSchemaInput,
  RouteIds,
  NavigateFn,
  BuildLocationFn,
  FullSearchSchemaOption,
  MakeRemountDepsOptionsUnion,
  RemountDepsOptions,
  ResolveFullPath,
  AnyRouteWithContext,
  AnyRouterWithContext,
  CommitLocationOptions,
  MatchLocation,
  UseNavigateResult,
  AnyRedirect,
  Redirect,
  RedirectOptions,
  ResolvedRedirect,
  MakeRouteMatch,
  MakeRouteMatchUnion,
  RouteMatch,
  AnyRouteMatch,
  RouteContextFn,
  RouteContextOptions,
  BeforeLoadContextOptions,
  ContextOptions,
  RouteOptions,
  FileBaseRouteOptions,
  BaseRouteOptions,
  UpdatableRouteOptions,
  RouteLoaderFn,
  LoaderFnContext,
  LazyRouteOptions,
  AnyRouter,
  RegisteredRouter,
  RouterContextOptions,
  ControllablePromise,
  InjectedHtmlEntry,
  RouterOptions,
  RouterState,
  ListenerFn,
  BuildNextOptions,
  RouterConstructorOptions,
  RouterEvents,
  RouterEvent,
  RouterListener,
  RouteConstraints,
  RouteMask,
  MatchRouteOptions,
  CreateLazyFileRoute,
} from 'speedy-router-core'
export type {
  UseLinkPropsOptions,
  ActiveLinkOptions,
  LinkProps,
  LinkComponent,
  LinkComponentProps,
  CreateLinkProps,
  LinkComponentRoute,
} from './link-types'

export { Matches } from './matches'
export {
  useMatchRoute,
  MatchRoute,
  useMatches,
  useParentMatches,
  useChildMatches,
} from './matches-hooks'
export type { UseMatchRouteOptions, MakeMatchRouteOptions } from './matches-hooks'

export { Match, MatchInner, Outlet, renderPending } from './match'

export { useMatch } from './use-match'
export { useLoaderDeps } from './use-loader-deps'
export { useLoaderData } from './use-loader-data'

export {
  RouteApi,
  getRouteApi,
  Route,
  createRoute,
  RootRoute,
  rootRouteWithContext,
  createRootRoute,
  createRootRouteWithContext,
  createRouteMask,
  NotFoundRoute,
} from './route'
export { createSlotRoute, Slots } from './slots'
export type {
  AnyRootRoute,
  AsyncRouteComponent,
  RouteComponent,
  ErrorRouteComponent,
  NotFoundRouteComponent,
  DefaultRouteTypes,
  RouteTypes,
} from './route'

export { createRouter, Router } from './router'

export { RouterProvider, RouterContextProvider } from './router-provider'
export type { RouterProps } from './router-provider'

export { useElementScrollRestoration, ScrollRestoration } from './scroll-restoration'
export type { UseElementScrollRestorationOptions } from './scroll-restoration'

export type { UseBlockerOpts, ShouldBlockFn } from './use-blocker'
export { useBlocker, Block } from './use-blocker'

export { useNavigate } from './use-navigate'
export { Navigate } from './navigate'
export { useParams } from './use-params'
export { useSearch } from './use-search'
export { useRouteContext } from './use-route-context'
export { useRouter } from './use-router'
export { useRouterState } from './use-router-state'
export { useLocation } from './use-location'
export { useCanGoBack } from './use-can-go-back'

export { CatchNotFound, DefaultGlobalNotFound } from './not-found'

export type {
  ValidateLinkOptions,
  InferStructuralSharing,
  ValidateUseSearchOptions,
  ValidateUseParamsOptions,
  ValidateLinkOptionsArray,
} from './type-primitives'

export { ScriptOnce } from './script-once'
export { Asset } from './asset'
export { HeadContent } from './head-content'
export { useTags } from './head-content-utils'
export { Scripts } from './scripts'
export type * from './ssr/serializer'

type SpeedyRegister = Register
type SpeedyStaticDataRouteOption = StaticDataRouteOption
type SpeedyFileRoutesByPath = FileRoutesByPath

declare module 'speedy-router-core' {
  interface Register extends SpeedyRegister {}
  interface StaticDataRouteOption extends SpeedyStaticDataRouteOption {}
  interface FileRoutesByPath extends SpeedyFileRoutesByPath {}
}
