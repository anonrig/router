import * as React from 'react'
import { RouterProvider } from '../router-provider'
import type { AnyRouter } from 'fast-router-core'

export function RouterServer<TRouter extends AnyRouter>(props: { router: TRouter }) {
  return <RouterProvider router={props.router} />
}
