import { useCallback } from 'react'
import { useMatch } from './use-match'
import { useRouter } from './use-router'

export function useBoundMatch(id: string, opts: any) {
  return useMatch({
    select: opts?.select,
    from: id,
    structuralSharing: opts?.structuralSharing,
  } as any)
}

export function useBoundRouteContext(id: string, opts: any) {
  return useMatch({
    ...(opts as any),
    from: id,
    select: (match: any) => (opts?.select ? opts.select(match.context) : match.context),
  })
}

export function useBoundSearch(id: string, opts: any) {
  return useMatch({
    from: id as any,
    strict: opts?.strict,
    shouldThrow: opts?.shouldThrow,
    structuralSharing: opts?.structuralSharing,
    select: (match: any) => (opts?.select ? opts.select(match.search) : match.search),
  } as any)
}

export function useBoundParams(id: string, opts: any) {
  return useMatch({
    from: id as any,
    shouldThrow: opts?.shouldThrow,
    structuralSharing: opts?.structuralSharing,
    strict: opts?.strict,
    select: (match: any) => {
      const params = opts?.strict === false ? match.params : (match._strictParams ?? match.params)
      return opts?.select ? opts.select(params) : params
    },
  } as any)
}

export function useBoundLoaderData(id: string, opts: any) {
  return useMatch({
    from: id as any,
    strict: opts?.strict,
    structuralSharing: opts?.structuralSharing,
    select: (match: any) => (opts?.select ? opts.select(match.loaderData) : match.loaderData),
  } as any)
}

export function useBoundLoaderDeps(id: string, opts: any) {
  const router = useRouter()
  return useMatch({
    from: id as any,
    strict: (opts as any)?.strict,
    select: (match: any) => {
      const route = router.routesById[match.routeId]
      const deps =
        match.loaderDeps ??
        route?.options.loaderDeps?.({
          search: match.search,
          params: match.params,
        } as any) ??
        {}
      return opts?.select ? opts.select(deps) : deps
    },
  } as any)
}

export function useBoundNavigate(from: string | undefined) {
  const router = useRouter()
  return useCallback(
    (options: any) =>
      router.navigate({
        ...options,
        from: options.from ?? from,
      }),
    [from, router],
  )
}

export function useBoundNavigateFromId(id: string) {
  const router = useRouter()
  return useBoundNavigate(router.routesById[id]?.fullPath)
}
