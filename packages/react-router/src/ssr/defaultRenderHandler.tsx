import { defineHandlerCallback } from '@anonrig/router-core/ssr/server'
import { renderRouterToString } from './renderRouterToString'
import { RouterServer } from './RouterServer'

export const defaultRenderHandler = defineHandlerCallback(
  ({ router, responseHeaders }) =>
    renderRouterToString({
      router,
      responseHeaders,
      children: <RouterServer router={router} />,
    }),
)
