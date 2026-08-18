import { createElement, forwardRef } from 'react'
import { useLinkProps } from './link'

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
