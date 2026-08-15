import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
window.scrollTo = vi.fn()
