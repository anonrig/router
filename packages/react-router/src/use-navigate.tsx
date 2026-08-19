import { useCallback, useLayoutEffect, useRef } from 'react'
import { useRouter } from './use-router'
import type {
  AnyRouter,
  FromPathOption,
  NavigateOptions,
  UseNavigateResult,
  RegisteredRouter,
} from 'speedy-router-core'

export function useNavigate<
  TRouter extends AnyRouter = RegisteredRouter,
  TDefaultFrom extends string = string,
>(_defaultOpts?: {
  from?: FromPathOption<TRouter, TDefaultFrom>
}): UseNavigateResult<TDefaultFrom> {
  const router = useRouter()

  return useCallback(
    (options: NavigateOptions) => {
      return router.navigate({
        ...options,
        from: options.from ?? _defaultOpts?.from,
      })
    },
    [_defaultOpts?.from, router],
  ) as UseNavigateResult<TDefaultFrom>
}

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
