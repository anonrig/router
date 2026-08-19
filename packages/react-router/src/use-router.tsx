import { useContext } from 'react'
import { routerContext } from './router-context'
import type { AnyRouter, RegisteredRouter } from 'speedy-router-core'

export function useRouter<TRouter extends AnyRouter = RegisteredRouter>(_opts?: {
  warn?: boolean
}): TRouter {
  const router = useContext(routerContext)
  if (!router && _opts?.warn !== false) {
    throw new Error('useRouter must be used inside a <RouterProvider>')
  }
  return router as TRouter
}
