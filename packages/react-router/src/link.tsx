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

  const href = router.history.createHref(`${next.pathname}${next.searchStr}${next.hash}`)

  const isActive = exactPathTest(location.pathname, next.pathname, router.basepath)

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
  } as AnchorHTMLAttributes<HTMLAnchorElement>
}

export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function LinkImpl(props, ref) {
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
      ? children({ isActive: (linkProps as any)['data-status'] === 'active' })
      : children
  return createElement('a', { ...rest, ...linkProps, ref, children: resolvedChildren })
}) as unknown as import('./link-types').LinkComponent<'a'>

export const createLink = ((Comp: any) => {
  return forwardRef((props: any, ref) => {
    const linkProps = useLinkProps(props)
    return createElement(Comp, { ...props, ...linkProps, ref })
  })
}) as typeof import('./link-types').createLink

export const linkOptions = ((opts: any) => opts) as typeof import('./link-types').linkOptions

export type {
  UseLinkPropsOptions,
  ActiveLinkOptions,
  LinkComponent,
  LinkComponentProps,
  CreateLinkProps,
  LinkComponentRoute,
} from './link-types'

void functionalUpdate
