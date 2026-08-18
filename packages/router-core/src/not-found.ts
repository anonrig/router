export type NotFoundOptions = {
  global?: boolean
  _global?: boolean
  data?: any
  throw?: boolean
  routeId?: string
  headers?: HeadersInit
  isNotFound?: boolean
}

export type NotFoundError = Error & NotFoundOptions

export function notFound(options: NotFoundOptions = {}): NotFoundError {
  const error = options as NotFoundError
  error.isNotFound = true
  if (options.throw) throw error
  return error
}

export function isNotFound(obj: any): obj is NotFoundError {
  return obj?.isNotFound === true
}
