import {
  createElement,
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type AnchorHTMLAttributes,
  type ComponentPropsWithRef,
  type EventHandler,
  type FocusEvent,
  type MouseEvent,
  type ReactNode,
  type SyntheticEvent,
} from 'react'
import {
  deepEqual,
  exactPathTest,
  functionalUpdate,
  isDangerousProtocol,
  preloadWarning,
  removeTrailingSlash,
} from 'speedy-router-core'
import { useHydrated } from './client-only'
import { useIntersectionObserver, useProximityPreload, useForwardedRef } from './utils'
import { useRouter } from './use-router'
import { useStore } from './use-store'
import type { ActiveOptions, AnyRouter, NavigateOptions, ParsedLocation } from 'speedy-router-core'

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
    _asChild?: any
  }

const STATIC_EMPTY_OBJECT = {}
const STATIC_ACTIVE_OBJECT = { className: 'active' }
const STATIC_DISABLED_PROPS = { role: 'link', 'aria-disabled': true }
const STATIC_ACTIVE_PROPS = { 'data-status': 'active', 'aria-current': 'page' }

export const INTERNAL_LINK_KEYS = new Set([
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
  '_asChild',
])

const DEST_KEYS = [
  'to',
  'from',
  'href',
  'params',
  'search',
  'hash',
  'state',
  'replace',
  'resetScroll',
  'viewTransition',
  'ignoreBlocker',
  'reloadDocument',
  'mask',
  'publicHref',
  'unsafeRelative',
  '_fromLocation',
  'leaveParams',
  'hashScrollIntoView',
  'startTransition',
  'slots',
] as const

function destFromLinkProps(props: Record<string, unknown>): Record<string, unknown> {
  const dest: Record<string, unknown> = {}
  for (const key of DEST_KEYS) {
    const value = props[key]
    if (value !== undefined) dest[key] = value
  }
  // A real `to` must win over leftover/placeholder `href` (`#`, Next wrappers).
  // `buildLocation({ href })` otherwise replaces `to` with the href pathname.
  if (dest.to != null && dest.href != null) {
    delete dest.href
  }
  return dest
}

function omitInternalKeys(props: Record<string, unknown>) {
  const out: Record<string, unknown> = { ...props }
  for (const key of INTERNAL_LINK_KEYS) {
    delete out[key]
  }
  return out
}

function isSafeInternal(to: unknown) {
  if (typeof to !== 'string') return false
  const zero = to.charCodeAt(0)
  if (zero === 47) return to.charCodeAt(1) !== 47
  return zero === 46
}

function useValueStable<T>(value: T): T {
  const ref = useRef(value)
  // `ignoreUndefined: false` is required: an explicit `undefined` clears an
  // inherited param or search key, so `{}` and `{ category: undefined }` build
  // different locations and must not be treated as equal here.
  if (!deepEqual(ref.current, value, { ignoreUndefined: false })) {
    ref.current = value
  }
  return ref.current
}

function compareLinkState(a: LinkState, b: LinkState) {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2]
}

function blockDangerousLink(href: string, protocolAllowlist: AnyRouter['protocolAllowlist']) {
  if (!isDangerousProtocol(href, protocolAllowlist)) return false
  if (process.env.NODE_ENV !== 'production') {
    console.warn(`Blocked Link with dangerous protocol: ${href}`)
  }
  return true
}

function resolveExternalLink(
  hrefOption: { href: string; external?: boolean } | undefined,
  to: unknown,
  protocolAllowlist: AnyRouter['protocolAllowlist'],
): string | undefined {
  if (hrefOption?.external) {
    return blockDangerousLink(hrefOption.href, protocolAllowlist) ? undefined : hrefOption.href
  }
  if (isSafeInternal(to) || typeof to !== 'string' || to.indexOf(':') === -1) {
    return undefined
  }
  if (!URL.canParse(to) || blockDangerousLink(to, protocolAllowlist)) return undefined
  return to
}

function resolveIsActive(
  location: ParsedLocation,
  next: ParsedLocation,
  activeOptions: ActiveOptions | undefined,
  basepath: string,
  isHydrated: boolean,
  isExternal: boolean,
): boolean {
  if (isExternal) return false
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
    return isHydrated && location.hash === next.hash
  }
  return true
}

function getHrefOption(
  publicHref: string | undefined,
  external: boolean | undefined,
  history: AnyRouter['history'],
  disabled: boolean | undefined,
) {
  if (disabled) return undefined
  if (external) {
    return { href: publicHref ?? '', external: true as const }
  }
  return {
    href: history.createHref(publicHref ?? '') || '/',
    external: false as const,
  }
}

type LinkState = [href: string | undefined, externalLink: string | undefined, isActive: boolean]

const timeoutMap = new WeakMap<object, ReturnType<typeof setTimeout>>()
const cancelPreload = (eventTarget: object) => {
  clearTimeout(timeoutMap.get(eventTarget))
  timeoutMap.delete(eventTarget)
}

