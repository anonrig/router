import { createRoute, type AnyRoute, type RouteOptions } from './route'

export function createFileRoute(path: string) {
  return (options: RouteOptions = {}) => {
    const isPathless = path.includes('_') && !path.includes('$') && !path.endsWith('/')
    const opts: RouteOptions = { ...options }
    if (!opts.path && !opts.id) {
      if (path === '/' || path === '') opts.path = '/'
      else if (path.startsWith('/')) opts.path = path
      else opts.path = '/' + path
    }
    return createRoute(opts)
  }
}

export function createLazyFileRoute(_path: string) {
  return (options: RouteOptions = {}) => ({ options, isLazy: true })
}

export function createLazyRoute(_id: string) {
  return (options: RouteOptions = {}) => ({ options, isLazy: true })
}

export class FileRoute {
  path: string
  constructor(path: string) {
    this.path = path
  }
  createRoute = (options: RouteOptions = {}) => createFileRoute(this.path)(options)
}

export class LazyRoute {
  options: RouteOptions
  constructor(options: RouteOptions = {}) {
    this.options = options
  }
}

export function FileRouteLoader(_path: string) {
  return (loader: any) => loader
}

export type InferFileRouteTypes = any
export type FileRouteTypes = any
export type FileRoutesByPath = Record<string, any>
export type CreateFileRoute = typeof createFileRoute
export type CreateLazyFileRoute = typeof createLazyFileRoute
export type LazyRouteOptions = RouteOptions
