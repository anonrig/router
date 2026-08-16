import {
  createElement,
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type AnchorHTMLAttributes,
  type FocusEvent,
  type MouseEvent,
  type ReactNode,
  type TouchEvent,
} from 'react'
import {
  deepEqual,
  exactPathTest,
  functionalUpdate,
  preloadWarning,
  removeTrailingSlash,
} from '@anonrig/router-core'
import { useIntersectionObserver } from './utils'
import { useRouter } from './use-router'
import { useRouterState } from './use-router-state'
import type { ActiveOptions, NavigateOptions, ParsedLocation } from '@anonrig/router-core'

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
    preloadIntentProximity?: number
    disabled?: boolean
    target?: string
    children?: ReactNode | ((state: { isActive: boolean }) => ReactNode)
  }

const STATIC_ACTIVE_OBJECT = { className: 'active' }
const STATIC_DISABLED_PROPS = { role: 'link', 'aria-disabled': true }
const STATIC_ACTIVE_PROPS = { 'data-status': 'active', 'aria-current': 'page' }

const INTERNAL_LINK_KEYS = new Set([
  'to',
  'from',
  'params',
  'search',
  'hash',
  'state',
  'mask',
  'reloadDocument',
  'unsafeRelative',
  '_fromLocation',
  'activeProps',
  'inactiveProps',
  'activeOptions',
  'preload',
  'preloadDelay',
  'preloadIntentProximity',
  'hashScrollIntoView',
  'replace',
  'startTransition',
  'resetScroll',
  'viewTransition',
  'ignoreBlocker',
  'disabled',
  'children',
  'href',
])

function resolveIsActive(
  location: ParsedLocation,
  next: ParsedLocation,
  activeOptions: ActiveOptions | undefined,
  basepath: string,
): boolean {
  if (activeOptions?.exact) {
    if (!exactPathTest(location.pathname, next.pathname, basepath)) return false
  } else {
    const currentPathSplit = removeTrailingSlash(location.pathname, basepath)
    const nextPathSplit = removeTrailingSlash(next.pathname, basepath)
    const pathIsFuzzyEqual =
      currentPathSplit.startsWith(nextPathSplit) &&
      (currentPathSplit.length === nextPathSplit.length ||
        currentPathSplit[nextPathSplit.length] === '/')
    if (!pathIsFuzzyEqual) return false
  }

  if (activeOptions?.includeSearch ?? true) {
    const searchTest = deepEqual(location.search, next.search, {
      partial: !activeOptions?.exact,
      ignoreUndefined: !activeOptions?.explicitUndefined,
    })
    if (!searchTest) return false
  }

  if (activeOptions?.includeHash) {
    return location.hash === next.hash
  }
  return true
}

function omitInternalProps(props: Record<string, unknown>) {
  const out: Record<string, unknown> = {}
  for (const key in props) {
    if (!INTERNAL_LINK_KEYS.has(key)) out[key] = props[key]
  }
  return out
}

