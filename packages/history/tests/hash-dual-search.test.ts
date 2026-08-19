import { describe, expect, test } from 'vitest'
import { createHashHistory } from '../src/hash'

function createHashWindow(pathWithHash: string) {
  const url = new URL(`http://example.com${pathWithHash}`)
  const location = {
    pathname: url.pathname,
    search: url.search,
    hash: url.hash,
  }
  return {
    location,
    history: {
      state: { __TSR_index: 0, key: '0', __TSR_key: '0' },
      length: 1,
      pushState() {},
      replaceState() {},
      back() {},
      forward() {},
      go() {},
    },
    addEventListener() {},
    removeEventListener() {},
  }
}

describe('hash history dual search', () => {
  test('prefers search embedded in the hash over window.location.search', () => {
    const win = createHashWindow('/?outer=1#/foo?inner=2')
    const history = createHashHistory({ window: win })

    expect(history.location.pathname).toBe('/foo')
    expect(history.location.search).toBe('?inner=2')
  })

  test('falls back to window.location.search when hash has no query', () => {
    const win = createHashWindow('/?outer=1#/foo')
    const history = createHashHistory({ window: win })

    expect(history.location.pathname).toBe('/foo')
    expect(history.location.search).toBe('?outer=1')
  })
})
