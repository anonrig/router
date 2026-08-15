export function retainSearchParams(keys: string[] | true) {
  return ({ search, next }: { search: Record<string, any>; next: Record<string, any> }) => {
    if (keys === true) return { ...search, ...next }
    const kept: Record<string, any> = { ...next }
    for (const key of keys) {
      if (next[key] === undefined && search[key] !== undefined) kept[key] = search[key]
    }
    return kept
  }
}

export function stripSearchParams(keys: string[] | true | Record<string, any>) {
  return ({ next }: { next: Record<string, any> }) => {
    if (keys === true) return {}
    const copy = { ...next }
    if (Array.isArray(keys)) {
      for (const key of keys) delete copy[key]
    } else {
      for (const key in keys) {
        if (copy[key] === keys[key]) delete copy[key]
      }
    }
    return copy
  }
}

export function createRouterConfig(opts: any = {}) {
  return opts
}

export function lazyFn<T extends (...args: any[]) => any>(fn: T): T {
  return fn
}

export class SearchParamError extends Error {
  constructor(message?: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'SearchParamError'
  }
}

export class PathParamError extends Error {
  constructor(message?: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'PathParamError'
  }
}

export function composeRewrites(rewrites: any[]) {
  return {
    input: (url: string) => {
      let next = url
      for (const rewrite of rewrites) next = rewrite.input?.(next) ?? next
      return next
    },
    output: (url: string) => {
      let next = url
      for (let i = rewrites.length - 1; i >= 0; i--) {
        next = rewrites[i].output?.(next) ?? next
      }
      return next
    },
  }
}

export const preloadWarning = 'Attempted to preload a route that was not found'

export function createInlineCssStyleAsset() {
  return null
}

export const DEV_STYLES_ATTR = 'data-tanstack-router-dev-styles'
export function appendUniqueUserTags(a: any, _b?: any) {
  return a
}
export function getAssetCrossOrigin() {
  return undefined
}
export function getManifestScriptFormat() {
  return 'module'
}
export function getScriptPreloadAttrs() {
  return {}
}
export function getStylesheetHref(href: string) {
  return href
}
export function resolveManifestAssetLink(link: any) {
  return link
}
export function resolveManifestCssLink(link: any) {
  return link
}
