import { useContext } from 'react'
import { routerContext } from './router-context'
import type { AnyRouter } from 'fast-router-core'

export function useRouter<TRouter extends AnyRouter = AnyRouter>(_opts?: {
  warn?: boolean
}): TRouter {
  const router = useContext(routerContext)
  if (!router) {
    throw new Error('useRouter must be used inside a <RouterProvider>')
  }
  return router as TRouter
}
