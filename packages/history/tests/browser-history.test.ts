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
    win,
    nativeHistory,
    location,
    go,
    listeners,
  }
}

describe('createBrowserHistory popstate blocker rollback', () => {
  test('rolls back forward navigation by calling win.history.go(-1) when blocked', async () => {
    const harness = createBrowserHistoryHarness()
    const { history, nativeHistory, location, go, listeners } = harness

    // Set initial position to index 1 without blocker
    nativeHistory.state = { __TSR_index: 1, __TSR_key: '1' }
    location.pathname = '/step1'
    await listeners.popstate?.()
    go.mockClear()

    // Now register blocker
    history.block({
      blockerFn: () => true,
    })

    // Simulate forward navigation to index 2 (delta = 2 - 1 = +1)
    nativeHistory.state = { __TSR_index: 2, __TSR_key: '2' }
    location.pathname = '/step2'
    await listeners.popstate?.()

    // Rolling back a forward navigation (delta = +1) must call go(-1)
    expect(go).toHaveBeenCalledWith(-1)
    history.destroy()
  })

  test('rolls back multi-step jump by calling win.history.go(-delta) when blocked', async () => {
    const harness = createBrowserHistoryHarness()
    const { history, nativeHistory, location, go, listeners } = harness

    // Set initial position to index 5 without blocker
    nativeHistory.state = { __TSR_index: 5, __TSR_key: '5' }
    location.pathname = '/step5'
    await listeners.popstate?.()
    go.mockClear()

    // Now register blocker
    history.block({
      blockerFn: () => true,
    })

    // Simulate multi-step back jump to index 2 (delta = 2 - 5 = -3)
    nativeHistory.state = { __TSR_index: 2, __TSR_key: '2' }
    location.pathname = '/step2'
    await listeners.popstate?.()

    // Rolling back a jump of delta = -3 must call go(3)
    expect(go).toHaveBeenCalledWith(3)
    history.destroy()
  })
})
