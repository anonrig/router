import { Suspense, useState, type ReactNode } from 'react'
import {
  rootRouteId,
  type AnyRouter,
  type DeepPartial,
  type Expand,
  type MakeOptionalPathParams,
  type MakeOptionalSearchParams,
  type MakeRouteMatchUnion,
  type MaskOptions,
  type MatchRouteOptions,
  type RegisteredRouter,
  type ResolveRoute,
  type ToSubOptionsProps,
} from '@anonrig/router-core'
import { isServer } from '@anonrig/router-core/is-server'
import { CatchBoundary } from './catch-boundary'
import { Match, renderPending } from './match'
import { matchContext } from './match-context'
import { SafeFragment } from './safe-fragment'
import { settleOwner, Transitioner } from './transitioner'
import { useLayoutEffect } from './utils'
import { useRouter } from './use-router'
import { useRouterState } from './use-router-state'
import { useMatch } from './use-match'
import { deepEqual } from '@anonrig/router-core'
import type { StructuralSharingOption, ValidateSelected } from './structural-sharing'

export function Matches() {
  const router = useRouter()
  const rootRoute = router.routesById[rootRouteId]
  const pendingElement = renderPending(router, rootRoute)
  const ResolvedSuspense = (isServer ?? router.isServer) || router.ssr ? SafeFragment : Suspense
  const setRouter = useState<AnyRouter>()[1]

  const inner = (
    <>
      {!(isServer ?? router.isServer) && <Transitioner t={setRouter} />}
      <ResolvedSuspense fallback={pendingElement}>
        <MatchesInner />
      </ResolvedSuspense>
    </>
  )

  return router.options.InnerWrap ? (
    <router.options.InnerWrap>{inner}</router.options.InnerWrap>
  ) : (
    inner
  )
}

function MatchesInner() {
  const router = useRouter()
  const acknowledgement = (router._rendered ??= [])
  const matches =
    (isServer ?? router.isServer)
      ? router.stores.matches.get()
      : // eslint-disable-next-line react-hooks/rules-of-hooks
        useRouterState({
          select: (state) => acknowledgement[0 /* offered */] ?? state.matches,
        })
  const match = matches[0]
  const routeId = match?.routeId

  useLayoutEffect(() => {
    if (acknowledgement[0 /* offered */] === matches) {
      settleOwner(acknowledgement, true)
    }
  }, [acknowledgement, matches])

  const matchComponent = routeId ? <Match routeId={routeId} /> : null

  return (
    <matchContext.Provider value={routeId}>
      {router.options.disableGlobalCatchBoundary ? (
        matchComponent
      ) : (
        <CatchBoundary
          getResetKey={() => match}
          onCatch={
            process.env.NODE_ENV !== 'production'
              ? (error) => {
                  console.warn(
                    `Warning: The following error wasn't caught by any route! At the very least, consider setting an 'errorComponent' in your RootRoute!`,
                  )
                  console.warn(`Warning: ${error.message || error.toString()}`)
                }
              : undefined
          }
        >
          {matchComponent}
        </CatchBoundary>
      )}
    </matchContext.Provider>
  )
}

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
  return ((opts: any = {}) => router.matchRoute(opts)) as any
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

void deepEqual
