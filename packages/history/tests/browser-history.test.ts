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
    pushState,
    listeners,
  }
}

describe('createBrowserHistory popstate blocker rollback', () => {
  test('flushes a queued push before traversing back', () => {
    const { history, nativeHistory, pushState } = createBrowserHistoryHarness()

    history.push('/queued')
    history.back()

    expect(pushState).toHaveBeenCalledOnce()
    expect(pushState.mock.invocationCallOrder[0]).toBeLessThan(
      nativeHistory.back.mock.invocationCallOrder[0]!,
    )
    history.destroy()
  })

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

  test('does not classify back as go after an out-of-range go', async () => {
    const { history, nativeHistory, location, listeners } = createBrowserHistoryHarness()
    nativeHistory.state = { __TSR_index: 1, __TSR_key: '1' }
    location.pathname = '/one'
    await listeners.popstate?.()
    const actions: any[] = []
    history.subscribe(({ action }) => actions.push(action))

    history.go(99)
    history.back()
    nativeHistory.state = { __TSR_index: 0, __TSR_key: '0' }
    location.pathname = '/'
    await listeners.popstate?.()

    expect(actions).toEqual([{ type: 'BACK' }])
    history.destroy()
  })

  test('assigns a finite index after an external pushState without router state', async () => {
    const { history, nativeHistory } = createBrowserHistoryHarness()

    nativeHistory.pushState({ foreign: true }, '', '/external')
    history.push('/router')
    await Promise.resolve()

    expect(history.location.state.__TSR_index).toBe(2)
    expect(nativeHistory.state.__TSR_index).toBe(2)
    history.destroy()
  })

  test('go can bypass popstate blockers', async () => {
    const { history, nativeHistory, location, listeners } = createBrowserHistoryHarness()
    const blockerFn = vi.fn(() => true)
    history.block({ blockerFn })

    history.go(2, { ignoreBlocker: true })
    nativeHistory.state = { __TSR_index: 2, __TSR_key: '2' }
    location.pathname = '/step2'
    await listeners.popstate?.()

    expect(blockerFn).not.toHaveBeenCalled()
    expect(history.location.pathname).toBe('/step2')
    history.destroy()
  })

  test('normal back navigation does not suppress beforeunload blockers', () => {
    const { history, listeners } = createBrowserHistoryHarness()
    history.block({ blockerFn: () => false })
    const event = {
      preventDefault: vi.fn(),
      returnValue: undefined,
    }

    history.back()
    listeners.beforeunload?.(event)

    expect(event.preventDefault).toHaveBeenCalled()
    expect(event.returnValue).toBe('')
    history.destroy()
  })

  test('ignores stale async blocker results after a newer popstate settles', async () => {
    const { history, nativeHistory, location, go, listeners } = createBrowserHistoryHarness()
    nativeHistory.state = { __TSR_index: 2, __TSR_key: '2' }
    location.pathname = '/two'
    await listeners.popstate?.()
    go.mockClear()

    const first = Promise.withResolvers<boolean>()
    const second = Promise.withResolvers<boolean>()
    let call = 0
    history.block({
      blockerFn: () => (++call === 1 ? first.promise : second.promise),
    })

    nativeHistory.state = { __TSR_index: 1, __TSR_key: '1' }
    location.pathname = '/one'
    const firstPop = listeners.popstate?.()

    nativeHistory.state = { __TSR_index: 0, __TSR_key: '0' }
    location.pathname = '/zero'
    const secondPop = listeners.popstate?.()
    second.resolve(false)
    await secondPop
    expect(history.location.pathname).toBe('/zero')

    first.resolve(true)
    await firstPop

    expect(go).not.toHaveBeenCalled()
    expect(history.location.pathname).toBe('/zero')
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
    const subscriber = vi.fn()
    history.subscribe(subscriber)

    // Simulate same index popstate (delta = 0)
    nativeHistory.state = { __TSR_index: 1, __TSR_key: '1' }
    location.hash = '#hash'
    await listeners.popstate?.()

    // Must not call go(0) or publish the blocked same-index location
    expect(go).not.toHaveBeenCalled()
    expect(subscriber).not.toHaveBeenCalled()
    expect(history.location.hash).toBe('#hash')

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
