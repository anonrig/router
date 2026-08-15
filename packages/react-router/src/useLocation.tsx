import { useRouterState } from './useRouterState'

export function useLocation<TSelected = any>(opts?: {
  select?: (location: any) => TSelected
  structuralSharing?: boolean
}): TSelected {
  return useRouterState({
    select: (s) => (opts?.select ? opts.select(s.location) : s.location),
  })
}
