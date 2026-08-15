import { useContext } from 'react'
import { matchContext } from './matchContext'
import { useRouter } from './useRouter'
import { useRouterState } from './useRouterState'

export function useMatch<T = any>(opts?: {
  from?: string
  select?: (match: any) => T
  shouldThrow?: boolean
  structuralSharing?: boolean
  strict?: boolean
}): T {
  const router = useRouter()
  const nearest = useContext(matchContext)
  const from = opts?.from ?? nearest

  return useRouterState({
    select: (state) => {
      const matches = state.matches
      const match = from
        ? matches.find((m) => m.routeId === from || m.id === from)
        : matches[matches.length - 1]
      if (!match) {
        if (opts?.shouldThrow === false || opts?.strict === false) return undefined as T
        return undefined as T
      }
      return opts?.select ? opts.select(match) : (match as T)
    },
  })
}

export type UseMatchRoute<TId = any> = (opts?: any) => any
