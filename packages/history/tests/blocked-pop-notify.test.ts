import { describe, expect, test, vi } from 'vitest'
import { createBrowserHistory } from '../src/browser'

function createBrowserHistoryHarness() {
  const location = {
    pathname: '/',
    search: '',
    hash: '',
  }
  const pushState = vi.fn()
  const replaceState = vi.fn()
  const go = vi.fn()
  const listeners: Record<string, (e?: any) => any> = {}
  const nativeHistory = {
    state: { __TSR_index: 0, __TSR_key: '0' },
    length: 1,
    pushState,
    replaceState,
    back: vi.fn(),
    forward: vi.fn(),
    go,
  }
  const win = {
    location,
    history: nativeHistory,
    addEventListener: vi.fn((event: string, handler: (e?: any) => any) => {
      listeners[event] = handler
    }),
    removeEventListener: vi.fn(),
  }
  const history = createBrowserHistory({ window: win })

  return {
    history,
    nativeHistory,
    location,
    go,
    listeners,
  }
}

describe('blocked pop must not notify a successful navigation', () => {
  test('blocked popstate does not notify subscribers of BACK/FORWARD', async () => {
    const { history, nativeHistory, location, listeners } = createBrowserHistoryHarness()

    nativeHistory.state = { __TSR_index: 1, __TSR_key: '1' }
    location.pathname = '/step1'
    await listeners.popstate?.()

    history.block({ blockerFn: () => true })

    const subscriber = vi.fn()
    history.subscribe(subscriber)

    nativeHistory.state = { __TSR_index: 2, __TSR_key: '2' }
    location.pathname = '/step2'
    await listeners.popstate?.()

    expect(subscriber).not.toHaveBeenCalled()
    history.destroy()
  })
})
