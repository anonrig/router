import { defineHandlerCallback } from 'speedy-router-core/ssr/server'
import { RouterServer } from './router-server'
import { renderRouterToStream } from './render-router-to-stream'
import { renderRouterToString } from './render-router-to-string'

export const defaultStreamHandler = defineHandlerCallback(({ request, router, responseHeaders }) =>
  renderRouterToStream({
    request,
    router,
    responseHeaders,
    children: <RouterServer router={router} />,
  }),
)

export const defaultRenderHandler = defineHandlerCallback(({ router, responseHeaders }) =>
  renderRouterToString({
    router,
    responseHeaders,
    children: <RouterServer router={router} />,
  }),
)
