import { describe, expect, test, vi } from 'vitest'
import { createBrowserHistory } from '../src/browser'

function makeWindow() {
  const location = { pathname: '/', search: '', hash: '' }
  let state: any = { __TSR_index: 0, key: '0', __TSR_key: '0' }
  const win: any = {
    location,
    history: {
      get state() {
        return state
      },
      set state(v) {
        state = v
      },
      length: 1,
      pushState(s: any, _: string, url?: string) {
        state = s
        if (url) location.pathname = new URL(url, 'http://x').pathname
      },
      replaceState(s: any) {
        state = s
      },
      back() {},
      forward() {},
      go() {},
    },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }
  return { win }
}

describe('browser history destroy', () => {
  test('destroying one instance does not disconnect another on the same window', () => {
    const { win } = makeWindow()
    const first = createBrowserHistory({ window: win })
    const second = createBrowserHistory({ window: win })
    const sub = vi.fn()
    second.subscribe(sub)
    first.destroy()

    win.history.pushState({ __TSR_index: 1, key: 'x', __TSR_key: 'x' }, '', '/external')
    expect(second.location.pathname).toBe('/external')
    expect(sub).toHaveBeenCalled()
    second.destroy()
  })
})
