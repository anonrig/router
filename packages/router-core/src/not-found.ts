export type NotFoundError = {
  global?: boolean
  _global?: boolean
  data?: any
  throw?: boolean
  routeId?: string
  headers?: HeadersInit
  isNotFound?: boolean
}

export function notFound(options: NotFoundError = {}) {
  ;(options as any).isNotFound = true
  if (options.throw) throw options
  return options
}

export function isNotFound(obj: any): obj is NotFoundError {
  return obj?.isNotFound === true
}
