import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'
import { setLoadServerRoute } from '@tanstack/router-core'
import { loadServerRoute } from '../packages/router-core/src/load-server'

if (typeof Error.isError !== 'function') {
  Object.defineProperty(Error, 'isError', {
    value(value: unknown) {
      return value instanceof Error
    },
  })
}

setLoadServerRoute(loadServerRoute)

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
if (typeof window !== 'undefined') {
  window.scrollTo = vi.fn()
}
