export * from './global'

export { TSR_DEFERRED_PROMISE, defer } from './defer'
export type { DeferredPromiseState, DeferredPromise } from './defer'
export { invariant, isModuleNotFoundError } from './utils'
export { preloadWarning } from './link'
export type {
  IsRequiredParams,
  AddTrailingSlash,
  RemoveTrailingSlashes,
  AddLeadingSlash,
  RemoveLeadingSlashes,
  ActiveOptions,
  LinkOptionsProps,
  ResolveCurrentPath,
  ResolveParentPath,
  ResolveRelativePath,
  FindDescendantToPaths,
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
  FromPathOption,
  MakeOptionalSearchParams,
  MaskOptions,
  ToSubOptionsProps,
  RequiredToOptions,
} from './link'

export type {
  RouteToPath,
  TrailingSlashOptionByRouter,
  ParseRoute,
  CodeRouteToPath,
  RouteIds,
  FullSearchSchema,
  FullSearchSchemaInput,
  AllParams,
  RouteById,
  AllContext,
  RoutePaths,
  RoutesById,
  RoutesByPath,
  AllLoaderData,
  RouteByPath,
} from './route-info'

export type {
  InferFileRouteTypes,
  FileRouteTypes,
  FileRoutesByPath,
  CreateFileRoute,
  LazyRoute,
  LazyRouteOptions,
  CreateLazyFileRoute,
} from './file-route'

export type { ParsedLocation } from './location'
export type {
  Manifest,
  ServerManifest,
  ManifestRoute,
  ManifestRouteAssets,
  ServerManifestRoute,
  ManifestCssLink,
  ManifestInlineCss,
  ServerManifestInlineCss,
  InlineCssTemplate,
  ManifestScript,
  RouterManagedTag,
  RouterManagedTitleTag,
  RouterManagedMetaTag,
  RouterManagedInlineCssTag,
  RouterManagedScriptTag,
  RouterManagedLinkTag,
  RouterManagedStyleTag,
  AssetCrossOrigin,
  AssetCrossOriginConfig,
  ManifestAssetLink,
  ScriptFormat,
} from './manifest'
export {
  DEV_STYLES_ATTR,
  appendUniqueUserTags,
  createInlineCssStyleAsset,
  getAssetCrossOrigin,
  getManifestScriptFormat,
  getScriptPreloadAttrs,
  getStylesheetHref,
  resolveManifestAssetLink,
  resolveManifestCssLink,
} from './manifest'
export { isMatch } from './matches'
export {
  _getAssetMatches,
  _getRenderedMatches,
  loadRouteChunk,
  replaceRouteChunk,
} from './load-chunk'
export { loadClientRoute, preloadClientRoute } from './load-client'
export { refreshClientRoute } from './load-hmr'
export { hydrate } from './load-hydrate'
export type {
  AnyMatchAndValue,
  FindValueByIndex,
  FindValueByKey,
  CreateMatchAndValue,
  NextMatchAndValue,
  IsMatchKeyOf,
  IsMatchPath,
  IsMatchResult,
  IsMatchParse,
  IsMatch,
  RouteMatch,
  MakeRouteMatchUnion,
  MakeRouteMatch,
  AnyRouteMatch,
  MakeRouteMatchFromRoute,
  MatchRouteOptions,
  RouteMatchExtensions,
} from './matches'
export {
  joinPaths,
  cleanPath,
  trimPathLeft,
  trimPathRight,
  trimPath,
  removeTrailingSlash,
  exactPathTest,
  resolvePath,
  interpolatePath,
  compileDecodeCharMap,
} from './path'
export { encode, decode } from './qss'
export { rootRouteId } from './root'
export type { RootRouteId } from './root'

