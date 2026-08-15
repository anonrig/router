// @ts-nocheck
import { memo, Suspense, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { isNotFound, rootRouteId } from '@anonrig/router-core'
import { CatchBoundary, ErrorComponent } from './catch-boundary'
import { matchContext } from './match-context'
import { CatchNotFound, DefaultGlobalNotFound } from './not-found'
import { useRouter } from './use-router'
import { useRouterState } from './use-router-state'

export function Outlet() {
  const _router = useRouter()
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

function usePendingPresentation(match: any, route: any, router: ReturnType<typeof useRouter>) {
  const pendingMs = match._forcePending
    ? 0
    : (route?.options.pendingMs ?? router.options.defaultPendingMs ?? 0)
  const pendingMinMs = route?.options.pendingMinMs ?? router.options.defaultPendingMinMs ?? 0
  const [visible, setVisible] = useState(!!match._forcePending || pendingMs === 0)
  const shownAt = useRef<number | null>(null)
  const pending = match.status === 'pending' || match._forcePending

  useEffect(() => {
    if (pending) {
      if (pendingMs === 0) {
        shownAt.current = Date.now()
        return
      }
      const timer = setTimeout(() => {
        shownAt.current = Date.now()
        setVisible(true)
      }, pendingMs)
      return () => clearTimeout(timer)
    }

    if (visible && shownAt.current && pendingMinMs > 0) {
      const remaining = pendingMinMs - (Date.now() - shownAt.current)
      if (remaining > 0) {
        const timer = setTimeout(() => {
          shownAt.current = null
          setVisible(false)
        }, remaining)
        return () => clearTimeout(timer)
      }
    }
    shownAt.current = null
    if (visible) {
      const timer = setTimeout(() => setVisible(false), 0)
      return () => clearTimeout(timer)
    }
  }, [pending, match.id, pendingMs, pendingMinMs, visible])

  return pending ? visible : visible && pendingMinMs > 0
}

export const Match = memo(function Match({ routeId }: { routeId: string }) {
  const router = useRouter()
  const match = useRouterState({
    select: (s) =>
      (s.matches.find((m) => m.routeId === routeId) ??
        s.pendingMatches?.find((m) => m.routeId === routeId))!,
  })
  const route = router.routesById[routeId]
  const showPending = usePendingPresentation(match, route, router)

  if (!match || !route) return null

  if (showPending) {
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
  const remountDeps = route.options.remountDeps?.({
    params: match.params,
    search: match.search,
    context: match.context,
    routeId,
  })
  const resetKey =
    remountDeps !== undefined
      ? JSON.stringify(remountDeps)
      : `${match.id}:${match.status}:${match.updatedAt}`

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
void isNotFound
