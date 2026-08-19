import { describe, expect, test, vi } from 'vitest'
import { createBrowserHistory } from '../src/browser'
import { createMemoryHistory } from '../src/memory'
import type { BlockerFnArgs, RouterHistory } from '../src/types'

function blockPushUntilReleased(history: RouterHistory, popResult: boolean | 'never' = 'never') {
  let release!: (isBlocked: boolean) => void
  history.block({
    blockerFn: ({ action }: BlockerFnArgs) => {
      if (action === 'PUSH' || action === 'REPLACE') {
        return new Promise<boolean>((resolve) => {
          release = resolve
        })
      }
      if (popResult === 'never') throw new Error('unexpected pop blocker call')
      return popResult
    },
  })
  return {
    release: (isBlocked: boolean) => release(isBlocked),
  }
}

function createBrowserHistoryHarness() {
  const location = { pathname: '/', search: '', hash: '' }
  const listeners: Record<string, (e?: any) => any> = {}
  const nativeHistory: any = {
    state: { __TSR_index: 0, __TSR_key: '0' },
    length: 1,
    pushState: vi.fn((state: any, _title: string, href?: string) => {
      nativeHistory.state = state
      if (href) location.pathname = new URL(href, 'http://localhost').pathname
    }),
    replaceState: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    go: vi.fn(),
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
  return { history, nativeHistory, location, listeners }
}

async function popTo(
  harness: ReturnType<typeof createBrowserHistoryHarness>,
  index: number,
  pathname: string,
) {
  harness.nativeHistory.state = { __TSR_index: index, __TSR_key: String(index) }
  harness.location.pathname = pathname
  await harness.listeners.popstate?.()
}

describe('memory history pops only retire a pending blocked push when they commit', () => {
  test('back() at the start of the stack keeps the pending push', async () => {
    const history = createMemoryHistory({ initialEntries: ['/'] })
    const blocker = blockPushUntilReleased(history)

    const pending = Promise.resolve(history.push('/pending'))
    history.back()
    blocker.release(false)
    await pending

    expect(history.location.pathname).toBe('/pending')
    expect(history.location.state.__TSR_index).toBe(1)
  })

  test('forward() at the end of the stack keeps the pending push', async () => {
    const history = createMemoryHistory({ initialEntries: ['/'] })
    const blocker = blockPushUntilReleased(history)

    const pending = Promise.resolve(history.push('/pending'))
    history.forward()
    blocker.release(false)
    await pending

    expect(history.location.pathname).toBe('/pending')
    expect(history.location.state.__TSR_index).toBe(1)
  })

  test('go() clamped to the current entry keeps the pending push', async () => {
    const history = createMemoryHistory({ initialEntries: ['/'] })
    const blocker = blockPushUntilReleased(history)

    const pending = Promise.resolve(history.push('/pending'))
    history.go(-3)
    blocker.release(false)
    await pending

    expect(history.location.pathname).toBe('/pending')
    expect(history.location.state.__TSR_index).toBe(1)
  })

  test('back() that moves drops a push released after it', async () => {
    const history = createMemoryHistory({ initialEntries: ['/first', '/second'] })
    const blocker = blockPushUntilReleased(history)

    const stale = Promise.resolve(history.push('/stale'))
    history.back()
    blocker.release(false)
    await stale

    expect(history.location.pathname).toBe('/first')
    expect(history.length).toBe(2)
  })

  test('a push released before a later back() still commits', async () => {
    const history = createMemoryHistory({ initialEntries: ['/first', '/second'] })
    const blocker = blockPushUntilReleased(history)

    const pending = Promise.resolve(history.push('/third'))
    blocker.release(false)
    await pending

    expect(history.location.pathname).toBe('/third')
    history.back()
    expect(history.location.pathname).toBe('/second')
  })
})

describe('browser history pops only retire a pending blocked push when they commit', () => {
  test('a native push drops an older blocked router push', async () => {
    const { history, nativeHistory } = createBrowserHistoryHarness()
    const blocker = blockPushUntilReleased(history)
    const stale = Promise.resolve(history.push('/router-pending'))

    nativeHistory.pushState({}, '', '/external')
    blocker.release(false)
    await stale

    expect(history.location.pathname).toBe('/external')
    expect(nativeHistory.state.__TSR_index).toBe(1)
    history.destroy()
  })

  test('a pop rejected by a blocker keeps a push released after it', async () => {
    const harness = createBrowserHistoryHarness()
    const { history } = harness
    await popTo(harness, 1, '/second')

    const blocker = blockPushUntilReleased(history, true)
    const pending = Promise.resolve(history.push('/pending'))

    history.back()
    await popTo(harness, 0, '/first')
    expect(history.location.pathname).toBe('/second')

    blocker.release(false)
    await pending

    expect(history.location.pathname).toBe('/pending')
    expect(history.location.state.__TSR_index).toBe(2)
    history.destroy()
  })

  test('a push released before a rejected pop keeps the pushed location', async () => {
    const harness = createBrowserHistoryHarness()
    const { history } = harness
    await popTo(harness, 1, '/second')

    const blocker = blockPushUntilReleased(history, true)
    const pending = Promise.resolve(history.push('/pending'))
    blocker.release(false)
    await pending

    expect(history.location.pathname).toBe('/pending')

    history.back()
    await popTo(harness, 1, '/second')

    expect(history.location.pathname).toBe('/pending')
    history.destroy()
  })

  test('a pop that commits drops a push released after it', async () => {
    const harness = createBrowserHistoryHarness()
    const { history } = harness
    await popTo(harness, 1, '/second')

    const blocker = blockPushUntilReleased(history, false)
    const stale = Promise.resolve(history.push('/stale'))

    history.back()
    await popTo(harness, 0, '/first')
    expect(history.location.pathname).toBe('/first')

    blocker.release(false)
    await stale

    expect(history.location.pathname).toBe('/first')
    history.destroy()
  })
})
