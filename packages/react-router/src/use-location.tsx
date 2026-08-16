import { useRouter } from './use-router'
import { useRouterState } from './use-router-state'
import type { StructuralSharingOption, ValidateSelected } from './structural-sharing'
import type { AnyRouter, RegisteredRouter, RouterState } from 'fast-router-core'

export interface UseLocationBaseOptions<
  TRouter extends AnyRouter,
  TSelected,
  TStructuralSharing extends boolean = boolean,
> {
  select?: (
    state: RouterState<TRouter['routeTree']>['location'],
  ) => ValidateSelected<TRouter, TSelected, TStructuralSharing>
}

export type UseLocationResult<TRouter extends AnyRouter, TSelected> = unknown extends TSelected
  ? RouterState<TRouter['routeTree']>['location']
  : TSelected

export function useLocation<
  TRouter extends AnyRouter = RegisteredRouter,
  TSelected = unknown,
  TStructuralSharing extends boolean = boolean,
>(
  opts?: UseLocationBaseOptions<TRouter, TSelected, TStructuralSharing> &
    StructuralSharingOption<TRouter, TSelected, TStructuralSharing>,
): UseLocationResult<TRouter, TSelected> {
  const router = useRouter({ warn: false })
  return useRouterState({
    select: (s) => (opts?.select ? opts.select(s.location) : s.location),
    structuralSharing: opts?.structuralSharing ?? router.options.defaultStructuralSharing,
  }) as UseLocationResult<TRouter, TSelected>
}
