import { describe, expect, test } from 'vitest'
import { createMemoryHistory } from '../src/memory'

describe('memory history async push indexes', () => {
  test('overlapping allowed pushes get distinct increasing indexes', async () => {
    ;(globalThis as any).document = {}
    const history = createMemoryHistory({ initialEntries: ['/'] })
    let release1!: (v: boolean) => void
    let release2!: (v: boolean) => void
    let n = 0
    history.block({
      blockerFn: () => {
        n++
        if (n === 1) return new Promise<boolean>((r) => {
          release1 = r
        })
        return new Promise<boolean>((r) => {
          release2 = r
        })
      },
    })

    const p1 = history.push('/a')
    const p2 = history.push('/b')
    release1(false)
    release2(false)
    await Promise.all([p1, p2])

    expect(history.location.pathname).toBe('/b')
    expect(history.location.state.__TSR_index).toBe(2)
    history.back()
    expect(history.location.pathname).toBe('/a')
    expect(history.location.state.__TSR_index).toBe(1)
    delete (globalThis as any).document
  })
})
