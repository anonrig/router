import { useMatch } from './useMatch'
import { useRouter } from './useRouter'

export function useLoaderDeps<T = any>(opts?: {
  from?: string
  select?: (deps: any) => T
  strict?: boolean
}): T {
  const router = useRouter()
  return useMatch({
    from: opts?.from,
    strict: opts?.strict,
    select: (match) => {
      const route = router.routesById[match.routeId]
      const deps = route?.options.loaderDeps?.({
        search: match.search,
        params: match.params,
      }) ?? {}
      return opts?.select ? opts.select(deps) : deps
    },
  })
}

export type UseLoaderDepsRoute<TId = any> = (opts?: any) => any
