import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'
import '../packages/router-core/src/ssr/register-load-server'

if (typeof Error.isError !== 'function') {
  Object.defineProperty(Error, 'isError', {
    value(value: unknown) {
      return value instanceof Error
    },
  })
}

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
if (typeof window !== 'undefined') {
  window.scrollTo = vi.fn()
}
