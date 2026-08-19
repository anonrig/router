import {
  hasKeys,
  type AnyRouter,
  type RegisteredRouter,
  type RouterOptions,
} from 'speedy-router-core'
import { Matches } from './matches'
import { routerContext } from './router-context'

export function RouterContextProvider<
  TRouter extends AnyRouter = RegisteredRouter,
  TDehydrated extends Record<string, any> = Record<string, any>,
>({ router, children, ...rest }: RouterProps<TRouter, TDehydrated> & { children: any }) {
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

  const provider = <routerContext.Provider value={router}>{children}</routerContext.Provider>

  if (router.options.Wrap) {
    return <router.options.Wrap>{provider}</router.options.Wrap>
  }
  return provider
}

export function RouterProvider<
  TRouter extends AnyRouter = RegisteredRouter,
  TDehydrated extends Record<string, any> = Record<string, any>,
>({ router, ...rest }: RouterProps<TRouter, TDehydrated>) {
  return (
    <RouterContextProvider router={router} {...rest}>
      <Matches />
    </RouterContextProvider>
  )
}

export type RouterProps<
  TRouter extends AnyRouter = RegisteredRouter,
  TDehydrated extends Record<string, any> = Record<string, any>,
> = Omit<
  RouterOptions<
    TRouter['routeTree'],
    NonNullable<TRouter['options']['trailingSlash']>,
    NonNullable<TRouter['options']['defaultStructuralSharing']>,
    TRouter['history'],
    TDehydrated
  >,
  'context'
> & {
  router: TRouter
  context?: Partial<
    RouterOptions<
      TRouter['routeTree'],
      NonNullable<TRouter['options']['trailingSlash']>,
      NonNullable<TRouter['options']['defaultStructuralSharing']>,
      TRouter['history'],
      TDehydrated
    >['context']
  >
}