export function useLinkProps(
  props: LinkProps,
  forwardedRef?: { current: HTMLAnchorElement | null },
): AnchorHTMLAttributes<HTMLAnchorElement> {
  const router = useRouter()
  const location = useRouterState({ select: (s) => s.location })
  const innerRef = useRef<HTMLAnchorElement | null>(null)
  const ref = forwardedRef ?? innerRef
  const preloadTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const didRenderPreload = useRef(false)

  const next = useMemo(
    () => router.buildLocation(props),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [router, props.to, props.params, props.search, props.hash, props.from, props.href, location],
  )

  const href = router.history.createHref(
    next.publicHref || `${next.pathname}${next.searchStr}${next.hash}`,
  )
  const isActive = resolveIsActive(location, next, props.activeOptions, router.basepath)
  const preload =
    props.reloadDocument || props.disabled
      ? false
      : (props.preload ?? router.options.defaultPreload)
  const preloadDelay = props.preloadDelay ?? router.options.defaultPreloadDelay ?? 0

  const doPreload = useCallback(() => {
    void router.preloadRoute(props).catch((err) => {
      console.warn(err)
      console.warn(preloadWarning)
    })
  }, [router, props])

  const cancelPreload = useCallback(() => {
    if (preloadTimer.current) {
      clearTimeout(preloadTimer.current)
      preloadTimer.current = undefined
    }
  }, [])

  const enqueuePreload = useCallback(
    (event?: MouseEvent | FocusEvent | IntersectionObserverEntry) => {
      if (!event) {
        cancelPreload()
        return
      }
      if ('isIntersecting' in event) {
        if (!event.isIntersecting) {
          cancelPreload()
          return
        }
      } else if (preload !== 'intent') {
        return
      }
      if (!preloadDelay) {
        doPreload()
        return
      }
      if (preloadTimer.current) return
      preloadTimer.current = setTimeout(() => {
        preloadTimer.current = undefined
        doPreload()
      }, preloadDelay)
    },
    [cancelPreload, doPreload, preload, preloadDelay],
  )

  useIntersectionObserver(ref, enqueuePreload, preload !== 'viewport')

  useEffect(() => {
    if (didRenderPreload.current) return
    if (preload === 'render') {
      doPreload()
      didRenderPreload.current = true
    }
  }, [doPreload, preload])

  useEffect(() => cancelPreload, [cancelPreload])

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

  const onMouseEnter = (e: MouseEvent<HTMLAnchorElement>) => {
    props.onMouseEnter?.(e)
    if (preload === 'intent') enqueuePreload(e)
  }
  const onMouseLeave = (e: MouseEvent<HTMLAnchorElement>) => {
    props.onMouseLeave?.(e)
    if (preload === 'intent') cancelPreload()
  }
  const onFocus = (e: FocusEvent<HTMLAnchorElement>) => {
    props.onFocus?.(e)
    if (preload === 'intent') enqueuePreload(e)
  }
  const onBlur = (e: FocusEvent<HTMLAnchorElement>) => {
    props.onBlur?.(e)
    if (preload === 'intent') cancelPreload()
  }
  const onTouchStart = (e: TouchEvent<HTMLAnchorElement>) => {
    props.onTouchStart?.(e)
    if (preload === 'intent') doPreload()
  }

  const resolvedActiveProps = isActive
    ? (functionalUpdate(props.activeProps as any, {}) ?? STATIC_ACTIVE_OBJECT)
    : {}
  const resolvedInactiveProps = isActive
    ? {}
    : (functionalUpdate(props.inactiveProps as any, {}) ?? {})

  const className = [
    props.className,
    resolvedActiveProps.className,
    resolvedInactiveProps.className,
  ]
    .filter(Boolean)
    .join(' ')
  const style =
    props.style || resolvedActiveProps.style || resolvedInactiveProps.style
      ? { ...props.style, ...resolvedActiveProps.style, ...resolvedInactiveProps.style }
      : undefined

  return {
    ...omitInternalProps(props as Record<string, unknown>),
    ...resolvedActiveProps,
    ...resolvedInactiveProps,
    href,
    ref,
    className: className || undefined,
    style,
    target: props.target,
    onClick: handleClick,
    onMouseEnter,
    onMouseLeave,
    onFocus,
    onBlur,
    onTouchStart,
    ...(props.disabled ? STATIC_DISABLED_PROPS : undefined),
    ...(isActive ? STATIC_ACTIVE_PROPS : undefined),
  } as AnchorHTMLAttributes<HTMLAnchorElement>
}

export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function LinkImpl(props, ref) {
  const { children } = props
  const innerRef = useRef<HTMLAnchorElement | null>(null)
  const setRefs = useCallback(
    (node: HTMLAnchorElement | null) => {
      innerRef.current = node
      if (typeof ref === 'function') {
        ref(node)
      } else if (ref) {
        ;(ref as { current: HTMLAnchorElement | null }).current = node
      }
    },
    [ref],
  )
  const linkProps = useLinkProps(props, innerRef)
  const resolvedChildren =
    typeof children === 'function'
      ? children({ isActive: (linkProps as any)['data-status'] === 'active' })
      : children
  const { disabled: _disabled, ...anchorProps } =
    linkProps as AnchorHTMLAttributes<HTMLAnchorElement> & {
      disabled?: boolean
    }
  void _disabled
  return createElement('a', { ...anchorProps, ref: setRefs, children: resolvedChildren })
}) as unknown as import('./link-types').LinkComponent<'a'>

export const createLink = /*#__PURE__*/ ((Comp: any) => {
  return forwardRef((props: any, forwardedRef) => {
    const { children, ...rest } = props
    const linkProps = useLinkProps(rest)
    const resolvedChildren =
      typeof children === 'function'
        ? children({ isActive: (linkProps as any)['data-status'] === 'active' })
        : children
    return createElement(Comp, { ...linkProps, ref: forwardedRef, children: resolvedChildren })
  })
}) as typeof import('./link-types').createLink

export const linkOptions = /*#__PURE__*/ ((opts: any) =>
  opts) as typeof import('./link-types').linkOptions

export type {
  UseLinkPropsOptions,
  ActiveLinkOptions,
  LinkComponent,
  LinkComponentProps,
  CreateLinkProps,
  LinkComponentRoute,
} from './link-types'