export {
  BaseRoute,
  BaseRouteApi,
  BaseRootRoute,
  createRoute,
  createRootRoute,
  createRootRouteWithContext,
  rootRouteWithContext,
  createRouteMask,
  NotFoundRoute,
} from './route'
export type {
  AnyPathParams,
  SearchSchemaInput,
  AnyContext,
  RouteContext,
  PreloadableObj,
  RoutePathOptions,
  StaticDataRouteOption,
  RoutePathOptionsIntersection,
  SearchFilter,
  SearchMiddlewareContext,
  SearchMiddleware,
  ResolveId,
  InferFullSearchSchema,
  InferFullSearchSchemaInput,
  InferAllParams,
  InferAllContext,
  MetaDescriptor,
  RouteLinkEntry,
  SearchValidator,
  AnySearchValidator,
  DefaultSearchValidator,
  ErrorRouteProps,
  ErrorComponentProps,
  NotFoundRouteProps,
  ResolveParams,
  ParseParamsFn,
  StringifyParamsFn,
  ParamsOptions,
  UpdatableStaticRouteOption,
  ContextReturnType,
  ContextAsyncReturnType,
  ResolveRouteContext,
  ResolveLoaderData,
  RoutePrefix,
  TrimPath,
  TrimPathLeft,
  TrimPathRight,
  ResolveSearchSchemaFnInput,
  ResolveSearchSchemaInput,
  ResolveSearchSchemaFn,
  ResolveSearchSchema,
  ResolveFullSearchSchema,
  ResolveFullSearchSchemaInput,
  ResolveAllContext,
  BeforeLoadContextParameter,
  RouteContextParameter,
  ResolveAllParamsFromParent,
  AnyRoute,
  Route,
  RouteTypes,
  FullSearchSchemaOption,
  RemountDepsOptions,
  MakeRemountDepsOptionsUnion,
  ResolveFullPath,
  AnyRouteWithContext,
  RouteOptions,
  FileBaseRouteOptions,
  BaseRouteOptions,
  UpdatableRouteOptions,
  RouteLoaderFn,
  RouteLoaderEntry,
  LoaderFnContext,
  RouteContextFn,
  ContextOptions,
  RouteContextOptions,
  SsrContextOptions,
  BeforeLoadContextOptions,
  RootRouteOptions,
  RootRouteOptionsExtensions,
  UpdatableRouteOptionsExtensions,
  RouteConstraints,
  RouteTypesById,
  RouteMask,
  RouteExtensions,
  RouteLazyFn,
  RouteAddChildrenFn,
  RouteAddFileChildrenFn,
  RouteAddFileTypesFn,
  ResolveOptionalParams,
  ResolveRequiredParams,
  RootRoute,
  FilebaseRouteOptionsInterface,
  LoaderStaleReloadMode,
} from './route'
export { createStore } from './store'
export type { Store } from './store'
export { createNonReactiveMutableStore, createNonReactiveReadonlyStore } from './stores'
export type {
  RouterBatchFn,
  RouterReadableStore,
  GetStoreConfig,
  RouterStores,
  RouterWritableStore,
} from './stores'
export {
  RouterCore,
  createRouter,
  trailingSlashOptions,
  defaultSerializeError,
  getInitialRouterState,
  getLocationChangeInfo,
  runRouteLifecycle,
  setLoadServerRoute,
  setWarmLoad,
  SearchParamError as RouterSearchParamError,
  PathParamError as RouterPathParamError,
} from './router'
export type {
  ViewTransitionOptions,
  TrailingSlashOption,
  Register,
  AnyRouter,
  AnyRouterWithContext,
  RegisteredRouter,
  RouterState,
  BuildNextOptions,
  RouterListener,
  RouterEvent,
  ListenerFn,
  RouterEvents,
  RouterContextOptions,
  RouterOptions,
  RouterConstructorOptions,
  ControllablePromise,
  InjectedHtmlEntry,
  CreateRouterFn,
  SSROption,
  DefaultRemountDepsFn,
  RouterOptionsExtensions,
  RegisteredSsr,
  InferRouterContext,
  InvalidateFn,
  ClearCacheFn,
  MatchRoutesOpts,
  PreloadRouteFn,
  MatchRouteFn,
  UpdateFn,
  ParseLocationFn,
  EmitFn,
  LoadFn,
  SubscribeFn,
  CommitLocationFn,
  GetMatchRoutesFn,
  MatchRoutesFn,
  StartTransitionFn,
  LoadRouteChunkFn,
} from './router'

export * from './config'

export type {
  MatchLocation,
  CommitLocationOptions,
  NavigateFn,
  BuildLocationFn,
} from './router-provider'

export { retainSearchParams, stripSearchParams } from './search-middleware'

export {
  defaultParseSearch,
  defaultStringifySearch,
  parseSearchWith,
  stringifySearchWith,
} from './search-params'
export type { SearchSerializer, SearchParser } from './search-params'

export type { OptionalStructuralSharing } from './structural-sharing'

export {
  functionalUpdate,
  hasKeys,
  replaceEqualDeep,
  isPlainObject,
  isPlainArray,
  deepEqual,
  createControlledPromise,
  DEFAULT_PROTOCOL_ALLOWLIST,
  DEFAULT_PROTOCOL_SET,
  escapeHtml,
  isDangerousProtocol,
  buildDevStylesUrl,
  encodePathLikeUrl,
  decodePath,
  createLRUCache,
  last,
  findLast,
  arraysEqual,
  nullReplaceEqualDeep,
} from './utils'
export type {
  NoInfer,
  IsAny,
  PickAsRequired,
  PickRequired,
  PickOptional,
  WithoutEmpty,
  Expand,
  DeepPartial,
  MakeDifferenceOptional,
  IsUnion,
  IsNonEmptyObject,
  Assign,
  IntersectAssign,
  Timeout,
  Updater,
  NonNullableUpdater,
  StringLiteral,
  ThrowOrOptional,
  ThrowConstraint,
  ControlledPromise,
  ExtractObjects,
  PartialMergeAllObject,
  MergeAllPrimitive,
  ExtractPrimitives,
  PartialMergeAll,
  Constrain,
  ConstrainLiteral,
  UnionToIntersection,
  MergeAllObjects,
  MergeAll,
  ValidateJSON,
  StrictOrFrom,
  LooseReturnType,
  LooseAsyncReturnType,
  Awaitable,
} from './utils'

