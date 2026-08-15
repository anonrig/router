import { forwardRef } from 'react'
import {
  BaseRootRoute,
  BaseRoute,
  BaseRouteApi,
  createRootRoute as createRootRouteCore,
  createRootRouteWithContext as createRootRouteWithContextCore,
  createRoute as createRouteCore,
  createRouteMask as createRouteMaskCore,
  notFound,
  rootRouteWithContext as rootRouteWithContextCore,
  NotFoundRoute as NotFoundRouteCore,
} from '@anonrig/router-core'
import { Link } from './link'
import { useLoaderData } from './useLoaderData'
import { useLoaderDeps } from './useLoaderDeps'
import { useMatch } from './useMatch'
import { useNavigate } from './useNavigate'
import { useParams } from './useParams'
import { useRouteContext } from './useRouteContext'
import { useRouter } from './useRouter'
import { useSearch } from './useSearch'

export class RouteApi<TId = any, TRouter = any> extends BaseRouteApi<TId, TRouter> {
  useMatch = (opts?: any) =>
    useMatch({ ...opts, from: this.id as string })
  useRouteContext = (opts?: any) =>
    useRouteContext({ ...opts, from: this.id as string })
  useSearch = (opts?: any) =>
    useSearch({ ...opts, from: this.id as string })
  useParams = (opts?: any) =>
    useParams({ ...opts, from: this.id as string })
  useLoaderDeps = (opts?: any) =>
    useLoaderDeps({ ...opts, from: this.id as string, strict: false })
  useLoaderData = (opts?: any) =>
    useLoaderData({ ...opts, from: this.id as string, strict: false })
  useNavigate = () => {
    const router = useRouter()
    const fullPath = router.routesById[this.id as string]?.fullPath
    return useNavigate({ from: fullPath })
  }
  notFound = (opts?: any) => notFound({ routeId: this.id as string, ...opts })
  Link = forwardRef((props: any, ref: any) => {
    const router = useRouter()
    const fullPath = router.routesById[this.id as string]?.fullPath
    return <Link ref={ref} from={fullPath} {...props} />
  }) as any
}

export function getRouteApi(id: string) {
  return new RouteApi({ id })
}

export class Route extends BaseRoute {
  useMatch = (opts?: any) => useMatch({ ...opts, from: this.id })
  useRouteContext = (opts?: any) => useRouteContext({ ...opts, from: this.id })
  useSearch = (opts?: any) => useSearch({ ...opts, from: this.id })
  useParams = (opts?: any) => useParams({ ...opts, from: this.id })
  useLoaderDeps = (opts?: any) =>
    useLoaderDeps({ ...opts, from: this.id, strict: false })
  useLoaderData = (opts?: any) =>
    useLoaderData({ ...opts, from: this.id, strict: false })
  useNavigate = () => useNavigate({ from: this.fullPath })
  Link = forwardRef((props: any, ref: any) => (
    <Link ref={ref} from={this.fullPath} {...props} />
  )) as any
}

export class RootRoute extends BaseRootRoute {
  useMatch = (opts?: any) => useMatch({ ...opts, from: this.id })
  useRouteContext = (opts?: any) => useRouteContext({ ...opts, from: this.id })
  useSearch = (opts?: any) => useSearch({ ...opts, from: this.id })
  useParams = (opts?: any) => useParams({ ...opts, from: this.id })
  useLoaderDeps = (opts?: any) =>
    useLoaderDeps({ ...opts, from: this.id, strict: false })
  useLoaderData = (opts?: any) =>
    useLoaderData({ ...opts, from: this.id, strict: false })
  useNavigate = () => useNavigate({ from: this.fullPath })
  Link = forwardRef((props: any, ref: any) => (
    <Link ref={ref} from={this.fullPath} {...props} />
  )) as any
}

export function createRoute(options?: any) {
  return new Route(options)
}

export function createRootRoute(options?: any) {
  return new RootRoute(options)
}

export function createRootRouteWithContext<TContext>() {
  return (options?: any) => new RootRoute(options)
}

export function rootRouteWithContext<TContext>() {
  return createRootRouteWithContext<TContext>()
}

export function createRouteMask(opts: any) {
  return createRouteMaskCore(opts)
}

export class NotFoundRoute extends NotFoundRouteCore {}

export type AnyRootRoute = RootRoute
export type AsyncRouteComponent = any
export type RouteComponent = any
export type ErrorRouteComponent = any
export type NotFoundRouteComponent = any
export type DefaultRouteTypes = any
export type RouteTypes = any

void createRouteCore
void createRootRouteCore
void createRootRouteWithContextCore
void rootRouteWithContextCore
