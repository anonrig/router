import { useContext } from 'react'
import { dummyMatchContext, matchContext } from './match-context'
import { useRouter } from './use-router'
import { useRouterState } from './use-router-state'
import type { StructuralSharingOption, ValidateSelected } from './structural-sharing'
import type {
  AnyRouter,
  MakeRouteMatch,
  MakeRouteMatchUnion,
  StrictOrFrom,
  ThrowConstraint,
  ThrowOrOptional,
  RegisteredRouter,
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
  const _router = useRouter<TRouter>()
  const nearest = useContext(opts?.from ? dummyMatchContext : matchContext)
  const from = opts?.from ?? nearest

  return useRouterState({
    structuralSharing: opts?.structuralSharing,
    select: (state) => {
      const matches = state.matches
      const match = from
        ? matches.find((m: any) => m.routeId === from)
        : matches[matches.length - 1]
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
