'use client'

import * as React from 'react'

export type NonRouteComponent = 'pendingComponent' | 'errorComponent' | 'notFoundComponent'

export const nonRouteComponentContext =
  process.env.NODE_ENV !== 'production'
    ? React.createContext<NonRouteComponent | undefined>(undefined)
    : undefined

export function wrapInNonRouteComponentContext(
  element: React.ReactElement,
  component: NonRouteComponent,
): React.ReactElement {
  if (process.env.NODE_ENV === 'production') {
    return element
  }
  const Context = nonRouteComponentContext!
  return <Context.Provider value={component}>{element}</Context.Provider>
}
