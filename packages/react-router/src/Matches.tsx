import { useEffect } from 'react'
import { rootRouteId } from '@anonrig/router-core'
import { Match } from './Match'
import { useRouter } from './useRouter'
import { useRouterState } from './useRouterState'
import { useMatch } from './useMatch'
import { deepEqual } from '@anonrig/router-core'

export function Matches() {
  const router = useRouter()

  useEffect(() => {
    void router.load()
  }, [router])

  const ready = useRouterState({
    select: (s) => s.matches.length > 0 || !!s.pendingMatches?.length,
  })

  if (!ready) {
    const Pending = router.options.defaultPendingComponent
    return Pending ? <Pending /> : null
  }

  const inner = <Match routeId={rootRouteId} />
  return router.options.InnerWrap ? (
    <router.options.InnerWrap>{inner}</router.options.InnerWrap>
  ) : (
    inner
  )
}

export function useMatches<T = any>(opts?: { select?: (matches: any[]) => T }) {
  return useRouterState({
    select: (s) => (opts?.select ? opts.select(s.matches) : (s.matches as T)),
  })
}

export function useParentMatches<T = any>(opts?: { select?: (matches: any[]) => T }) {
  const routeId = useMatch({ select: (m) => m?.routeId })
  return useRouterState({
    select: (s) => {
      const index = s.matches.findIndex((m) => m.routeId === routeId)
      const parents = s.matches.slice(0, Math.max(index, 0))
      return opts?.select ? opts.select(parents) : (parents as T)
    },
  })
}

export function useChildMatches<T = any>(opts?: { select?: (matches: any[]) => T }) {
  const routeId = useMatch({ select: (m) => m?.routeId })
  return useRouterState({
    select: (s) => {
      const index = s.matches.findIndex((m) => m.routeId === routeId)
      const children = s.matches.slice(index + 1)
      return opts?.select ? opts.select(children) : (children as T)
    },
  })
}

export function useMatchRoute() {
  const router = useRouter()
  return (opts: any = {}) => router.matchRoute(opts)
}

export function MatchRoute({
  children,
  ...opts
}: any) {
  const matchRoute = useMatchRoute()
  const match = matchRoute(opts)
  if (typeof children === 'function') return children(match)
  return match ? children : null
}

export type UseMatchRouteOptions = any
export type MakeMatchRouteOptions = any

void deepEqual
