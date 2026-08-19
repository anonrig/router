import { describe, expect, test, vi } from 'vitest'
import { createBrowserHistory } from '../src/browser'

function createBrowserHistoryHarness() {
  const location = {
    pathname: '/',
    search: '',
    hash: '',
  }
  let nativeState: any = { __TSR_index: 0, __TSR_key: '0' }
  const pushState = vi.fn((state: any, _title: string, href?: string) => {
    nativeState = state
    if (href) location.pathname = new URL(href, 'http://localhost').pathname
  })
  const replaceState = vi.fn((state: any, _title: string, href?: string) => {
    nativeState = state
    if (href) location.pathname = new URL(href, 'http://localhost').pathname
  })
  const go = vi.fn()
  const listeners: Record<string, (e?: any) => any> = {}
  const nativeHistory = {
    get state() {
      return nativeState
    },
    set state(next) {
      nativeState = next
    },
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
  test('does not leak blocker bypass from a no-op ignored traversal', async () => {
    const { history, nativeHistory, location, go, listeners } = createBrowserHistoryHarness()
    const blockerFn = vi.fn(() => true)
    history.block({ blockerFn })

    history.back({ ignoreBlocker: true })
    history.forward()
    nativeHistory.state = { __TSR_index: 1, __TSR_key: '1' }
    location.pathname = '/forward'
    await listeners.popstate?.()

    expect(blockerFn).toHaveBeenCalledOnce()
    expect(go).toHaveBeenCalledWith(-1)
    expect(history.location.pathname).toBe('/')
    history.destroy()
  })

  test('rolls back when a popstate blocker rejects', async () => {
    const { history, nativeHistory, location, go, listeners } = createBrowserHistoryHarness()
    nativeHistory.state = { __TSR_index: 1, __TSR_key: '1' }
    location.pathname = '/first'
    await listeners.popstate?.()
    go.mockClear()
    history.block({
      blockerFn: async () => {
        throw new Error('blocker failed')
      },
    })

    nativeHistory.state = { __TSR_index: 2, __TSR_key: '2' }
    location.pathname = '/second'

    await expect(listeners.popstate?.()).rejects.toThrow('blocker failed')
    expect(go).toHaveBeenCalledWith(-1)
    expect(history.location.pathname).toBe('/first')
    history.destroy()
  })

  test('orders a native push after an already queued router push', async () => {
    const { history, nativeHistory, location } = createBrowserHistoryHarness()

    history.push('/queued')
    nativeHistory.pushState({ __TSR_index: 2, __TSR_key: 'external' }, '', '/external')
    await Promise.resolve()

    expect(history.location.pathname).toBe('/external')
    expect(location.pathname).toBe('/external')
    history.destroy()
  })

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

  test('does not call win.history.go when delta is 0 and does not leak ignoreNextPop', async () => {
    const harness = createBrowserHistoryHarness()
    const { history, nativeHistory, location, go, listeners } = harness

    nativeHistory.state = { __TSR_index: 1, __TSR_key: '1' }
    location.pathname = '/step1'
    await listeners.popstate?.()
    go.mockClear()

    history.block({
      blockerFn: () => true,
    })

    // Simulate same index popstate (delta = 0)
    nativeHistory.state = { __TSR_index: 1, __TSR_key: '1' }
    location.hash = '#hash'
    await listeners.popstate?.()

    // Must not call go(0)
    expect(go).not.toHaveBeenCalled()

    // Unblock and verify next popstate is not swallowed
    history.destroy()
    const unblockedHistory = createBrowserHistory({ window: harness.win })
    nativeHistory.state = { __TSR_index: 2, __TSR_key: '2' }
    location.pathname = '/step2'
    await listeners.popstate?.()

    expect(unblockedHistory.location.pathname).toBe('/step2')
    unblockedHistory.destroy()
  })

  test('does not call win.history.go when delta is NaN (missing index)', async () => {
    const harness = createBrowserHistoryHarness()
    const { history, nativeHistory, location, go, listeners } = harness

    nativeHistory.state = { __TSR_index: 1, __TSR_key: '1' }
    location.pathname = '/step1'
    await listeners.popstate?.()
    go.mockClear()

    history.block({
      blockerFn: () => true,
    })

    // Simulate state missing __TSR_index (delta = NaN)
    nativeHistory.state = {} as any
    location.pathname = '/external'
    await listeners.popstate?.()

    // Must not call go(NaN) which would reload the page
    expect(go).not.toHaveBeenCalled()
    history.destroy()
  })
})
