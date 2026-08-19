import { beforeEach, describe, expect, test, vi } from 'vitest'
import { hydrate } from 'speedy-router-core/ssr/client'
import { RouterClient } from '../src/ssr/router-client'

vi.mock('speedy-router-core/ssr/client', () => ({
  hydrate: vi.fn(() => new Promise<void>(() => {})),
}))

describe('RouterClient hydration', () => {
  beforeEach(() => {
    vi.mocked(hydrate).mockClear()
  })

  test('hydrates each router instance independently', () => {
    const first = { id: 'first' } as any
    const second = { id: 'second' } as any

    RouterClient({ router: first })
    RouterClient({ router: second })

    expect(hydrate).toHaveBeenNthCalledWith(1, first)
    expect(hydrate).toHaveBeenNthCalledWith(2, second)
  })
})
