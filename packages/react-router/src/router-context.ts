import { createContext } from 'react'
import type { AnyRouter } from 'fast-router-core'

export const routerContext = createContext<AnyRouter>(null as any)