const composeHandlers = (handlers: Array<undefined | EventHandler<any>>) => (e: SyntheticEvent) => {
  for (const handler of handlers) {
    if (!handler) continue
    if (e.defaultPrevented) return
    handler(e)
  }
}

function useLinkPropsImpl(
  options: LinkProps,
  forwardedRef?: { current: any } | ((instance: any) => void) | null,
): ComponentPropsWithRef<'a'> {
  const router = useRouter()
  const innerRef = useForwardedRef<Element>(forwardedRef)

  const {
    activeProps,
    inactiveProps,
    activeOptions,
    to,
    preload: userPreload,
    preloadDelay: userPreloadDelay,
    preloadIntentProximity: userPreloadIntentProximity,
    hashScrollIntoView,
    replace,
    startTransition,
    resetScroll,
    viewTransition,
    children,
    target,
    disabled,
    style,
    className,
    onClick,
    onBlur,
    onFocus,
    onMouseEnter,
    onMouseLeave,
    onTouchStart,
    ignoreBlocker,
    params: _params,
    search: _search,
    hash: _hash,
    state: _state,
    mask: _mask,
    reloadDocument: _reloadDocument,
    unsafeRelative: _unsafeRelative,
    from: _from,
    _fromLocation,
    href: _href,
    _asChild,
    ...rest
  } = options

  const propsSafeToSpread = omitInternalKeys(rest as Record<string, unknown>)

  const isHydrated = useHydrated()
  const stableSearch = useValueStable(options.search)
  const stableParams = useValueStable(options.params)
  const stableActiveOptions = useValueStable(activeOptions)
  const _options = useMemo(
    () => destFromLinkProps(options as Record<string, unknown>),
    // Destination identity is pinned to these fields so inline params/search
    // objects do not rebuild the store selector on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      router,
      options.from,
      options._fromLocation,
      options.hash,
      options.to,
      options.href,
      stableSearch,
      stableParams,
      options.state,
      options.mask,
      options.unsafeRelative,
      options.reloadDocument,
      options.replace,
      options.resetScroll,
      options.viewTransition,
      options.ignoreBlocker,
      options.hashScrollIntoView,
      options.startTransition,
      (options as Record<string, unknown>).publicHref,
      (options as Record<string, unknown>).leaveParams,
      (options as Record<string, unknown>).slots,
    ],
  )

  const selectLinkState = useCallback(
    (state: { location: ParsedLocation }): LinkState => {
      const location = state.location
      const next = router.buildLocation({
        _fromLocation: location,
        ..._options,
      } as any)

      const hrefOption = getHrefOption(
        next.maskedLocation ? next.maskedLocation.publicHref : next.publicHref,
        next.maskedLocation ? next.maskedLocation.external : next.external,
        router.history,
        disabled,
      )

      const resolvedExternal = resolveExternalLink(hrefOption, to, router.protocolAllowlist)

      return [
        disabled ? undefined : hrefOption?.href,
        disabled ? undefined : resolvedExternal,
        resolveIsActive(
          location,
          next,
          stableActiveOptions,
          router.basepath,
          isHydrated,
          resolvedExternal !== undefined,
        ),
      ]
    },
    [stableActiveOptions, disabled, isHydrated, _options, router, to],
  )

  const [href, externalLink, isActive] = useStore(
    router.stores.state,
    selectLinkState,
    compareLinkState,
  )

  const resolvedActiveProps: AnchorHTMLAttributes<HTMLAnchorElement> = isActive
    ? (functionalUpdate(activeProps as any, {}) ?? STATIC_ACTIVE_OBJECT)
    : STATIC_EMPTY_OBJECT

  const resolvedInactiveProps: AnchorHTMLAttributes<HTMLAnchorElement> = isActive
    ? STATIC_EMPTY_OBJECT
    : (functionalUpdate(inactiveProps as any, {}) ?? STATIC_EMPTY_OBJECT)

  const resolvedClassName = [
    className,
    resolvedActiveProps.className,
    resolvedInactiveProps.className,
  ]
    .filter(Boolean)
    .join(' ')

  const resolvedStyle = (style || resolvedActiveProps.style || resolvedInactiveProps.style) && {
    ...style,
    ...resolvedActiveProps.style,
    ...resolvedInactiveProps.style,
  }

  const hasRenderFetched = useRef(false)

  const preload =
    options.reloadDocument || externalLink || disabled
      ? false
      : (userPreload ?? router.options.defaultPreload)
  const preloadDelay = userPreloadDelay ?? router.options.defaultPreloadDelay ?? 0
  const preloadProximity =
    preload === 'intent'
      ? (userPreloadIntentProximity ?? router.options.defaultPreloadIntentProximity ?? 0)
      : 0

  const doPreload = useCallback(() => {
    router.preloadRoute(_options as NavigateOptions).catch((err) => {
      console.warn(err)
      console.warn(preloadWarning)
    })
  }, [router, _options])

  const enqueuePreload = useCallback(
    (e?: MouseEvent | FocusEvent | IntersectionObserverEntry) => {
      if (!e) {
        cancelPreload(innerRef)
        return
      }

      if (!((e as IntersectionObserverEntry).isIntersecting ?? preload === 'intent')) {
        if ((e as IntersectionObserverEntry).isIntersecting === false) {
          cancelPreload(innerRef)
        }
        return
      }

      if (!preloadDelay) {
        doPreload()
        return
      }

      if (timeoutMap.has(innerRef)) return

      timeoutMap.set(
        innerRef,
        setTimeout(() => {
          timeoutMap.delete(innerRef)
          doPreload()
        }, preloadDelay),
      )
    },
    [doPreload, innerRef, preload, preloadDelay],
  )

  useIntersectionObserver(innerRef, enqueuePreload, preload !== 'viewport')
  useProximityPreload(innerRef, enqueuePreload, preloadProximity)

  useEffect(() => {
    if (hasRenderFetched.current) return
    if (preload === 'render') {
      doPreload()
      hasRenderFetched.current = true
    }
  }, [doPreload, preload])

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (disabled) {
      e.preventDefault()
      return
    }

    const elementTarget = (e.currentTarget as HTMLAnchorElement).getAttribute('target')
    const effectiveTarget = target !== undefined ? target : elementTarget

    if (
      !(e.metaKey || e.altKey || e.ctrlKey || e.shiftKey) &&
      !e.defaultPrevented &&
      (!effectiveTarget || effectiveTarget === '_self') &&
      e.button === 0
    ) {
      e.preventDefault()
      void router.navigate({
        ..._options,
        replace,
        resetScroll,
        hashScrollIntoView,
        startTransition,
        viewTransition,
        ignoreBlocker,
      } as NavigateOptions)
    }
  }

  if (externalLink) {
    return {
      ...propsSafeToSpread,
      ref: innerRef,
      href: externalLink,
      ...(children && { children }),
      ...(target && { target }),
      ...(disabled && { disabled }),
      ...(style && { style }),
      ...(className && { className }),
      ...(onClick && { onClick }),
      ...(onBlur && { onBlur }),
      ...(onFocus && { onFocus }),
      ...(onMouseEnter && { onMouseEnter }),
      ...(onMouseLeave && { onMouseLeave }),
      ...(onTouchStart && { onTouchStart }),
    } as ComponentPropsWithRef<'a'>
  }

  const handleTouchStart = () => {
    if (preload !== 'intent') return
    doPreload()
  }

  const cancelIntentPreload = () => {
    if (preload === 'intent') {
      cancelPreload(innerRef)
    }
  }
  // With a proximity radius, pointer cancellation belongs to the radius exit:
  // leaving the element while still within range must keep the preload. Blur
  // has no radius, so tabbing away always clears a focus-scheduled preload.
  const handleMouseLeave = preloadProximity ? undefined : cancelIntentPreload

  return {
    ...propsSafeToSpread,
    ...resolvedActiveProps,
    ...resolvedInactiveProps,
    href,
    ref: innerRef,
    onClick: composeHandlers([onClick, handleClick]),
    onBlur: composeHandlers([onBlur, cancelIntentPreload]),
    onFocus: composeHandlers([onFocus, enqueuePreload]),
    onMouseEnter: composeHandlers([onMouseEnter, enqueuePreload]),
    onMouseLeave: composeHandlers([onMouseLeave, handleMouseLeave]),
    onTouchStart: composeHandlers([onTouchStart, handleTouchStart]),
    disabled: !!disabled,
    target,
    ...(resolvedStyle && { style: resolvedStyle }),
    ...(resolvedClassName && { className: resolvedClassName }),
    ...(disabled && STATIC_DISABLED_PROPS),
    ...(isActive && STATIC_ACTIVE_PROPS),
  } as ComponentPropsWithRef<'a'>
}

export const useLinkProps = useLinkPropsImpl as typeof import('./link-types').useLinkProps

export const Link = forwardRef<Element, any>(function LinkImpl(props, ref) {
  const { _asChild, ...rest } = props
  const { type: _type, ...linkProps } = useLinkPropsImpl(rest as LinkProps, ref as any)

  const children =
    typeof rest.children === 'function'
      ? rest.children({
          isActive: (linkProps as any)['data-status'] === 'active',
        })
      : rest.children

  if (!_asChild) {
    const { disabled: _, ...anchorProps } = linkProps as ComponentPropsWithRef<'a'> & {
      disabled?: boolean
    }
    return createElement('a', anchorProps, children)
  }
  return createElement(_asChild, linkProps, children)
}) as unknown as import('./link-types').LinkComponent<'a'>

export const createLink = /*#__PURE__*/ ((Comp: any) => {
  return forwardRef(function CreatedLink(props: any, ref) {
    return createElement(Link as any, { ...props, _asChild: Comp, ref })
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
