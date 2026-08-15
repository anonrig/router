import { useMatch } from './useMatch'

export function useSearch<T = any>(opts?: {
  from?: string
  select?: (search: any) => T
  shouldThrow?: boolean
  structuralSharing?: boolean
  strict?: boolean
}): T {
  return useMatch({
    from: opts?.from,
    shouldThrow: opts?.shouldThrow,
    strict: opts?.strict,
    select: (match) => (opts?.select ? opts.select(match.search) : match.search),
  })
}

export type UseSearchRoute<TId = any> = (opts?: any) => any
