import { PassThrough } from 'node:stream'
import ReactDOMServer from 'react-dom/server'
import {
  createSsrStreamResponse,
  transformPipeableStreamWithRouter,
  transformReadableStreamWithRouter,
} from 'fast-router-core/ssr/server'
import type { AnyRouter } from 'fast-router-core'
import type { ReadableStream } from 'node:stream/web'
import type { ReactNode } from 'react'

// A client disconnecting mid-stream is normal operation, not a render
// failure; don't let React's onError log it as one.
const isAbortError = (request: Request, error: unknown) =>
  (request.signal.aborted && error === request.signal.reason) ||
  (Error.isError(error) && error.name === 'AbortError')

export const renderRouterToStream = async ({
  request,
  router,
  responseHeaders,
  children,
}: {
  request: Request
  router: AnyRouter
  responseHeaders: Headers
  children: ReactNode
}) => {
  if (typeof ReactDOMServer.renderToReadableStream === 'function') {
    const stream = await ReactDOMServer.renderToReadableStream(children, {
      signal: request.signal,
      nonce: router.options.ssr?.nonce,
      progressiveChunkSize: Number.POSITIVE_INFINITY,
      onError: (error, info) => {
        if (!isAbortError(request, error)) {
          console.error('Error in renderToReadableStream:', error, info)
        }
      },
    })

    const responseStream = transformReadableStreamWithRouter(
      router,
      stream as unknown as ReadableStream,
      {
        signal: request.signal,
        onAbort: () => stream.cancel().catch(() => {}),
      },
    )
    return createSsrStreamResponse(
      router,
      new Response(responseStream as any, {
        status: router._serverResult?.type === 'render' ? router._serverResult.status : 200,
        headers: responseHeaders,
      }),
    )
  }

  if (typeof ReactDOMServer.renderToPipeableStream === 'function') {
    const reactAppPassthrough = new PassThrough()

    let pipeable: ReturnType<typeof ReactDOMServer.renderToPipeableStream> | undefined
    let responseAttached = false
    let aborted = false
    let endedBeforeAttach = false
    let pendingAbortReason: unknown
    const toError = (reason: unknown) =>
      Error.isError(reason) ? reason : new Error(String(reason ?? 'SSR aborted'))
    const destroyError = (reason: unknown) => (reason === undefined ? undefined : toError(reason))
    const pendingDestroyError = () =>
      pendingAbortReason === undefined
        ? toError(pendingAbortReason)
        : destroyError(pendingAbortReason)
    const finishPassThrough = (reason: unknown, opts?: { defaultError?: boolean }) => {
      if (reactAppPassthrough.destroyed) return
      if (responseAttached) {
        reactAppPassthrough.destroy(opts?.defaultError ? toError(reason) : destroyError(reason))
      } else {
        endedBeforeAttach = true
        // onError can fire synchronously before React returns the pipeable
        // handle and before Readable.toWeb() is attached. Defer touching the
        // PassThrough until after the router transform can observe the error.
      }
    }
    const abortPipeable = (reason?: unknown, opts?: { defaultError?: boolean }) => {
      if (aborted) return
      aborted = true
      pendingAbortReason = reason
      const err = toError(reason)
      try {
        pipeable?.abort(err)
      } catch {
        // ignore — React may throw if already aborted/finished
      }
      finishPassThrough(reason, opts)
    }

    // Register before attaching the router transform; the transform may
    // synchronously cleanup/error, and cleanup must still remove this listener.
    if (request.signal.aborted) {
      abortPipeable(request.signal.reason)
    } else {
      const onRequestAbort = () => abortPipeable(request.signal.reason)
      request.signal.addEventListener('abort', onRequestAbort, { once: true })
      router.serverSsr?.onCleanup(() => {
        request.signal.removeEventListener('abort', onRequestAbort)
      })
    }

    try {
      pipeable = ReactDOMServer.renderToPipeableStream(children, {
        nonce: router.options.ssr?.nonce,
        progressiveChunkSize: Number.POSITIVE_INFINITY,
        onShellReady() {
          pipeable!.pipe(reactAppPassthrough)
        },
        onError: (error, info) => {
          if (!isAbortError(request, error)) {
            console.error('Error in renderToPipeableStream:', error, info)
          }
          abortPipeable(error, { defaultError: true })
        },
      })
    } catch (e) {
      console.error('Error in renderToPipeableStream:', e)
      router.serverSsr?.cleanup()
      throw e
    }

    const responseStream = transformPipeableStreamWithRouter(router, reactAppPassthrough, {
      signal: request.signal,
      onAbort: abortPipeable,
    })
    responseAttached = true

    if (endedBeforeAttach) {
      reactAppPassthrough.destroy(pendingDestroyError())
    }

    // React's onError may have fired synchronously inside
    // renderToPipeableStream before `pipeable` was assigned. If so,
    // abortPipeable ran without a pipeable handle; re-apply the abort now.
    if (aborted && pipeable) {
      try {
        pipeable.abort(toError(pendingAbortReason))
      } catch {
        // ignore — React may throw if already aborted/finished
      }
    }

    return createSsrStreamResponse(
      router,
      new Response(responseStream as any, {
        status: router._serverResult?.type === 'render' ? router._serverResult.status : 200,
        headers: responseHeaders,
      }),
    )
  }

  throw new Error(
    'No renderToReadableStream or renderToPipeableStream found in react-dom/server. Ensure you are using a version of react-dom that supports streaming.',
  )
}
