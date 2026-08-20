import { useContext } from 'react'
import { matchContext } from './match-context'
import { useRouter } from './use-router'
import { useRouterState } from './use-router-state'
import type { StructuralSharingOption, ValidateSelected } from './structural-sharing'
import {
  trimPathRight,
  type AnyRouter,
  type MakeRouteMatch,
  type MakeRouteMatchUnion,
  type StrictOrFrom,
  type ThrowConstraint,
  type ThrowOrOptional,
  type RegisteredRouter,
} from 'speedy-router-core'

export interface UseMatchBaseOptions<
  TRouter extends AnyRouter,
  TFrom,
  TStrict extends boolean,
  TThrow extends boolean,
  TSelected,
  TStructuralSharing extends boolean,
> {
  select?: (
    match: MakeRouteMatch<TRouter['routeTree'], TFrom, TStrict>,
  ) => ValidateSelected<TRouter, TSelected, TStructuralSharing>
  shouldThrow?: TThrow
}

export type UseMatchRoute<out TFrom> = <
  TRouter extends AnyRouter = RegisteredRouter,
  TSelected = unknown,
  TStructuralSharing extends boolean = boolean,
>(
  opts?: UseMatchBaseOptions<TRouter, TFrom, true, true, TSelected, TStructuralSharing> &
    StructuralSharingOption<TRouter, TSelected, TStructuralSharing>,
) => UseMatchResult<TRouter, TFrom, true, TSelected>

export type UseMatchOptions<
  TRouter extends AnyRouter,
  TFrom extends string | undefined,
  TStrict extends boolean,
  TThrow extends boolean,
  TSelected,
  TStructuralSharing extends boolean,
> = StrictOrFrom<TRouter, TFrom, TStrict> &
  UseMatchBaseOptions<TRouter, TFrom, TStrict, TThrow, TSelected, TStructuralSharing> &
  StructuralSharingOption<TRouter, TSelected, TStructuralSharing>

export type UseMatchResult<
  TRouter extends AnyRouter,
  TFrom,
  TStrict extends boolean,
  TSelected,
> = unknown extends TSelected
  ? TStrict extends true
    ? MakeRouteMatch<TRouter['routeTree'], TFrom, TStrict>
    : MakeRouteMatchUnion<TRouter>
  : TSelected

export function useMatch<
  TRouter extends AnyRouter = RegisteredRouter,
  const TFrom extends string | undefined = undefined,
  TStrict extends boolean = true,
  TThrow extends boolean = true,
  TSelected = unknown,
  TStructuralSharing extends boolean = boolean,
>(
  opts: UseMatchOptions<
    TRouter,
    TFrom,
    TStrict,
    ThrowConstraint<TStrict, TThrow>,
    TSelected,
    TStructuralSharing
  >,
): ThrowOrOptional<UseMatchResult<TRouter, TFrom, TStrict, TSelected>, TThrow> {
  const router = useRouter<TRouter>()
  const nearest = useContext(matchContext)
  const from = opts?.from ?? nearest

  return useRouterState({
    structuralSharing: opts?.structuralSharing,
    select: (state) => {
      const matches = state.matches
      const match = from ? findMatchFrom(router, matches, from) : matches[matches.length - 1]
      if (!match) {
        if (opts?.shouldThrow === false || opts?.strict === false) {
          return undefined as any
        }
        throw new Error(`Invariant failed: Could not find an active match from "${String(from)}"`)
      }
      return opts?.select ? opts.select(match as any) : (match as any)
    },
  }) as any
}

function findMatchFrom(
  router: { routesById?: Record<string, any>; routesByPath?: Record<string, any> },
  matches: Array<{ routeId: string }>,
  from: string,
) {
  const byId = matches.find((match) => match.routeId === from)
  if (byId) return byId

  const target =
    router.routesById?.[from] ??
    router.routesByPath?.[from] ??
    router.routesByPath?.[trimPathRight(from)]
  if (target?.id) {
    const resolved = matches.find((match) => match.routeId === target.id)
    if (resolved) return resolved
  }

  // `routesByPath` never records `fullPath === '/'`, so `from: '/'` has to
  // pick the active index from the current match list. Pathless layouts that
  // inherit `/` are skipped unless they themselves are the index route.
  if (from === '/') {
    for (let i = matches.length - 1; i >= 0; i--) {
      const route = router.routesById?.[matches[i]!.routeId]
      if (!route || route.isRoot || route.id === '__root__') continue
      if (route.path === '/' || route.options?.path === '/') return matches[i]
    }
  }

  return undefined
}
