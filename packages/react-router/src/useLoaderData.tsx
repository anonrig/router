import { useMatch } from './useMatch'

export function useLoaderData<T = any>(opts?: {
  from?: string
  select?: (data: any) => T
  shouldThrow?: boolean
  structuralSharing?: boolean
  strict?: boolean
}): T {
  return useMatch({
    from: opts?.from,
    shouldThrow: opts?.shouldThrow,
    strict: opts?.strict,
    select: (match) =>
      opts?.select ? opts.select(match.loaderData) : match.loaderData,
  })
}

export type UseLoaderDataRoute<TId = any> = (opts?: any) => any
