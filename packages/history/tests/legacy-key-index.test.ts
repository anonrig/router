import { describe, expect, test, vi } from 'vitest'
import { createBrowserHistory } from '../src/browser'

function harness(state: any) {
  const location = { pathname: '/', search: '', hash: '' }
  const nativeHistory = {
    state,
    length: 1,
    pushState(next: any) {
      nativeHistory.state = next
    },
    replaceState(next: any) {
      nativeHistory.state = next
    },
    back: vi.fn(),
    forward: vi.fn(),
    go: vi.fn(),
  }
  const win = {
    location,
    history: nativeHistory,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }
  return { history: createBrowserHistory({ window: win as any }), nativeHistory }
}

describe('browser history legacy key without __TSR_index', () => {
  test('seeds __TSR_index when only a legacy key exists', async () => {
    const { history, nativeHistory } = harness({ key: 'legacy' })
    expect(history.canGoBack()).toBe(false)
    expect(nativeHistory.state.__TSR_index).toBe(0)

    history.push('/a')
    await Promise.resolve()
    history.flush()

    expect(Number.isFinite(nativeHistory.state.__TSR_index)).toBe(true)
    expect(nativeHistory.state.__TSR_index).toBe(1)
    history.destroy()
  })

  test('preserves preexisting user state while seeding index and key', () => {
    const { history, nativeHistory } = harness({ userId: 42, scroll: 100 })
    expect((nativeHistory.state as any).userId).toBe(42)
    expect((nativeHistory.state as any).scroll).toBe(100)
    expect(nativeHistory.state.__TSR_index).toBe(0)
    expect(nativeHistory.state.__TSR_key || nativeHistory.state.key).toBeTruthy()
    expect(history.canGoBack()).toBe(false)
    history.destroy()
  })
})
