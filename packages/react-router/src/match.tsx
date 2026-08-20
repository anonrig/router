import { memo, Suspense, useContext, useMemo, type ReactNode } from 'react'
import {
  isNotFound,
  rootRouteId,
  type AnyRoute,
  type AnyRouteMatch,
  type RootRouteOptions,
} from 'speedy-router-core'
import { isServer } from 'speedy-router-core/is-server'
import { CatchBoundary, ErrorComponent } from './catch-boundary'
import { ClientOnly } from './client-only'
import { errorResetContext, matchContext } from './match-context'
import {
  nonRouteComponentContext,
  wrapInNonRouteComponentContext,
} from './non-route-component-context'
import { CatchNotFound } from './not-found'
import { renderRouteNotFound } from './render-route-not-found'
import { SafeFragment } from './safe-fragment'
import { useRouter } from './use-router'
import { useRouterState } from './use-router-state'

export function renderPending(router: ReturnType<typeof useRouter>, route?: AnyRoute) {
  const PendingComponent = route?.options.pendingComponent ?? router.options.defaultPendingComponent
  if (!PendingComponent) return null
  return wrapInNonRouteComponentContext(<PendingComponent />, 'pendingComponent')
}

const canWrapInSuspense = (
  router: ReturnType<typeof useRouter>,
  route: AnyRoute,
  ssr: AnyRouteMatch['ssr'],
) =>
  !route.isRoot ||
  (route.options as RootRouteOptions).shellComponent ||
  route.options.wrapInSuspense ||
  ssr === false ||
  ssr === 'data-only' ||
  !((isServer ?? router.isServer) || router.ssr)

