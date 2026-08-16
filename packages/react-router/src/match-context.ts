import { createContext } from 'react'

export const matchContext = createContext<string | undefined>(undefined)
export const dummyMatchContext = matchContext
export const errorResetContext = createContext('')
