import { defineHandlerCallback } from '@anonrig/router-core/ssr/server'
import { RouterServer } from './router-server'
import { renderRouterToStream } from './render-router-to-stream'

export const defaultStreamHandler = defineHandlerCallback(({ request, router, responseHeaders }) =>
  renderRouterToStream({
    request,
    router,
    responseHeaders,
    children: <RouterServer router={router} />,
  }),
)
