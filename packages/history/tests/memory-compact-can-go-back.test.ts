import { describe, expect, test } from 'vitest'
import { createMemoryHistory } from '../src/memory'

describe('memory history compact canGoBack', () => {
  test('canGoBack is false at the oldest remaining entry after compaction', () => {
    const history = createMemoryHistory({ initialEntries: ['/0'], compact: true })
    for (let i = 1; i <= 2100; i++) {
      history.push(`/${i}`)
    }

    expect(history.location.state.__TSR_index).toBe(history.length - 1)
    history.go(-10_000)

    expect(history.location.pathname).not.toBe('/0')
    expect(history.location.state.__TSR_index).toBe(0)
    expect(history.canGoBack()).toBe(false)
  })
})
