import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useRouter } from './useRouter'
import type { HistoryAction } from '@anonrig/history'
import type {
  AnyRoute,
  AnyRouter,
  ParseRoute,
  RegisteredRouter,
} from '@anonrig/router-core'

type ShouldBlockFnLocation<
  out TRouteId,
  out TFullPath,
  out TAllParams,
  out TFullSearchSchema,
> = {
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

export function useBlocker<
  TRouter extends AnyRouter = RegisteredRouter,
  TWithResolver extends boolean = false,
>(
  opts: UseBlockerOpts<TRouter, TWithResolver>,
): TWithResolver extends true ? BlockerResolver<TRouter> : void
export function useBlocker(opts?: any): any {
  const router = useRouter()
  const optsRef = useRef(opts)
  optsRef.current = opts
  const [status, setStatus] = useState<'idle' | 'blocked'>('idle')
  const proceedRef = useRef<(() => void) | undefined>(undefined)
  const resetRef = useRef<(() => void) | undefined>(undefined)

  useEffect(() => {
    return router.history.block({
      blockerFn: async (args: any) => {
        const current = optsRef.current
        const fn =
          typeof current === 'function'
            ? current
            : current?.shouldBlockFn ?? (current as any)?.blockerFn
        const should = fn ? await fn(args) : true
        if (!should) return false
        if (typeof current !== 'function' && current?.withResolver) {
          return await new Promise<boolean>((resolve) => {
            setStatus('blocked')
            proceedRef.current = () => {
              setStatus('idle')
              resolve(false)
            }
            resetRef.current = () => {
              setStatus('idle')
              resolve(true)
            }
          })
        }
        return should
      },
      enableBeforeUnload:
        typeof opts === 'function' ? true : (opts?.enableBeforeUnload ?? true),
    })
  }, [router])

  return {
    status,
    proceed: () => proceedRef.current?.(),
    reset: () => resetRef.current?.(),
  } as any
}

export function Block(props: UseBlockerOpts & { children?: ReactNode }) {
  useBlocker(props)
  return props.children ?? null
}
