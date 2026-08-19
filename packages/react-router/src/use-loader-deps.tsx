import { useMatch } from './use-match'
import { useRouter } from './use-router'
import type { StructuralSharingOption, ValidateSelected } from './structural-sharing'
import type {
  AnyRouter,
  ResolveUseLoaderDeps,
  StrictOrFrom,
  UseLoaderDepsResult,
  RegisteredRouter,
} from 'speedy-router-core'

export interface UseLoaderDepsBaseOptions<
  TRouter extends AnyRouter,
  TFrom,
  TSelected,
  TStructuralSharing,
> {
  select?: (
    deps: ResolveUseLoaderDeps<TRouter, TFrom>,
  ) => ValidateSelected<TRouter, TSelected, TStructuralSharing>
}

export type UseLoaderDepsOptions<
  TRouter extends AnyRouter,
  TFrom extends string | undefined,
  TSelected,
  TStructuralSharing,
> = StrictOrFrom<TRouter, TFrom> &
  UseLoaderDepsBaseOptions<TRouter, TFrom, TSelected, TStructuralSharing> &
  StructuralSharingOption<TRouter, TSelected, TStructuralSharing>

export type UseLoaderDepsRoute<out TId> = <
  TRouter extends AnyRouter = RegisteredRouter,
  TSelected = unknown,
  TStructuralSharing extends boolean = boolean,
>(
  opts?: UseLoaderDepsBaseOptions<TRouter, TId, TSelected, TStructuralSharing> &
    StructuralSharingOption<TRouter, TSelected, TStructuralSharing>,
) => UseLoaderDepsResult<TRouter, TId, TSelected>

export function useLoaderDeps<
  TRouter extends AnyRouter = RegisteredRouter,
  const TFrom extends string | undefined = undefined,
  TSelected = unknown,
  TStructuralSharing extends boolean = boolean,
>(
  opts?: UseLoaderDepsOptions<TRouter, TFrom, TSelected, TStructuralSharing>,
): UseLoaderDepsResult<TRouter, TFrom, TSelected> {
  const router = useRouter()
  return useMatch({
    from: opts?.from as any,
    strict: (opts as any)?.strict,
    select: (match: any) => {
      const route = router.routesById[match.routeId]
      const deps =
        match.loaderDeps ??
        route?.options.loaderDeps?.({
          search: match.search,
          params: match.params,
        } as any) ??
        {}
      return opts?.select ? opts.select(deps) : deps
    },
  }) as UseLoaderDepsResult<TRouter, TFrom, TSelected>
}
