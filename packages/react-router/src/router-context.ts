import { createContext } from 'react'
import type { AnyRouter } from 'speedy-router-core'

export const routerContext = createContext<AnyRouter>(null as any)
