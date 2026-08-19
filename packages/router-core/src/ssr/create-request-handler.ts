import { createMemoryHistory } from 'speedy-router-history'
import { _getRenderedMatches } from '../load-chunk'
import { mergeHeaders } from './headers'
import { attachRouterServerSsrUtils, getNormalizedURL } from './ssr-server'
import { bindSsrResponseToRequest, disposeSsrResponseDetached } from './handler-callback'
import type { HandlerCallback, HandlerCallbackResult } from './handler-callback'
import type { AnyHeaders } from './headers'
import { RESOLVED, type AnyRouter } from '../router'
import type { ServerManifest } from '../manifest'
import './register-load-server'

export type RequestHandler<TRouter extends AnyRouter> = (
  cb: HandlerCallback<TRouter>,
) => Promise<Response>

type RequestWaiter = ((reason: unknown) => void) | undefined

const requestWaiters = new WeakMap<AbortSignal, Array<RequestWaiter>>()

function removeRequestWaiter(
  waiters: Array<RequestWaiter>,
  index: number,
  reject: (reason: unknown) => void,
) {
  if (waiters[index] !== reject) {
    return
  }
  if (index !== waiters.length - 1) {
    waiters[index] = undefined
    return
  }

  waiters.pop()
  while (waiters.length && waiters[waiters.length - 1] === undefined) {
    waiters.pop()
  }
}

export function waitForRequest<T>(
  value: T | PromiseLike<T>,
  signal: AbortSignal,
  onLate?: (value: T) => void,
): Promise<T> {
  const promise = Promise.resolve(value)
  if (signal.aborted) {
    void promise.then(onLate, () => {})
    return Promise.reject(signal.reason)
  }

  return new Promise<T>((resolve, reject) => {
    let waiters = requestWaiters.get(signal)
    let index: number
    if (waiters) {
      index = waiters.push(reject) - 1
    } else {
      const newWaiters: Array<RequestWaiter> = [reject]
      waiters = newWaiters
      index = 0
      requestWaiters.set(signal, newWaiters)
      signal.addEventListener(
        'abort',
        () => {
          requestWaiters.delete(signal)
          for (const rejectWaiter of newWaiters) {
            rejectWaiter?.(signal.reason)
          }
          newWaiters.length = 0
        },
        { once: true },
      )
    }
    void promise.then(
      (result) => {
        removeRequestWaiter(waiters, index, reject)
        if (signal.aborted) {
          onLate?.(result)
        } else {
          resolve(result)
        }
      },
      (error) => {
        removeRequestWaiter(waiters, index, reject)
        reject(error)
      },
    )
  })
}

function isThenable<T>(value: T | PromiseLike<T>): value is PromiseLike<T> {
  return value != null && typeof (value as PromiseLike<T>).then === 'function'
}

export function createRequestHandler<TRouter extends AnyRouter>({
  createRouter,
  request,
  getRouterManifest,
}: {
  createRouter: () => TRouter
  request: Request
  getRouterManifest?: () => ServerManifest | Promise<ServerManifest>
}): RequestHandler<TRouter> {
  return (cb) => {
    request.signal.throwIfAborted()
    const router = createRouter()
    let responseOwnsCleanup = false

    const cleanupIfNeeded = () => {
      if (!responseOwnsCleanup) {
        // Clean up router SSR state if the callback won't handle it
        // (e.g., if an error occurred before the callback was invoked).
        // Transformed streaming response bodies clean up when consumed/cancelled.
        router.serverSsr?.cleanup()
      }
    }

    const finishResponse = (response: HandlerCallbackResult): Response => {
      const ssrResponse = bindSsrResponseToRequest(router, response, request.signal)
      request.signal.throwIfAborted()
      responseOwnsCleanup = ssrResponse.serverSsrCleanup === 'stream'
      return ssrResponse.response
    }

    const afterDehydrate = (): Response | Promise<Response> => {
      request.signal.throwIfAborted()
      const responseHeaders = getRequestHeaders(router)
      request.signal.throwIfAborted()
      const cbResult = cb({
        request,
        router,
        responseHeaders,
      })
      if (isThenable(cbResult)) {
        return waitForRequest(cbResult, request.signal, (late) => {
          disposeSsrResponseDetached(late, request.signal.reason)
        }).then(finishResponse)
      }
      return finishResponse(cbResult)
    }

    const afterLoad = (): Response | Promise<Response> => {
      request.signal.throwIfAborted()
      const result = router._serverResult
      if (result?.type === 'redirect') {
        return result.redirect
      }

      const dehydrated = router.serverSsr?.dehydrate()
      if (dehydrated != null) {
        return waitForRequest(dehydrated, request.signal).then(afterDehydrate)
      }
      return afterDehydrate()
    }

    const attachAndLoad = (manifest?: ServerManifest): Response | Promise<Response> => {
      attachRouterServerSsrUtils({
        router,
        manifest,
      })
      applyRequestLocation(router, request)
      const loaded = router.load({
        _signal: request.signal,
      })
      if (loaded !== RESOLVED && isThenable(loaded)) {
        return loaded.then(afterLoad)
      }
      return afterLoad()
    }

    const run = (): Response | Promise<Response> => {
      if (!getRouterManifest) return attachAndLoad(undefined)
      const manifest = getRouterManifest()
      if (isThenable(manifest)) {
        return waitForRequest(manifest, request.signal).then(attachAndLoad)
      }
      return attachAndLoad(manifest)
    }

    try {
      const out = run()
      if (isThenable(out)) {
        return out.then(
          (response) => {
            cleanupIfNeeded()
            return response
          },
          (error) => {
            cleanupIfNeeded()
            throw error
          },
        )
      }
      cleanupIfNeeded()
      return Promise.resolve(out)
    } catch (error) {
      cleanupIfNeeded()
      return Promise.reject(error)
    }
  }
}

