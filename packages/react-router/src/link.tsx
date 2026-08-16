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
import { exactPathTest, functionalUpdate, preloadWarning } from '@anonrig/router-core'
import { useIntersectionObserver } from './utils'
import { useRouter } from './use-router'
import { useRouterState } from './use-router-state'
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
    preloadIntentProximity?: number
    disabled?: boolean
    target?: string
    children?: ReactNode | ((state: { isActive: boolean }) => ReactNode)
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
    [router, props.to, props.params, props.search, props.hash, props.from, props.href],
  )

  const href = router.history.createHref(`${next.pathname}${next.searchStr}${next.hash}`)
  const isActive = exactPathTest(location.pathname, next.pathname, router.basepath)
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
    ref,
    onClick: handleClick,
    onMouseEnter,
    onMouseLeave,
    onFocus,
    onBlur,
    onTouchStart,
    'data-status': isActive ? 'active' : undefined,
  } as AnchorHTMLAttributes<HTMLAnchorElement>
}

export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function LinkImpl(props, ref) {
  const { children, href: _href, ...rest } = props
  void _href
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
  return createElement('a', { ...rest, ...linkProps, ref: setRefs, children: resolvedChildren })
}) as unknown as import('./link-types').LinkComponent<'a'>

export const createLink = /*#__PURE__*/ ((Comp: any) => {
  return forwardRef((props: any, forwardedRef) => {
    const linkProps = useLinkProps(props)
    return createElement(Comp, { ...props, ...linkProps, ref: forwardedRef })
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

void functionalUpdate
