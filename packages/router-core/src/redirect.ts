import type { NavigateOptions } from './link'
import type { AnyRouter, RegisteredRouter } from './router'
import type { ParsedLocation } from './location'

export type AnyRedirect = Redirect<any, any, any, any, any>

export type Redirect<
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends string = string,
  TTo extends string | undefined = undefined,
  TMaskFrom extends string = TFrom,
  TMaskTo extends string = '.',
> = Response & {
  options: NavigateOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo> & {
    _builtLocation?: ParsedLocation
  }
}

export type RedirectOptions<
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends string = string,
  TTo extends string | undefined = undefined,
  TMaskFrom extends string = TFrom,
  TMaskTo extends string = '.',
> = {
  href?: string
  code?: number
  statusCode?: number
  throw?: any
  headers?: HeadersInit
  _builtLocation?: ParsedLocation
} & NavigateOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo>

export type ResolvedRedirect<
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends string = string,
  TTo extends string = '',
  TMaskFrom extends string = TFrom,
  TMaskTo extends string = '',
> = Redirect<TRouter, TFrom, TTo, TMaskFrom, TMaskTo>

export type RedirectOptionsRoute<
  TDefaultFrom extends string = string,
  TRouter extends AnyRouter = RegisteredRouter,
  TTo extends string | undefined = undefined,
  TMaskTo extends string = '',
> = Omit<RedirectOptions<TRouter, TDefaultFrom, TTo, TDefaultFrom, TMaskTo>, 'from'>

export interface RedirectFnRoute<in out TDefaultFrom extends string = string> {
  <
    TRouter extends AnyRouter = RegisteredRouter,
    const TTo extends string | undefined = undefined,
    const TMaskTo extends string = '',
  >(
    opts: RedirectOptionsRoute<TDefaultFrom, TRouter, TTo, TMaskTo>,
  ): Redirect<TRouter, TDefaultFrom, TTo, TDefaultFrom, TMaskTo>
}

export function redirect<
  TRouter extends AnyRouter = RegisteredRouter,
  const TTo extends string | undefined = '.',
  const TFrom extends string = string,
  const TMaskFrom extends string = TFrom,
  const TMaskTo extends string = '',
>(
  opts: RedirectOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo>,
): Redirect<TRouter, TFrom, TTo, TMaskFrom, TMaskTo> {
  opts.statusCode = opts.statusCode || opts.code || 307

  if (!opts._builtLocation && !opts.reloadDocument && typeof opts.href === 'string') {
    if (URL.canParse(opts.href)) opts.reloadDocument = true
  }

  const headers = new Headers(opts.headers)
  if (opts.href && headers.get('Location') === null) {
    headers.set('Location', opts.href)
  }

  const response = new Response(null, {
    status: opts.statusCode,
    headers,
  })
  ;(response as Redirect<TRouter, TFrom, TTo, TMaskFrom, TMaskTo>).options = opts

  if (opts.throw) throw response
  return response as Redirect<TRouter, TFrom, TTo, TMaskFrom, TMaskTo>
}

export function isRedirect(obj: any): obj is AnyRedirect {
  return obj instanceof Response && !!(obj as any).options
}

export function isResolvedRedirect(obj: any): obj is AnyRedirect & { options: { href: string } } {
  return isRedirect(obj) && !!obj.options.href
}

export function parseRedirect(obj: any) {
  if (obj !== null && typeof obj === 'object' && obj.isSerializedRedirect) {
    return redirect(obj)
  }
  return undefined
}
