import { describe, expect, test } from 'vitest'
import { createMemoryHistory } from '../src/memory'

describe('createMemoryHistory TanStack stack parity', () => {
  test('keeps the full stack so go(-2100) can return to the first entry', () => {
    const history = createMemoryHistory({ initialEntries: ['/0'] })
    for (let i = 1; i <= 2100; i++) {
      history.push(`/${i}`)
    }
    expect(history.length).toBe(2101)
    expect(history.location.pathname).toBe('/2100')
    history.go(-2100)
    expect(history.location.pathname).toBe('/0')
  })

  test('compact: true drops the oldest half at 2048 entries', () => {
    const history = createMemoryHistory({ initialEntries: ['/0'], compact: true })
    for (let i = 1; i <= 2100; i++) {
      history.push(`/${i}`)
    }
    expect(history.length).toBeLessThan(2101)
    history.go(-2100)
    expect(history.location.pathname).not.toBe('/0')
  })
})