function applyRequestLocation(router: AnyRouter, request: Request) {
  const parsed = originAndHrefFromRequest(request.url)
  const origin = router.options.origin ?? parsed.origin
  const href = parsed.href
  const current = router.history?.location
  const currentHref = current ? current.pathname + current.search + current.hash : ''
  // A reused router at the same URL still belongs to a new request. Fresh
  // history avoids inheriting the previous request's location state.
  if (
    hasPriorServerRequestState(router) ||
    !current ||
    currentHref !== href ||
    router.origin !== origin
  ) {
    router.update({
      history: createMemoryHistory({
        initialEntries: [href],
      }),
      origin,
    })
  }
}

function originAndHrefFromRequest(requestUrl: string): { origin: string; href: string } {
  const simple = trySimpleAbsoluteHttpUrl(requestUrl)
  if (simple) return simple
  const { url } = getNormalizedURL(requestUrl, 'http://localhost')
  return { origin: url.origin, href: url.href.replace(url.origin, '') }
}

function trySimpleAbsoluteHttpUrl(url: string): { origin: string; href: string } | undefined {
  const https = url.charCodeAt(4) === 115
  if (url.charCodeAt(0) !== 104) return
  if (https) {
    if (url.charCodeAt(5) !== 58 || url.charCodeAt(6) !== 47 || url.charCodeAt(7) !== 47) return
  } else if (url.charCodeAt(4) !== 58 || url.charCodeAt(5) !== 47 || url.charCodeAt(6) !== 47) {
    return
  }
  const hostStart = https ? 8 : 7
  const len = url.length
  let i = hostStart
  for (; i < len; i++) {
    const c = url.charCodeAt(i)
    if (c === 47) break
    if (c === 63 || c === 35 || c === 64 || c === 91 || c <= 0x20) return
  }
  if (i === hostStart) return
  const origin = url.slice(0, i)
  if (i === len) return { origin, href: '/' }
  const href = url.slice(i)
  if (href.charCodeAt(1) === 47) return
  for (let j = 1; j < href.length; j++) {
    const c = href.charCodeAt(j)
    if (c === 37 || c === 63 || c === 35 || c === 92 || c <= 0x20) return
  }
  return { origin, href }
}

function hasPriorServerRequestState(router: AnyRouter) {
  return router._committed.length > 0
}

function getRequestHeaders(router: AnyRouter): Headers {
  const matches = _getRenderedMatches(
    router._committed.length ? router._committed : router.stores.matches.get(),
  )
  for (let i = 0; i < matches.length; i++) {
    if (matches[i]!.headers) {
      const matchHeaders: Array<AnyHeaders> = new Array(matches.length)
      for (let j = 0; j < matches.length; j++) matchHeaders[j] = matches[j]!.headers
      return mergeHeaders({ 'Content-Type': 'text/html; charset=UTF-8' }, ...matchHeaders)
    }
  }
  return new Headers({ 'Content-Type': 'text/html; charset=UTF-8' })
}
