import { useContext } from 'react'
import { routerContext } from './routerContext'
import type { AnyRouter } from '@anonrig/router-core'

export function useRouter<TRouter extends AnyRouter = AnyRouter>(): TRouter {
  const router = useContext(routerContext)
  if (!router) {
    throw new Error('useRouter must be used inside a <RouterProvider>')
  }
  return router as TRouter
}
