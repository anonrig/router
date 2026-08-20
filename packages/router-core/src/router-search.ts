import { SearchParamError } from './misc'
import { functionalUpdate } from './utils'
import type { AnyRoute, SearchMiddlewareContext } from './route'
import type { AnyValidator } from './validators'

export function validateSearch(validator: AnyValidator, input: unknown): unknown {
  if (validator == null) return {}
  if (typeof validator === 'function') return validator(input)
  if (typeof validator !== 'object') return {}

  if ('~standard' in validator) {
    const result = validator['~standard'].validate(input)
    if (result instanceof Promise) throw new SearchParamError('Async validation not supported')
    if (result.issues) {
      throw new SearchParamError(JSON.stringify(result.issues, undefined, 2), { cause: result })
    }
    return result.value
  }

  if (typeof validator.parse === 'function') {
    return validator.parse(input)
  }

  const candidate = validator as AnyValidator & {
    safeParse?: (input: unknown) => { success: boolean; data?: unknown; error?: unknown }
  }
  if (typeof candidate.safeParse === 'function') {
    const result = candidate.safeParse(input)
    if (result.success) return result.data
    throw result.error
  }

  return {}
}

export function applySearchMiddleware(
  search: any,
  dest: { search?: any; to?: unknown },
  destRoutes: ReadonlyArray<AnyRoute>,
  includeValidateSearch: boolean | undefined,
) {
  const middlewares: Array<any> = []

  for (const route of destRoutes) {
    const routeOptions = route.options ?? {}
    if (routeOptions.search?.middlewares) {
      middlewares.push(...routeOptions.search.middlewares)
    } else if (routeOptions.preSearchFilters || routeOptions.postSearchFilters) {
      middlewares.push(({ search: current, next }: SearchMiddlewareContext<any>) => {
        const nextSearch = routeOptions.preSearchFilters
          ? routeOptions.preSearchFilters.reduce((prev, fn) => fn(prev), current)
          : current
        const result = next(nextSearch)
        return routeOptions.postSearchFilters
          ? routeOptions.postSearchFilters.reduce((prev, fn) => fn(prev), result)
          : result
      })
    }

    const routeValidateSearch = routeOptions.validateSearch
    if (routeValidateSearch) {
      middlewares.push(({ search: current, next, meta }: SearchMiddlewareContext<any>) => {
        const result = next(current)
        if (includeValidateSearch) {
          try {
            const validated = validateSearch(routeValidateSearch, result) as any
            if (meta && validated) {
              for (const key in validated) {
                if (!(key in result)) {
                  ;(meta.defaulted ||= new Map()).set(key, validated[key])
                }
              }
            }
            return { ...result, ...validated }
          } catch {
            // matchRoutes reports the error
          }
        }
        return result
      })
    }
  }

  const applyNext = (index: number, currentSearch: any, meta?: any): any => {
    if (index >= middlewares.length) {
      if (!dest.search) return dest.to ? {} : currentSearch
      if (dest.search === true) return currentSearch
      const result = functionalUpdate(dest.search, currentSearch)
      if (meta) meta.explicit = result
      return result
    }
    const next = (newSearch: any, collectMeta?: true): any => {
      if (collectMeta) {
        const nextMeta = meta || {}
        return { search: applyNext(index + 1, newSearch, nextMeta), meta: nextMeta }
      }
      return applyNext(index + 1, newSearch, meta)
    }
    return middlewares[index]!({ search: currentSearch, next, meta })
  }

  return applyNext(0, search)
}

export function extractStrictParams(route: AnyRoute, accumulatedParams: Record<string, unknown>) {
  const parseParams = route.options?.params?.parse ?? route.options?.parseParams
  if (parseParams) {
    Object.assign(accumulatedParams, parseParams(accumulatedParams as Record<string, string>))
  }
}

export function routeNeedsLoad(route: AnyRoute): unknown {
  return (
    route.options?.loader ||
    route.options?.beforeLoad ||
    route.lazyFn ||
    (route.options?.component as any)?.preload ||
    (route.options?.pendingComponent as any)?.preload
  )
}

export function findGlobalNotFoundRouteId(
  notFoundMode: 'root' | 'fuzzy' | undefined,
  routes: ReadonlyArray<AnyRoute>,
  rootId: string,
) {
  if (notFoundMode !== 'root') {
    let fallback
    for (let i = routes.length - 1; i >= 0; i--) {
      const route = routes[i]!
      if (route.options?.notFoundComponent) return route.id
      fallback ||= route.children && route.id
    }
    if (fallback) return fallback
  }
  return rootId
}
