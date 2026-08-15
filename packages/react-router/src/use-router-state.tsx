import { useRouter } from './use-router'
import { useStore } from './use-store'
import type { AnyRouter, RegisteredRouter, RouterState } from '@anonrig/router-core'
import type { StructuralSharingOption, ValidateSelected } from './structural-sharing'

export type UseRouterStateOptions<TRouter extends AnyRouter, TSelected, TStructuralSharing> = {
  router?: TRouter
  select?: (
    state: RouterState<TRouter['routeTree']>,
  ) => ValidateSelected<TRouter, TSelected, TStructuralSharing>
} & StructuralSharingOption<TRouter, TSelected, TStructuralSharing>

export type UseRouterStateResult<TRouter extends AnyRouter, TSelected> = unknown extends TSelected
  ? RouterState<TRouter['routeTree']>
  : TSelected

export function useRouterState<
  TRouter extends AnyRouter = RegisteredRouter,
  TSelected = unknown,
  TStructuralSharing extends boolean = boolean,
>(
  opts?: UseRouterStateOptions<TRouter, TSelected, TStructuralSharing>,
): UseRouterStateResult<TRouter, TSelected> {
  const contextRouter = useRouter<TRouter>({
    warn: opts?.router === undefined,
  })
  const router = opts?.router || contextRouter
  return useStore(
    router.stores.state,
    (opts?.select as any) ?? ((s: any) => s),
  ) as UseRouterStateResult<TRouter, TSelected>
}
