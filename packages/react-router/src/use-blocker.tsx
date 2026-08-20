import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useRouter } from './use-router'
import type { HistoryAction } from 'speedy-router-history'
import type { AnyRoute, AnyRouter, ParseRoute, RegisteredRouter } from 'speedy-router-core'

type ShouldBlockFnLocation<out TRouteId, out TFullPath, out TAllParams, out TFullSearchSchema> = {
  routeId: TRouteId
  fullPath: TFullPath
  pathname: string
  params: TAllParams
  search: TFullSearchSchema
}

type MakeShouldBlockFnLocationUnion<
  TRouter extends AnyRouter = RegisteredRouter,
  TRoute extends AnyRoute = ParseRoute<TRouter['routeTree']>,
> = TRoute extends any
  ? ShouldBlockFnLocation<
      TRoute['id'],
      TRoute['fullPath'],
      TRoute['types']['allParams'],
      TRoute['types']['fullSearchSchema']
    >
  : never

type BlockerResolver<TRouter extends AnyRouter = RegisteredRouter> =
  | {
      status: 'blocked'
      current: MakeShouldBlockFnLocationUnion<TRouter>
      next: MakeShouldBlockFnLocationUnion<TRouter>
      action: HistoryAction
      proceed: () => void
      reset: () => void
    }
  | {
      status: 'idle'
      current: undefined
      next: undefined
      action: undefined
      proceed: undefined
      reset: undefined
    }

type ShouldBlockFnArgs<TRouter extends AnyRouter = RegisteredRouter> = {
  current: MakeShouldBlockFnLocationUnion<TRouter>
  next: MakeShouldBlockFnLocationUnion<TRouter>
  action: HistoryAction
}

export type ShouldBlockFn<TRouter extends AnyRouter = RegisteredRouter> = (
  args: ShouldBlockFnArgs<TRouter>,
) => boolean | Promise<boolean>

export type UseBlockerOpts<
  TRouter extends AnyRouter = RegisteredRouter,
  TWithResolver extends boolean = boolean,
> = {
  shouldBlockFn: ShouldBlockFn<TRouter>
  enableBeforeUnload?: boolean | (() => boolean)
  disabled?: boolean
  withResolver?: TWithResolver
}

function toBlockerLocation(router: AnyRouter, location: any) {
  const parsed =
    location && typeof location.search === 'object' && !Array.isArray(location.search)
      ? location
      : (router.parseLocation?.(location) ?? location ?? {})
  const matches = router.matchRoutes?.(parsed) ?? []
  const last = matches[matches.length - 1]
  const route = last ? router.routesById?.[last.routeId] : undefined
  return {
    routeId: last?.routeId ?? route?.id,
    fullPath: last?.fullPath ?? route?.fullPath ?? parsed.pathname,
    pathname: parsed.pathname,
    params: last?.params ?? {},
    search: parsed.search && typeof parsed.search === 'object' ? parsed.search : {},
  }
}

export function useBlocker<
  TRouter extends AnyRouter = RegisteredRouter,
  TWithResolver extends boolean = false,
>(
  opts: UseBlockerOpts<TRouter, TWithResolver>,
): TWithResolver extends true ? BlockerResolver<TRouter> : void
export function useBlocker(opts?: any): any {
  const router = useRouter()
  const optsRef = useRef(opts)
  const [state, setState] = useState<{
    status: 'idle' | 'blocked'
    current?: any
    next?: any
    action?: HistoryAction
  }>({ status: 'idle' })
  const proceedRef = useRef<(() => void) | undefined>(undefined)
  const resetRef = useRef<(() => void) | undefined>(undefined)
  const activeResolverRef = useRef<
    { settle: (blocked: boolean, updateState?: boolean) => void } | undefined
  >(undefined)

  useEffect(() => {
    optsRef.current = opts
  })

  useEffect(() => {
    // Owned by this registration: the cleanup below advances it so nothing that
    // started under this blocker can publish state once the blocker is gone.
    let generation = 0
    // Highest attempt that let a navigation through. A superseded pop uses this to
    // tell whether the history stack it wanted to revert has already moved on.
    let releasedAttempt = 0
    const unblock = router.history.block({
      blockerFn: async (args: any) => {
        // Every attempt claims a generation, including the ones that bail out below,
        // so a newer navigation always invalidates an in-flight shouldBlockFn.
        const attempt = ++generation
        const release = () => {
          if (attempt > releasedAttempt) releasedAttempt = attempt
          return false
        }
        const current = optsRef.current
        if (current && typeof current !== 'function' && current.disabled) return release()
        const fn =
          typeof current === 'function'
            ? current
            : (current?.shouldBlockFn ?? (current as any)?.blockerFn)
        const from = args.currentLocation ?? args.current
        const mapped = {
          action: args.action,
          current: toBlockerLocation(router, from),
          next: toBlockerLocation(router, args.nextLocation ?? args.next),
        }
        const fromPath = from?.pathname ?? mapped.current.pathname
        const nextPath = mapped.next.pathname
        if (
          fromPath &&
          fromPath !== '/' &&
          !router.getMatchedRoutes?.(fromPath)?.[2] &&
          nextPath &&
          router.getMatchedRoutes?.(nextPath)?.[2]
        ) {
          return release()
        }
        const should = fn ? await fn(mapped) : true
        if (attempt !== generation) {
          // A pop is already applied when the blocker runs, so blocking it means
          // reverting with the delta captured when the pop fired. Once a newer
          // attempt let a navigation through, the stack moved and that delta would
          // send the URL somewhere the router never navigated to. Only an attempt
          // that still owns the pop may block it.
          const isPop =
            mapped.action === 'BACK' || mapped.action === 'FORWARD' || mapped.action === 'GO'
          return !(isPop && releasedAttempt > attempt)
        }
        if (!should) return release()
        if (typeof current !== 'function' && current?.withResolver) {
          return await new Promise<boolean>((resolve) => {
            activeResolverRef.current?.settle(true)
            let settled = false
            const entry = {
              settle: (blocked: boolean, updateState = true) => {
                if (settled) return
                settled = true
                if (!blocked) release()
                if (activeResolverRef.current === entry) {
                  activeResolverRef.current = undefined
                  proceedRef.current = undefined
                  resetRef.current = undefined
                  if (updateState) setState({ status: 'idle' })
                }
                resolve(blocked)
              },
            }
            activeResolverRef.current = entry
            setState({
              status: 'blocked',
              current: mapped.current,
              next: mapped.next,
              action: mapped.action,
            })
            proceedRef.current = () => entry.settle(false)
            resetRef.current = () => entry.settle(true)
          })
        }
        return should
      },
      enableBeforeUnload: () => {
        const current = optsRef.current
        if (typeof current === 'function') return true
        const option = current?.enableBeforeUnload
        return typeof option === 'function' ? option() : (option ?? true)
      },
    })
    return () => {
      unblock()
      // Invalidate any pending shouldBlockFn so it cannot install a resolver that
      // nobody would ever settle, then settle the resolver that is already installed.
      generation++
      activeResolverRef.current?.settle(true, false)
    }
  }, [router])

  const blocked = state.status === 'blocked'
  let proceed: (() => void) | undefined
  let reset: (() => void) | undefined
  if (blocked) {
    proceed = () => proceedRef.current?.()
    reset = () => resetRef.current?.()
  }
  return {
    status: state.status,
    current: state.current,
    next: state.next,
    action: state.action,
    proceed,
    reset,
  } as any
}

export function Block(props: UseBlockerOpts & { children?: ReactNode }) {
  useBlocker(props)
  return props.children ?? null
}
