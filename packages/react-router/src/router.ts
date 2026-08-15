import { RouterCore, type CreateRouterFn } from '@anonrig/router-core'
import type { RouterHistory } from '@anonrig/history'

export const createRouter: CreateRouterFn = (options) => new Router(options)

export class Router<
  TRouteTree = any,
  TTrailingSlashOption extends string = 'never',
  TDefaultStructuralSharingOption extends boolean = false,
  TRouterHistory extends RouterHistory = RouterHistory,
  TDehydrated extends Record<string, any> = Record<string, any>,
> extends RouterCore<
  TRouteTree extends import('@anonrig/router-core').AnyRoute ? TRouteTree : any,
  any,
  TDefaultStructuralSharingOption,
  TRouterHistory,
  TDehydrated
> {}
