import { Suspense, useCallback, useState, type ReactNode } from 'react'
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
  type ResolveRoute,
  type RegisteredRouter,
  type ToSubOptionsProps,
} from 'speedy-router-core'
import { isServer } from 'speedy-router-core/is-server'
import { CatchBoundary } from './catch-boundary'
import { Match, renderPending } from './match'
import { errorResetContext, matchContext } from './match-context'
import { SafeFragment } from './safe-fragment'
import { settleOwner, Transitioner } from './transitioner'
import { useLayoutEffect } from './utils'
import { useRouter } from './use-router'
import { useRouterState } from './use-router-state'
import { useStore } from './use-store'
import { useMatch } from './use-match'
import { deepEqual } from 'speedy-router-core'
import type { StructuralSharingOption, ValidateSelected } from './structural-sharing'

export function Matches() {
  const router = useRouter()
  const rootRoute = router.routesById[rootRouteId]
  const pendingElement = renderPending(router, rootRoute)
  const ResolvedSuspense = (isServer ?? router.isServer) || router.ssr ? SafeFragment : Suspense
  const [, setRouter] = useState<AnyRouter>()

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
  const matches = (
    (isServer ?? router.isServer)
      ? router.stores.matches.get()
      : // eslint-disable-next-line react-hooks/rules-of-hooks
        useRouterState({
          select: (state) => acknowledgement[0 /* offered */] ?? state.matches,
        })
  ) as ReturnType<typeof router.stores.matches.get>
  const match = matches[0]
  const routeId = match?.routeId
  let errorReset = ''
  for (let i = 0; i < matches.length; i++) {
    const item = matches[i]!
    errorReset += `${item.id}:${item.status}:${item.updatedAt}:`
  }

  useLayoutEffect(() => {
    if (acknowledgement[0 /* offered */] === matches) {
      settleOwner(acknowledgement, true)
    }
  }, [acknowledgement, matches])

  const matchComponent = routeId ? <Match routeId={routeId} /> : null

  return (
    <errorResetContext.Provider value={errorReset}>
      <matchContext.Provider value={routeId}>
        {router.options.disableGlobalCatchBoundary ? (
          matchComponent
        ) : (
          <CatchBoundary
            getResetKey={() => errorReset}
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
    </errorResetContext.Provider>
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
    structuralSharing: opts?.structuralSharing,
    select: (s) => (opts?.select ? opts.select(s.matches as any) : (s.matches as any)),
  }) as UseMatchesResult<TRouter, TSelected>
}

/** Select the matches around the calling route (parents or children). */
function useRelativeMatches<
  TRouter extends AnyRouter,
  TSelected,
  TStructuralSharing extends boolean,
>(
  opts:
    | (UseMatchesBaseOptions<TRouter, TSelected, TStructuralSharing> &
        StructuralSharingOption<TRouter, TSelected, TStructuralSharing>)
    | undefined,
  pick: (matches: Array<any>, index: number) => Array<any>,
): UseMatchesResult<TRouter, TSelected> {
  const routeId = useMatch({ select: (m: any) => m?.routeId } as any)
  return useRouterState({
    structuralSharing: opts?.structuralSharing,
    select: (s) => {
      const index = s.matches.findIndex((m: any) => m.routeId === routeId)
      const picked = pick(s.matches, index)
      return opts?.select ? opts.select(picked as any) : (picked as any)
    },
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
  return useRelativeMatches<TRouter, TSelected, TStructuralSharing>(opts, (matches, index) =>
    matches.slice(0, Math.max(index, 0)),
  )
}

export function useChildMatches<
  TRouter extends AnyRouter = RegisteredRouter,
  TSelected = unknown,
  TStructuralSharing extends boolean = boolean,
>(
  opts?: UseMatchesBaseOptions<TRouter, TSelected, TStructuralSharing> &
    StructuralSharingOption<TRouter, TSelected, TStructuralSharing>,
): UseMatchesResult<TRouter, TSelected> {
  return useRelativeMatches<TRouter, TSelected, TStructuralSharing>(opts, (matches, index) =>
    matches.slice(index + 1),
  )
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
  return useCallback(((opts: any = {}) => router.matchRoute(opts)) as any, [router, revision])
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
