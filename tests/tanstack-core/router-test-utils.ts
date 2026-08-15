import { RouterCore } from '@tanstack/router-core'
import { createRequestHandler } from '@tanstack/router-core/ssr/createRequestHandler'
import type { RouterHistory } from '@tanstack/history'
import type {
  AnyRoute,
  AnyRouter,
  RouterConstructorOptions,
  TrailingSlashOption,
} from '@tanstack/router-core'

export function createTestRouter<
  TRouteTree extends AnyRoute,
  TTrailingSlashOption extends TrailingSlashOption = 'never',
  TDefaultStructuralSharingOption extends boolean = false,
  TRouterHistory extends RouterHistory = RouterHistory,
  TDehydrated extends Record<string, any> = Record<string, any>,
>(
  options: RouterConstructorOptions<
    TRouteTree,
    TTrailingSlashOption,
    TDefaultStructuralSharingOption,
    TRouterHistory,
    TDehydrated
  >,
) {
  return new RouterCore(options)
}

/** Materialize the request-local server result as the HTTP response users see. */
export function loadServerResponse(router: AnyRouter, path: string, signal?: AbortSignal) {
  return createRequestHandler({
    createRouter: () => router,
    request: new Request(`http://localhost${path}`, { signal }),
  })(({ router: loadedRouter, responseHeaders }) => {
    const result = (loadedRouter as AnyRouter & { _serverResult?: any })._serverResult
    return new Response(null, {
      status: result?.type === 'redirect' ? result.redirect.status : (result?.status ?? 500),
      headers: responseHeaders,
    })
  })
}
