import {
  createElement,
  forwardRef,
  useCallback,
  useEffect,
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
  isDangerousProtocol,
  preloadWarning,
  removeTrailingSlash,
} from '@anonrig/router-core'
import { useIntersectionObserver } from './utils'
import { useRouter } from './use-router'
import { useStore } from './use-store'
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

function isSafeInternal(to: unknown) {
  if (typeof to !== 'string') return false
  const zero = to.charCodeAt(0)
  if (zero === 47) return to.charCodeAt(1) !== 47
  return zero === 46
}

function resolveExternalLink(
  hrefOption: { href?: string; external?: boolean } | undefined,
  to: unknown,
  protocolAllowlist: Set<string>,
): string | undefined {
  if (hrefOption?.external && hrefOption.href) {
    if (isDangerousProtocol(hrefOption.href, protocolAllowlist)) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`Blocked Link with dangerous protocol: ${hrefOption.href}`)
      }
      return undefined
    }
    return hrefOption.href
  }
  if (isSafeInternal(to) || typeof to !== 'string' || to.indexOf(':') === -1) return undefined
  if (!URL.canParse(to)) return undefined
  if (isDangerousProtocol(to, protocolAllowlist)) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`Blocked Link with dangerous protocol: ${to}`)
    }
    return undefined
  }
  return to
}

type LinkState = [href: string | undefined, externalLink: string | undefined, isActive: boolean]

function compareLinkState(a: LinkState, b: LinkState) {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2]
}

export function useLinkProps(
  props: LinkProps,
  forwardedRef?: { current: HTMLAnchorElement | null },
): AnchorHTMLAttributes<HTMLAnchorElement> {
  const router = useRouter()
  const innerRef = useRef<HTMLAnchorElement | null>(null)
  const ref = forwardedRef ?? innerRef
  const preloadTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const didRenderPreload = useRef(false)
  const propsRef = useRef(props)
  propsRef.current = props

  const [href, externalLink, isActive] = useStore(
    router.stores.state,
    (state: { location: ParsedLocation }): LinkState => {
      const location = state.location
      if (typeof props.to === 'string' && !isSafeInternal(props.to) && props.to.indexOf(':') > -1) {
        const external = resolveExternalLink(undefined, props.to, router.protocolAllowlist)
        if (external) return [props.disabled ? undefined : external, external, false]
      }
      const next = router.buildLocation({
        _fromLocation: location,
        ...props,
      } as any)
      const publicHref = next.maskedLocation ? next.maskedLocation.publicHref : next.publicHref
      const isExternal = next.maskedLocation ? next.maskedLocation.external : next.external
      const builtHref = props.disabled
        ? undefined
        : isExternal
          ? publicHref
          : router.history.createHref(publicHref || `${next.pathname}${next.searchStr}${next.hash}`)
      const external = resolveExternalLink(
        isExternal ? { href: publicHref, external: true } : { href: builtHref },
        props.to,
        router.protocolAllowlist,
      )
      const resolvedHref = props.disabled ? undefined : (external ?? builtHref)
      return [
        resolvedHref,
        external,
        resolveIsActive(location, next, props.activeOptions, router.basepath),
      ]
    },
    compareLinkState,
  )

  const preload =
    props.reloadDocument || props.disabled || externalLink
      ? false
      : (props.preload ?? router.options.defaultPreload)
  const preloadDelay = props.preloadDelay ?? router.options.defaultPreloadDelay ?? 0

  const doPreload = useCallback(() => {
    const current = propsRef.current
    const enabled =
      current.reloadDocument || current.disabled
        ? false
        : (current.preload ?? router.options.defaultPreload)
    if (!enabled) return
    void router.preloadRoute(current).catch((err) => {
      console.warn(err)
      console.warn(preloadWarning)
    })
  }, [router])

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

  useIntersectionObserver(
    ref,
    enqueuePreload,
    preload !== 'viewport',
    undefined,
    `${String(props.to)}:${String(preload)}:${String(preloadDelay)}`,
    cancelPreload,
  )

  useEffect(() => {
    if (didRenderPreload.current) return
    if (preload === 'render') {
      doPreload()
      didRenderPreload.current = true
    }
  }, [doPreload, preload])

  useEffect(() => cancelPreload, [cancelPreload, preload, preloadDelay, props.to])

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (props.disabled) {
      e.preventDefault()
      return
    }
    props.onClick?.(e)
    if (externalLink) return
    const elementTarget = (e.currentTarget as HTMLAnchorElement).getAttribute('target')
    const effectiveTarget = props.target !== undefined ? props.target : elementTarget
    if (
      e.defaultPrevented ||
      e.button !== 0 ||
      (effectiveTarget && effectiveTarget !== '_self') ||
      e.metaKey ||
      e.altKey ||
      e.ctrlKey ||
      e.shiftKey
    ) {
      return
    }
    e.preventDefault()
    void router.navigate(propsRef.current)
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
    href: props.disabled ? undefined : externalLink || href,
    ref,
    className: className || undefined,
    style,
    target: props.target,
    disabled: props.disabled,
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
