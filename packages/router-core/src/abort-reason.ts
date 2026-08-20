/**
 * The platform's own default abort reason, captured once.
 *
 * `controller.abort()` with no reason makes the platform build a fresh
 * `AbortError` — and capture a stack trace — on every call. A client navigation
 * aborts several controllers, so that dominated its cost.
 *
 * The reason is taken from a throwaway controller rather than constructed, so
 * `name` / `message` / `code` stay whatever the host uses. The message is engine
 * specific ('This operation was aborted' on Node, 'signal is aborted without
 * reason' on Chrome and Safari), and a `DOMException` built here would not share
 * the realm that backs `AbortController`.
 *
 * Its own module so `utils` importers do not carry this side effect, and not
 * `/* @__PURE__ *\/` because the identity is the point.
 */
const captured = new AbortController()
captured.abort()

export const ABORT_REASON: unknown = captured.signal.reason
