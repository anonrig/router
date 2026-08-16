import { RouterCore, type CreateRouterFn } from '@anonrig/router-core'
import type { RouterHistory } from '@anonrig/history'
import type { AnyRoute, TrailingSlashOption } from '@anonrig/router-core'
import type { ErrorRouteComponent, NotFoundRouteComponent, RouteComponent } from './route'

declare module '@anonrig/router-core' {
  export interface RouterOptionsExtensions {
    defaultComponent?: RouteComponent
    defaultErrorComponent?: ErrorRouteComponent
    defaultPendingComponent?: RouteComponent
    defaultNotFoundComponent?: NotFoundRouteComponent
    Wrap?: (props: { children: any }) => React.JSX.Element
    InnerWrap?: (props: { children: any }) => React.JSX.Element
    defaultOnCatch?: (error: Error, errorInfo: React.ErrorInfo) => void
  }
}

export const createRouter: CreateRouterFn = /*#__PURE__*/ (options) => {
  return new Router(options)
}

export class Router<
  in out TRouteTree extends AnyRoute,
  in out TTrailingSlashOption extends TrailingSlashOption = 'never',
  in out TDefaultStructuralSharingOption extends boolean = false,
  in out TRouterHistory extends RouterHistory = RouterHistory,
  in out TDehydrated extends Record<string, any> = Record<string, any>,
> extends RouterCore<
  TRouteTree,
  TTrailingSlashOption,
  TDefaultStructuralSharingOption,
  TRouterHistory,
  TDehydrated
> {}
