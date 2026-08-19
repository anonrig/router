import { hydrate } from 'speedy-router-core/ssr/client'
import { Await } from '../awaited'
import { RouterProvider } from '../router-provider'
import type { AnyRouter } from 'speedy-router-core'

const hydrationPromises = new WeakMap<AnyRouter, Promise<void>>()

export function RouterClient(props: { router: AnyRouter }) {
  let hydrationPromise = hydrationPromises.get(props.router)
  if (!hydrationPromise) {
    hydrationPromise = hydrate(props.router).finally(() => window.$_TSR!.h())
    hydrationPromises.set(props.router, hydrationPromise)
  }

  return (
    <Await promise={hydrationPromise} children={() => <RouterProvider router={props.router} />} />
  )
}
