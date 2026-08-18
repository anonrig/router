import { useCallback, useRef } from 'react'
import { replaceEqualDeep } from 'speedy-router-core'
import { useRouter } from './use-router'
import { useStore } from './use-store'
import type { AnyRouter, RouterState } from 'speedy-router-core'
import type { RegisteredRouter } from './registered-router'
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
  const sharing = opts?.structuralSharing ?? false
  const userSelect = (opts?.select as any) ?? identitySelect
  const sharedRef = useRef<any>(undefined)
  const select = useCallback(
    (state: any) => {
      const next = userSelect(state)
      if (!sharing) return next
      const shared = replaceEqualDeep(sharedRef.current, next)
      sharedRef.current = shared
      return shared
    },
    [userSelect, sharing],
  )
  return useStore(router.stores.state, select) as UseRouterStateResult<TRouter, TSelected>
}

function identitySelect<T>(state: T) {
  return state
}
