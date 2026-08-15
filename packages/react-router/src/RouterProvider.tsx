import { hasKeys, type AnyRouter } from '@anonrig/router-core'
import { Matches } from './Matches'
import { routerContext } from './routerContext'

export function RouterContextProvider({
  router,
  children,
  ...rest
}: RouterProps & { children: any }) {
  if (hasKeys(rest as any)) {
    router.update({
      ...router.options,
      ...rest,
      context: {
        ...router.options.context,
        ...(rest as any).context,
      },
    })
  }

  const provider = (
    <routerContext.Provider value={router}>{children}</routerContext.Provider>
  )

  if (router.options.Wrap) {
    return <router.options.Wrap>{provider}</router.options.Wrap>
  }
  return provider
}

export function RouterProvider({ router, ...rest }: RouterProps) {
  return (
    <RouterContextProvider router={router} {...rest}>
      <Matches />
    </RouterContextProvider>
  )
}

export type RouterProps<TRouter extends AnyRouter = AnyRouter> = {
  router: TRouter
  context?: any
  [key: string]: any
}
