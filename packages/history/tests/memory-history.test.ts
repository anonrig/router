import { describe, expect, test } from 'vitest'
import { createMemoryHistory } from '../src/memory'

describe('createMemoryHistory TanStack stack parity', () => {
  test('ignores an async blocked push superseded by a newer navigation', async () => {
    const history = createMemoryHistory({ initialEntries: ['/'] })
    let release!: (blocked: boolean) => void
    history.block({
      blockerFn: () =>
        new Promise<boolean>((resolve) => {
          release = resolve
        }),
    })

    const stale = Promise.resolve(history.push('/stale'))
    history.push('/current', undefined, { ignoreBlocker: true })
    release(false)
    await stale

    expect(history.location.pathname).toBe('/current')
    history.back()
    expect(history.location.pathname).toBe('/')
  })

  test('blockers receive the index of the proposed location', () => {
    const history = createMemoryHistory({
      initialEntries: ['/first', '/second', '/third'],
      initialIndex: 2,
    })
    const indexes: number[] = []
    history.block({
      blockerFn: ({ nextLocation }) => {
        indexes.push(nextLocation.state.__TSR_index)
        return true
      },
    })

    history.push('/fourth')
    history.replace('/replacement')

    expect(indexes).toEqual([3, 2])
  })

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
