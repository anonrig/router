import { useCallback, type ReactNode } from 'react'
import type {
  AnyRouter,
  DeepPartial,
  Expand,
  MakeOptionalPathParams,
  MakeOptionalSearchParams,
  MakeRouteMatchUnion,
  MaskOptions,
  MatchRouteOptions,
  ResolveRoute,
  RegisteredRouter,
  ToSubOptionsProps,
} from 'speedy-router-core'
import { useMatch } from './use-match'
import { useRouter } from './use-router'
import { useRouterState } from './use-router-state'
import { useStore } from './use-store'
import type { StructuralSharingOption, ValidateSelected } from './structural-sharing'

export interface UseMatchesBaseOptions<TRouter extends AnyRouter, TSelected, TStructuralSharing> {
  select?: (
    matches: Array<MakeRouteMatchUnion<TRouter>>,
  ) => ValidateSelected<TRouter, TSelected, TStructuralSharing>
}

export type UseMatchesResult<TRouter extends AnyRouter, TSelected> = unknown extends TSelected
  ? Array<MakeRouteMatchUnion<TRouter>>
  : TSelected

export function useMatches<
  TRouter extends AnyRouter = RegisteredRouter,
  TSelected = unknown,
  TStructuralSharing extends boolean = boolean,
>(
  opts?: UseMatchesBaseOptions<TRouter, TSelected, TStructuralSharing> &
    StructuralSharingOption<TRouter, TSelected, TStructuralSharing>,
): UseMatchesResult<TRouter, TSelected> {
  return useRouterState({
    select: (s) => (opts?.select ? opts.select(s.matches as any) : (s.matches as any)),
  }) as UseMatchesResult<TRouter, TSelected>
}

export function useParentMatches<
  TRouter extends AnyRouter = RegisteredRouter,
  TSelected = unknown,
  TStructuralSharing extends boolean = boolean,
>(
  opts?: UseMatchesBaseOptions<TRouter, TSelected, TStructuralSharing> &
    StructuralSharingOption<TRouter, TSelected, TStructuralSharing>,
): UseMatchesResult<TRouter, TSelected> {
  const routeId = useMatch({ select: (m: any) => m?.routeId } as any)
  return useRouterState({
    select: (s) => {
      const index = s.matches.findIndex((m: any) => m.routeId === routeId)
      const parents = s.matches.slice(0, Math.max(index, 0))
      return opts?.select ? opts.select(parents as any) : (parents as any)
    },
  }) as UseMatchesResult<TRouter, TSelected>
}

export function useChildMatches<
  TRouter extends AnyRouter = RegisteredRouter,
  TSelected = unknown,
  TStructuralSharing extends boolean = boolean,
>(
  opts?: UseMatchesBaseOptions<TRouter, TSelected, TStructuralSharing> &
    StructuralSharingOption<TRouter, TSelected, TStructuralSharing>,
): UseMatchesResult<TRouter, TSelected> {
  const routeId = useMatch({ select: (m: any) => m?.routeId } as any)
  return useRouterState({
    select: (s) => {
      const index = s.matches.findIndex((m: any) => m.routeId === routeId)
      const children = s.matches.slice(index + 1)
      return opts?.select ? opts.select(children as any) : (children as any)
    },
  }) as UseMatchesResult<TRouter, TSelected>
}

export type UseMatchRouteOptions<
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends string = string,
  TTo extends string | undefined = undefined,
  TMaskFrom extends string = TFrom,
  TMaskTo extends string = '',
> = ToSubOptionsProps<TRouter, TFrom, TTo> &
  DeepPartial<MakeOptionalSearchParams<TRouter, TFrom, TTo>> &
  DeepPartial<MakeOptionalPathParams<TRouter, TFrom, TTo>> &
  MaskOptions<TRouter, TMaskFrom, TMaskTo> &
  MatchRouteOptions

export function useMatchRoute<TRouter extends AnyRouter = RegisteredRouter>(): <
  const TFrom extends string = string,
  const TTo extends string | undefined = undefined,
  const TMaskFrom extends string = TFrom,
  const TMaskTo extends string = '',
>(
  opts: UseMatchRouteOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo>,
) => false | Expand<ResolveRoute<TRouter, TFrom, TTo>['types']['allParams']> {
  const router = useRouter()
  const revision = useStore((router.stores as any).matchRoute ?? router.stores.state)
  return useCallback((opts: any = {}) => router.matchRoute(opts), [router, revision]) as any
}

export type MakeMatchRouteOptions<
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends string = string,
  TTo extends string | undefined = undefined,
  TMaskFrom extends string = TFrom,
  TMaskTo extends string = '',
> = UseMatchRouteOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo> & {
  children?:
    | ((params?: Expand<ResolveRoute<TRouter, TFrom, TTo>['types']['allParams']>) => ReactNode)
    | ReactNode
}

export function MatchRoute<
  TRouter extends AnyRouter = RegisteredRouter,
  const TFrom extends string = string,
  const TTo extends string | undefined = undefined,
  const TMaskFrom extends string = TFrom,
  const TMaskTo extends string = '',
>(props: MakeMatchRouteOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo>): any {
  const matchRoute = useMatchRoute()
  const params = matchRoute(props as any) as boolean
  if (typeof props.children === 'function') {
    return (props.children as any)(params)
  }
  return params ? props.children : null
}
