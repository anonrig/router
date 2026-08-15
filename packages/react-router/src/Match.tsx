// @ts-nocheck
import { memo, Suspense, useContext, type ReactNode } from 'react'
import { isNotFound, rootRouteId } from '@anonrig/router-core'
import { CatchBoundary, ErrorComponent } from './CatchBoundary'
import { matchContext } from './matchContext'
import { CatchNotFound, DefaultGlobalNotFound } from './not-found'
import { useRouter } from './useRouter'
import { useRouterState } from './useRouterState'

export function Outlet() {
  const router = useRouter()
  const routeId = useContext(matchContext)
  const matches = useRouterState({ select: (s) => s.matches })
  const index = matches.findIndex((m) => m.routeId === routeId)
  const next = matches[index + 1]
  if (!next) return null
  return <Match routeId={next.routeId} />
}

function renderPending(router: ReturnType<typeof useRouter>, route: any) {
  const Pending = route?.options.pendingComponent ?? router.options.defaultPendingComponent
  return Pending ? <Pending /> : null
}

export const Match = memo(function Match({ routeId }: { routeId: string }) {
  const router = useRouter()
  const match = useRouterState({
    select: (s) =>
      (s.matches.find((m) => m.routeId === routeId) ??
        s.pendingMatches?.find((m) => m.routeId === routeId))!,
  })
  const route = router.routesById[routeId]

  if (!match || !route) return null

  if (match.status === 'pending') {
    const pending = renderPending(router, route)
    if (pending) return pending
  }

  if (match.status === 'error') {
    const Err =
      route.options.errorComponent ?? router.options.defaultErrorComponent ?? ErrorComponent
    return (
      <Err
        error={match.error}
        reset={() => {
          void router.invalidate()
        }}
      />
    )
  }

  if (match.status === 'notFound' || match.globalNotFound) {
    const NotFound =
      route.options.notFoundComponent ??
      router.options.defaultNotFoundComponent ??
      DefaultGlobalNotFound
    return <NotFound data={match.notFoundError?.data} />
  }

  const Comp = route.options.component ?? router.options.defaultComponent ?? Outlet
  const resetKey = `${match.id}:${match.status}:${match.updatedAt}`

  let inner: ReactNode = (
    <matchContext.Provider value={routeId}>
      <Comp />
    </matchContext.Provider>
  )

  if (route.options.wrapInSuspense || route.options.pendingComponent) {
    inner = <SuspenseBoundary fallback={renderPending(router, route)}>{inner}</SuspenseBoundary>
  }

  return (
    <CatchNotFound
      fallback={(err) => {
        const NotFound =
          route.options.notFoundComponent ??
          router.options.defaultNotFoundComponent ??
          DefaultGlobalNotFound
        return <NotFound data={err?.data} />
      }}
    >
      <CatchBoundary
        getResetKey={() => resetKey}
        errorComponent={
          route.options.errorComponent ?? router.options.defaultErrorComponent ?? ErrorComponent
        }
        onCatch={route.options.onCatch ?? router.options.defaultOnCatch}
      >
        {inner}
      </CatchBoundary>
    </CatchNotFound>
  )
})

function SuspenseBoundary({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  return <Suspense fallback={fallback}>{children}</Suspense>
}

export { rootRouteId }
