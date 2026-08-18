import { defineHandlerCallback } from 'speedy-router-core/ssr/server'
import { renderRouterToString } from './render-router-to-string'
import { RouterServer } from './router-server'

export const defaultRenderHandler = defineHandlerCallback(({ router, responseHeaders }) =>
  renderRouterToString({
    router,
    responseHeaders,
    children: <RouterServer router={router} />,
  }),
)
