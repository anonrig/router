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
