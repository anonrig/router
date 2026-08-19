/* eslint-disable react-hooks/rules-of-hooks -- RouteApi hook methods run inside function components. */
import { BaseRouteApi, notFound } from 'speedy-router-core'
import React from 'react'
import { Link } from './link'
import {
  useBoundLoaderData,
  useBoundLoaderDeps,
  useBoundMatch,
  useBoundNavigateFromId,
  useBoundParams,
  useBoundRouteContext,
  useBoundSearch,
} from './route-hooks'
import type { LinkComponentRoute } from './link'
import type { UseLoaderDataRoute } from './use-loader-data'
import type { UseLoaderDepsRoute } from './use-loader-deps'
import type { UseMatchRoute } from './use-match'
import type { UseParamsRoute } from './use-params'
import type { UseRouteContextRoute } from './use-route-context'
import type { UseSearchRoute } from './use-search'
import type {
  AnyRouter,
  ConstrainLiteral,
  NotFoundOptions,
  RegisteredRouter,
  RouteIds,
  RouteTypesById,
  UseNavigateResult,
} from 'speedy-router-core'

/**
 * Returns a route-specific API that exposes type-safe hooks pre-bound
 * to a single route ID. Useful for consuming a route's APIs from files
 * where the route object isn't directly imported (e.g. code-split files).
 *
 * @param id Route ID string literal for the target route.
 * @returns A `RouteApi` instance bound to the given route ID.
 * @link https://tanstack.com/router/latest/docs/framework/react/api/router/getRouteApiFunction
 */
export function getRouteApi<const TId, TRouter extends AnyRouter = RegisteredRouter>(
  id: ConstrainLiteral<TId, RouteIds<TRouter['routeTree']>>,
) {
  return new RouteApi<TId, TRouter>({ id })
}

export class RouteApi<TId, TRouter extends AnyRouter = RegisteredRouter> extends BaseRouteApi<
  TId,
  TRouter
> {
  /**
   * @deprecated Use the `getRouteApi` function instead.
   */
  constructor({ id }: { id: TId }) {
    super({ id })
  }

  useMatch: UseMatchRoute<TId> = (opts) => useBoundMatch(this.id as string, opts) as any

  useRouteContext: UseRouteContextRoute<TId> = (opts) =>
    useBoundRouteContext(this.id as string, opts) as any

  useSearch: UseSearchRoute<TId> = (opts) => useBoundSearch(this.id as string, opts) as any

  useParams: UseParamsRoute<TId> = (opts) => useBoundParams(this.id as string, opts) as any

  useLoaderDeps: UseLoaderDepsRoute<TId> = (opts) =>
    useBoundLoaderDeps(this.id as string, { ...opts, strict: false }) as any

  useLoaderData: UseLoaderDataRoute<TId> = (opts) =>
    useBoundLoaderData(this.id as string, { ...opts, strict: false }) as any

  useNavigate = (): UseNavigateResult<RouteTypesById<TRouter, TId>['fullPath']> =>
    useBoundNavigateFromId(this.id as string) as any

  notFound = (opts?: NotFoundOptions) => {
    return notFound({ routeId: this.id as string, ...opts })
  }

  Link: LinkComponentRoute<RouteTypesById<TRouter, TId>['fullPath']> = React.forwardRef(
    (props, ref: React.ForwardedRef<HTMLAnchorElement>) => {
      const router = useRouter()
      const fullPath = router.routesById[this.id as string]?.fullPath
      return <Link ref={ref} from={fullPath as never} {...props} />
    },
  ) as unknown as LinkComponentRoute<RouteTypesById<TRouter, TId>['fullPath']>
}
