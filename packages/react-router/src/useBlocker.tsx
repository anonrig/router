import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useRouter } from './useRouter'

export function useBlocker(opts: UseBlockerOpts | ((args: any) => any) = {}) {
  const router = useRouter()
  const optsRef = useRef(opts)
  optsRef.current = opts
  const [status, setStatus] = useState<'idle' | 'blocked'>('idle')
  const proceedRef = useRef<(() => void) | undefined>(undefined)
  const resetRef = useRef<(() => void) | undefined>(undefined)

  useEffect(() => {
    return router.history.block({
      blockerFn: async (args) => {
        const current = optsRef.current
        const fn = typeof current === 'function' ? current : current.shouldBlockFn ?? current.blockerFn
        const enable = typeof current === 'function' ? true : current.enableBeforeUnload
        const should = fn ? await fn(args) : true
        if (!should) return false
        if (typeof current !== 'function' && current.withResolver) {
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
        typeof opts === 'function' ? true : (opts.enableBeforeUnload ?? true),
    })
  }, [router])

  return {
    status,
    proceed: () => proceedRef.current?.(),
    reset: () => resetRef.current?.(),
  }
}

export function Block(props: UseBlockerOpts & { children?: ReactNode }) {
  useBlocker(props)
  return props.children ?? null
}

export type UseBlockerOpts = {
  shouldBlockFn?: (args: any) => any
  blockerFn?: (args: any) => any
  enableBeforeUnload?: boolean | (() => boolean)
  withResolver?: boolean
  children?: ReactNode
}
export type ShouldBlockFn = (args: any) => any
