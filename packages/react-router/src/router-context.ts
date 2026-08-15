import { createContext } from 'react'
import type { AnyRouter } from '@anonrig/router-core'

export const routerContext = createContext<AnyRouter>(null as any)
