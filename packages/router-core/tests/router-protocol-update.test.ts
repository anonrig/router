import { describe, expect, test } from 'vitest'
import { createMemoryHistory } from 'speedy-router-history'
import { createRootRoute } from '../src/route'
import { createRouter } from '../src/router'

describe('router protocol allowlist updates', () => {
  test('restores the default allowlist when a custom option is removed', () => {
    const customProtocol = ['java', 'script:'].join('')
    const router = createRouter({
      routeTree: createRootRoute(),
      history: createMemoryHistory({ initialEntries: ['/'] }),
      protocolAllowlist: [customProtocol],
    })
    expect((router as any).protocolAllowlist.has(customProtocol)).toBe(true)

    router.update({ protocolAllowlist: undefined })

    expect((router as any).protocolAllowlist.has(customProtocol)).toBe(false)
  })
})