export const Match = memo(function MatchImpl({ routeId }: { routeId: string }) {
  const router = useRouter()

  if (isServer ?? router.isServer) {
    const match =
      router.stores.byRoute[routeId]?.get() ??
      router.stores.matches.get().find((item: AnyRouteMatch) => item.routeId === routeId)
    return match ? <MatchView router={router} match={match} /> : null
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const match = useRouterState({
    select: (state) => state.matches.find((item: AnyRouteMatch) => item.routeId === routeId),
  })
  return match ? <MatchView router={router} match={match} /> : null
})

function MatchView({
  router,
  match,
}: {
  router: ReturnType<typeof useRouter>
  match: AnyRouteMatch
}) {
  const route: AnyRoute = router.routesById[match.routeId]!
  const errorReset = useContext(errorResetContext)
  const pendingElement = renderPending(router, route)
  const routeErrorComponent = route.options.errorComponent ?? router.options.defaultErrorComponent
  const routeOnCatch = route.options.onCatch ?? router.options.defaultOnCatch
  const routeNotFoundComponent = route.isRoot
    ? (route.options.notFoundComponent ?? router.options.notFoundRoute?.options.component)
    : route.options.notFoundComponent

  const resolvedNoSsr = match.ssr === false || match.ssr === 'data-only'
  const ResolvedSuspenseBoundary =
    canWrapInSuspense(router, route, match.ssr) &&
    (route.options.wrapInSuspense ??
      pendingElement ??
      ((route.options.errorComponent as any)?.preload || resolvedNoSsr))
      ? Suspense
      : SafeFragment

  const ResolvedCatchBoundary = routeErrorComponent ? CatchBoundary : SafeFragment
  const ResolvedNotFoundBoundary = routeNotFoundComponent ? CatchNotFound : SafeFragment
  const ShellComponent = route.isRoot
    ? ((route.options as RootRouteOptions).shellComponent ?? SafeFragment)
    : SafeFragment

  return (
    <ShellComponent>
      <matchContext.Provider value={match.routeId}>
        <ResolvedSuspenseBoundary fallback={pendingElement}>
          <ResolvedCatchBoundary
            getResetKey={() => `${errorReset}:${match.id}:${match.status}`}
            errorComponent={routeErrorComponent as any}
            onCatch={(error, errorInfo) => {
              if (isNotFound(error)) {
                ;(error as { routeId?: string }).routeId ??= match.routeId
                throw error
              }
              if (process.env.NODE_ENV !== 'production') {
                console.warn(`Warning: Error in route match: ${match.id}`)
              }
              routeOnCatch?.(error, errorInfo)
            }}
          >
            <ResolvedNotFoundBoundary
              fallback={(error) => {
                error.routeId ??= match.routeId
                if (error.routeId !== match.routeId) throw error
                const NotFound = routeNotFoundComponent
                return wrapInNonRouteComponentContext(
                  <NotFound {...(error as any)} />,
                  'notFoundComponent',
                )
              }}
            >
              {resolvedNoSsr ? (
                <ClientOnly fallback={pendingElement}>
                  <MatchInner match={match} />
                </ClientOnly>
              ) : (
                <MatchInner match={match} />
              )}
            </ResolvedNotFoundBoundary>
          </ResolvedCatchBoundary>
        </ResolvedSuspenseBoundary>
      </matchContext.Provider>
    </ShellComponent>
  )
}

export const MatchInner = memo(function MatchInnerImpl({ match }: { match: AnyRouteMatch }): any {
  const router = useRouter()
  const routeId = match.routeId
  const route = router.routesById[routeId] as AnyRoute
  const key = useMemo(() => {
    const remountFn = route.options.remountDeps ?? router.options.defaultRemountDeps
    const remountDeps = remountFn?.({
      routeId,
      loaderDeps: match.loaderDeps,
      params: match._strictParams,
      search: match._strictSearch,
    })
    return remountDeps ? JSON.stringify(remountDeps) : undefined
  }, [
    routeId,
    match.loaderDeps,
    match._strictParams,
    match._strictSearch,
    route.options.remountDeps,
    router.options.defaultRemountDeps,
  ])
  const out = useMemo(() => {
    const Comp = route.options.component ?? router.options.defaultComponent
    return Comp ? <Comp key={key} /> : <Outlet />
  }, [key, route.options.component, router.options.defaultComponent])

  if (match.status === 'pending') {
    if (router.ssr && !canWrapInSuspense(router, route, match.ssr)) {
      return out
    }
    if (router._tx) {
      throw router._tx[5]
    }
    return renderPending(router, route)
  }

  if (match.status === 'notFound') {
    return renderRouteNotFound(router, route, match.error)
  }

  if (match.status === 'error') {
    if (isServer ?? router.isServer) {
      const RouteErrorComponent =
        (route.options.errorComponent ?? router.options.defaultErrorComponent) || ErrorComponent
      return wrapInNonRouteComponentContext(
        <RouteErrorComponent
          error={match.error as any}
          reset={undefined as any}
          info={{ componentStack: '' }}
        />,
        'errorComponent',
      )
    }
    throw match.error
  }

  return out
})

let outletSlot:
  | ((
      matches: AnyRouteMatch[],
      parentIndex: number,
      routeId: string,
      props?: { slot?: string; fallback?: ReactNode },
    ) => { id?: string; e?: ReactNode })
  | undefined

export function setOutletSlot(fn: NonNullable<typeof outletSlot>) {
  outletSlot ??= fn
}

export const Outlet = memo(function OutletImpl(props?: { slot?: string; fallback?: ReactNode }) {
  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const nonRouteComponent = useContext(nonRouteComponentContext!)
    if (nonRouteComponent) {
      console.warn(
        `Warning: An <Outlet /> was rendered inside a ${nonRouteComponent}. <Outlet /> should only be rendered inside a route component.`,
      )
    }
  }

  const router = useRouter()
  const routeId = useContext(matchContext)!

  const matches =
    (isServer ?? router.isServer)
      ? router.stores.matches.get()
      : // eslint-disable-next-line react-hooks/rules-of-hooks
        useRouterState({ select: (state) => state.matches })
  const parentIndex = matches.findIndex((item: AnyRouteMatch) => item.routeId === routeId)
  const parentMatch = matches[parentIndex]
  const parentGlobalNotFound = !!parentMatch?._notFound
  const parentNotFoundError = parentMatch?.error
  const slotted = outletSlot?.(matches, parentIndex, routeId, props)
  const childRouteId = slotted ? slotted.id : matches[parentIndex + 1]?.routeId

  if (parentGlobalNotFound) {
    return renderRouteNotFound(router, router.routesById[routeId]!, parentNotFoundError)
  }

  if (!childRouteId) return slotted?.e ?? null

  const nextMatch = <Match routeId={childRouteId} />
  if (routeId === rootRouteId) {
    return <Suspense fallback={renderPending(router)}>{nextMatch}</Suspense>
  }
  return nextMatch
})

export { rootRouteId }
