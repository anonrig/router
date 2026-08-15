import { useMatch } from './useMatch'

export function useRouteContext<T = any>(opts?: {
  from?: string
  select?: (context: any) => T
  shouldThrow?: boolean
  strict?: boolean
}): T {
  return useMatch({
    from: opts?.from,
    shouldThrow: opts?.shouldThrow,
    strict: opts?.strict,
    select: (match) =>
      opts?.select ? opts.select(match.context) : match.context,
  })
}

export type UseRouteContextRoute<TId = any> = (opts?: any) => any
