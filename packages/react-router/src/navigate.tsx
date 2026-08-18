import { useLayoutEffect, useRef } from 'react'
import type { AnyRouter, NavigateOptions, RegisteredRouter } from 'speedy-router-core'
import { useNavigate } from './use-navigate'

export function Navigate<
  TRouter extends AnyRouter = RegisteredRouter,
  const TFrom extends string = string,
  const TTo extends string | undefined = undefined,
  const TMaskFrom extends string = TFrom,
  const TMaskTo extends string = '',
>(props: NavigateOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo>): null {
  const navigate = useNavigate()
  const previousPropsRef = useRef<NavigateOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo> | null>(
    null,
  )
  useLayoutEffect(() => {
    if (previousPropsRef.current !== props) {
      navigate(props)
      previousPropsRef.current = props
    }
  }, [props, navigate])
  return null
}
