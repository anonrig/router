import { createMemoryHistory } from 'fast-router-history'
import { _getRenderedMatches } from '../load-chunk'
import { mergeHeaders } from './headers'
import { attachRouterServerSsrUtils, getNormalizedURL } from './ssr-server'
import { bindSsrResponseToRequest, disposeSsrResponseDetached } from './handler-callback'
import type { HandlerCallback } from './handler-callback'
import type { AnyHeaders } from './headers'
import type { AnyRouter } from '../router'
import type { ServerManifest } from '../manifest'

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

export function createRequestHandler<TRouter extends AnyRouter>({
  createRouter,
  request,
  getRouterManifest,
}: {
  createRouter: () => TRouter
  request: Request
  getRouterManifest?: () => ServerManifest | Promise<ServerManifest>
}): RequestHandler<TRouter> {
  return async (cb) => {
    request.signal.throwIfAborted()
    const router = createRouter()
    let responseOwnsCleanup = false

    try {
      attachRouterServerSsrUtils({
        router,
        manifest: getRouterManifest
          ? await waitForRequest(getRouterManifest(), request.signal)
          : undefined,
      })

      // normalizing and sanitizing the pathname here for server, so we always deal with the same format during SSR.
      const { url } = getNormalizedURL(request.url, 'http://localhost')
      const origin = router.options.origin ?? url.origin
      const href = url.href.replace(url.origin, '')
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

      await router.load({
        _signal: request.signal,
      })
      request.signal.throwIfAborted()

      const result = router._serverResult
      if (result?.type === 'redirect') {
        return result.redirect
      }

      const dehydrated = router.serverSsr?.dehydrate()
      if (dehydrated != null) {
        await waitForRequest(dehydrated, request.signal)
      }
      request.signal.throwIfAborted()

      const responseHeaders = getRequestHeaders({
        router,
      })

      request.signal.throwIfAborted()
      const response = await waitForRequest(
        cb({
          request,
          router,
          responseHeaders,
        }),
        request.signal,
        (late) => {
          disposeSsrResponseDetached(late, request.signal.reason)
        },
      )
      const ssrResponse = bindSsrResponseToRequest(router, response, request.signal)
      request.signal.throwIfAborted()
      responseOwnsCleanup = ssrResponse.serverSsrCleanup === 'stream'
      return ssrResponse.response
    } finally {
      if (!responseOwnsCleanup) {
        // Clean up router SSR state if the callback won't handle it
        // (e.g., if an error occurred before the callback was invoked).
        // Transformed streaming response bodies clean up when consumed/cancelled.
        router.serverSsr?.cleanup()
      }
    }
  }
}

function hasPriorServerRequestState(router: AnyRouter) {
  return router._committed.length > 0
}

function getRequestHeaders(opts: { router: AnyRouter }): Headers {
  const matchHeaders: Array<AnyHeaders> = []
  for (const match of _getRenderedMatches(opts.router.stores.matches.get())) {
    matchHeaders.push(match.headers)
  }

  return mergeHeaders(
    {
      'Content-Type': 'text/html; charset=UTF-8',
    },
    ...matchHeaders,
  )
}
