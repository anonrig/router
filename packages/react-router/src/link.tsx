import {
  createElement,
  forwardRef,
  useCallback,
  useMemo,
  type AnchorHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from 'react'
import { exactPathTest, functionalUpdate } from '@anonrig/router-core'
import { useRouter } from './useRouter'
import { useRouterState } from './useRouterState'
import type { ActiveOptions, NavigateOptions } from '@anonrig/router-core'

export type LinkProps = NavigateOptions &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
    activeProps?:
      | AnchorHTMLAttributes<HTMLAnchorElement>
      | (() => AnchorHTMLAttributes<HTMLAnchorElement>)
    inactiveProps?:
      | AnchorHTMLAttributes<HTMLAnchorElement>
      | (() => AnchorHTMLAttributes<HTMLAnchorElement>)
    activeOptions?: ActiveOptions
    preload?: false | 'intent' | 'viewport' | 'render'
    preloadDelay?: number
    disabled?: boolean
    target?: string
    children?: ReactNode | ((state: { isActive: boolean }) => ReactNode)
  }

export function useLinkProps(props: LinkProps): AnchorHTMLAttributes<HTMLAnchorElement> {
  const router = useRouter()
  const location = useRouterState({ select: (s) => s.location })

  const next = useMemo(
    () => router.buildLocation(props),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [router, props.to, props.params, props.search, props.hash, props.from, props.href],
  )

  const href = router.history.createHref(
    `${next.pathname}${next.searchStr}${next.hash}`,
  )

  const isActive = exactPathTest(
    location.pathname,
    next.pathname,
    router.basepath,
  )

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    props.onClick?.(e)
    if (
      e.defaultPrevented ||
      e.button !== 0 ||
      props.target === '_blank' ||
      e.metaKey ||
      e.altKey ||
      e.ctrlKey ||
      e.shiftKey ||
      props.disabled
    ) {
      return
    }
    e.preventDefault()
    void router.navigate(props)
  }

  let preloadTimer: ReturnType<typeof setTimeout> | undefined
  const preload = () => {
    const strategy = props.preload ?? router.options.defaultPreload
    if (!strategy) return
    void router.preloadRoute(props)
  }

  const onMouseEnter = (e: MouseEvent<HTMLAnchorElement>) => {
    props.onMouseEnter?.(e)
    const strategy = props.preload ?? router.options.defaultPreload
    if (strategy === 'intent') {
      const delay = props.preloadDelay ?? router.options.defaultPreloadDelay ?? 50
      preloadTimer = setTimeout(preload, delay)
    }
  }

  const onMouseLeave = (e: MouseEvent<HTMLAnchorElement>) => {
    props.onMouseLeave?.(e)
    if (preloadTimer) clearTimeout(preloadTimer)
  }

  const activeProps = isActive
    ? typeof props.activeProps === 'function'
      ? props.activeProps()
      : props.activeProps
    : typeof props.inactiveProps === 'function'
      ? props.inactiveProps()
      : props.inactiveProps

  return {
    ...activeProps,
    href,
    onClick: handleClick,
    onMouseEnter,
    onMouseLeave,
    'data-status': isActive ? 'active' : undefined,
  }
}

export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  props,
  ref,
) {
  const {
    activeProps,
    inactiveProps,
    activeOptions,
    preload,
    preloadDelay,
    children,
    disabled,
    to,
    from,
    params,
    search,
    hash,
    state,
    replace,
    resetScroll,
    viewTransition,
    mask,
    reloadDocument,
    href: _href,
    ...rest
  } = props
  const linkProps = useLinkProps(props)
  const resolvedChildren =
    typeof children === 'function'
      ? children({ isActive: linkProps['data-status'] === 'active' })
      : children
  return createElement('a', { ...rest, ...linkProps, ref, children: resolvedChildren })
})

export function createLink(Comp: any) {
  return forwardRef((props: any, ref) => {
    const linkProps = useLinkProps(props)
    return createElement(Comp, { ...props, ...linkProps, ref })
  })
}

export function linkOptions<T extends NavigateOptions>(opts: T): T {
  return opts
}

export type InferDescendantToPaths = any
export type RelativeToPath = any
export type RelativeToParentPath = any
export type RelativeToCurrentPath = any
export type AbsoluteToPath = any
export type RelativeToPathAutoComplete = any
export type ToOptions = NavigateOptions
export type ToMaskOptions = any
export type ToSubOptions = any
export type ResolveRoute = any
export type SearchParamOptions = any
export type PathParamOptions = any
export type ToPathOption = any
export type LinkOptions = NavigateOptions
export type MakeOptionalPathParams = any
export type FileRouteTypes = any
export type RouteContextParameter = any
export type BeforeLoadContextParameter = any
export type ResolveAllContext = any
export type ResolveAllParamsFromParent = any
export type ResolveFullSearchSchema = any
export type ResolveFullSearchSchemaInput = any
export type RouteIds = any
export type NavigateFn = any
export type BuildLocationFn = any
export type FullSearchSchemaOption = any
export type MakeRemountDepsOptionsUnion = any
export type RemountDepsOptions = any
export type ResolveFullPath = any
export type AnyRouteWithContext = any
export type AnyRouterWithContext = any
export type CommitLocationOptions = any
export type MatchLocation = any
export type UseNavigateResult = any
export type AnyRedirect = any
export type Redirect = any
export type RedirectOptions = any
export type ResolvedRedirect = any
export type MakeRouteMatch = any
export type MakeRouteMatchUnion = any
export type RouteMatch = any
export type AnyRouteMatch = any
export type RouteContextFn = any
export type RouteContextOptions = any
export type BeforeLoadContextOptions = any
export type ContextOptions = any
export type RouteOptions = any
export type FileBaseRouteOptions = any
export type BaseRouteOptions = any
export type UpdatableRouteOptions = any
export type RouteLoaderFn = any
export type LoaderFnContext = any
export type LazyRouteOptions = any
export type AnyRouter = any
export type RegisteredRouter = any
export type RouterContextOptions = any
export type ControllablePromise = any
export type InjectedHtmlEntry = any
export type RouterOptions = any
export type RouterState = any
export type ListenerFn = any
export type BuildNextOptions = any
export type RouterConstructorOptions = any
export type RouterEvents = any
export type RouterEvent = any
export type RouterListener = any
export type RouteConstraints = any
export type RouteMask = any
export type MatchRouteOptions = any
export type CreateLazyFileRoute = any
export type UseLinkPropsOptions = LinkProps
export type ActiveLinkOptions = LinkProps
export type LinkComponent = typeof Link
export type LinkComponentProps = LinkProps
export type CreateLinkProps = LinkProps
export type LinkComponentRoute<T = any> = typeof Link

void functionalUpdate
