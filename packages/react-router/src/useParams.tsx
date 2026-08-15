import { useMatch } from './useMatch'

export function useParams<T = any>(opts?: {
  from?: string
  select?: (params: any) => T
  shouldThrow?: boolean
  structuralSharing?: boolean
  strict?: boolean
}): T {
  return useMatch({
    from: opts?.from,
    shouldThrow: opts?.shouldThrow,
    strict: opts?.strict,
    select: (match) => (opts?.select ? opts.select(match.params) : match.params),
  })
}

export type UseParamsRoute<TId = any> = (opts?: any) => any
