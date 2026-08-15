import {
  createLazyFileRoute as createLazyFileRouteCore,
  createLazyRoute as createLazyRouteCore,
  FileRouteLoader as FileRouteLoaderCore,
} from '@anonrig/router-core'
import { createRoute } from './route'

export function createFileRoute(path: string) {
  return (options: any = {}) => {
    const route = createRoute({
      ...options,
      ...(options.path || options.id
        ? {}
        : path === '/' || path === ''
          ? { path: '/' }
          : { path }),
    })
    return route
  }
}

export function createLazyFileRoute(path: string) {
  return createLazyFileRouteCore(path)
}

export function createLazyRoute(id: string) {
  return createLazyRouteCore(id)
}

export class FileRoute {
  path: string
  constructor(path: string) {
    this.path = path
  }
  createRoute = (options: any = {}) => createFileRoute(this.path)(options)
}

export const FileRouteLoader = FileRouteLoaderCore

export class LazyRoute {
  options: Record<string, any>
  constructor(options: Record<string, any> = {}) {
    this.options = options
  }
}