export type {
  StandardSchemaValidatorProps,
  StandardSchemaValidator,
  AnyStandardSchemaValidator,
  StandardSchemaValidatorTypes,
  AnyStandardSchemaValidateSuccess,
  AnyStandardSchemaValidateFailure,
  AnyStandardSchemaValidateIssue,
  AnyStandardSchemaValidateInput,
  AnyStandardSchemaValidate,
  ValidatorObj,
  AnyValidatorObj,
  ValidatorAdapter,
  AnyValidatorAdapter,
  AnyValidatorFn,
  ValidatorFn,
  Validator,
  AnyValidator,
  AnySchema,
  DefaultValidator,
  ResolveSearchValidatorInputFn,
  ResolveSearchValidatorInput,
  ResolveValidatorInputFn,
  ResolveValidatorInput,
  ResolveValidatorOutputFn,
  ResolveValidatorOutput,
} from './validators'

export type {
  UseRouteContextBaseOptions,
  UseRouteContextOptions,
  UseRouteContextResult,
} from './use-route-context'

export type { UseSearchResult, ResolveUseSearch } from './use-search'

export type { UseParamsResult, ResolveUseParams } from './use-params'

export type { UseNavigateResult } from './use-navigate'

export type { UseLoaderDepsResult, ResolveUseLoaderDeps } from './use-loader-deps'

export type { UseLoaderDataResult, ResolveUseLoaderData } from './use-loader-data'

export type {
  Redirect,
  RedirectOptions,
  RedirectOptionsRoute,
  RedirectFnRoute,
  ResolvedRedirect,
  AnyRedirect,
} from './redirect'

export { redirect, isRedirect, isResolvedRedirect, parseRedirect } from './redirect'

export type { NotFoundError, NotFoundOptions } from './not-found'
export { isNotFound, notFound } from './not-found'

export {
  defaultGetScrollRestorationKey,
  getElementScrollRestorationEntry,
  storageKey,
} from './scroll-restoration-cache'
export { setupScrollRestoration } from './scroll-restoration'

export type { ScrollRestorationOptions, ScrollRestorationEntry } from './scroll-restoration-cache'

export type {
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
} from './type-primitives'

export { composeRewrites } from './rewrite'
export type { LocationRewrite, LocationRewriteFunction } from './router'
export type {
  AnySerializationAdapter,
  SerializationAdapter,
  ValidateSerializableInput,
  SerializerExtensions,
  ValidateSerializable,
  RegisteredSerializableInput,
  SerializableExtensions,
  Serializable,
  TSR_SERIALIZABLE,
  TsrSerializable,
  SerializationError,
  DefaultSerializable,
} from './ssr/serializer/transformer-types'
export {
  createSerializationAdapter,
  createSerializationAdapter as createTypedSerializationAdapter,
} from './ssr/serializer/transformer-types'
export { makeSerovalPlugin, makeSsrSerovalPlugin } from './ssr/serializer/transformer'
export { defaultSerovalPlugins } from './ssr/serializer/seroval-plugins'
export {
  RawStream,
  createRawStreamRPCPlugin,
  createRawStreamDeserializePlugin,
} from './ssr/serializer/raw-stream'
export type {
  OnRawStreamCallback,
  RawStreamHint,
  RawStreamOptions,
} from './ssr/serializer/raw-stream'

export {
  processRouteTree,
  findRouteMatch,
  findSingleMatch,
  findFlatMatch,
  buildRouteBranch,
  processRouteMasks,
  parseSegment,
  SEGMENT_TYPE_PATHNAME,
  SEGMENT_TYPE_PARAM,
  SEGMENT_TYPE_WILDCARD,
  SEGMENT_TYPE_OPTIONAL_PARAM,
} from './match'
export type { ProcessedTree, RouteMatchResult, SegmentKind } from './match'
export { isServer } from './is-server'
export { createSlotRoute, listParentSlots, markSlotRoute } from './slots'
export type { SlotNavigateDest, SlotNavigateTo, SlotRenderInfo } from './slots'
export {
  createFileRoute,
  createLazyFileRoute,
  createLazyRoute,
  FileRoute,
  LazyRouteClass,
  FileRouteLoader,
} from './file-route'
export { lazyFn, SearchParamError, PathParamError } from './misc'
export { rewriteBasepath, executeRewriteInput, executeRewriteOutput } from './rewrite'
