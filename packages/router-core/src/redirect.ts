export type AnyRedirect = Redirect<any, any, any, any, any>

export type Redirect<
  TRouter = any,
  TFrom extends string = string,
  TTo extends string | undefined = undefined,
  TMaskFrom extends string = TFrom,
  TMaskTo extends string = '.',
> = Response & {
  options: Record<string, any> & {
    _builtLocation?: any
  }
}

export type RedirectOptions<
  TRouter = any,
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
  _builtLocation?: any
} & Record<string, any>

export type ResolvedRedirect = Redirect

export function redirect(opts: RedirectOptions): AnyRedirect {
  opts.statusCode = opts.statusCode || opts.code || 307

  if (!opts._builtLocation && !opts.reloadDocument && typeof opts.href === 'string') {
    try {
      new URL(opts.href)
      opts.reloadDocument = true
    } catch {
      // relative
    }
  }

  const headers = new Headers(opts.headers)
  if (opts.href && headers.get('Location') === null) {
    headers.set('Location', opts.href)
  }

  const response = new Response(null, {
    status: opts.statusCode,
    headers,
  })
  ;(response as AnyRedirect).options = opts

  if (opts.throw) throw response
  return response as AnyRedirect
}

export function isRedirect(obj: any): obj is AnyRedirect {
  return obj instanceof Response && !!(obj as any).options
}

export function isResolvedRedirect(
  obj: any,
): obj is AnyRedirect & { options: { href: string } } {
  return isRedirect(obj) && !!obj.options.href
}

export function parseRedirect(obj: any) {
  if (obj !== null && typeof obj === 'object' && obj.isSerializedRedirect) {
    return redirect(obj)
  }
  return undefined
}

export type RedirectFnRoute<TDefaultFrom extends string = string> = (
  opts: any,
) => AnyRedirect

export type RedirectOptionsRoute = any
