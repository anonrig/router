import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scanRoutes } from '../src/scan'

describe('duplicate route keys', () => {
  it('throws when posts.tsx and posts/route.tsx collide on /posts', () => {
    const dir = mkdtempSync(join(tmpdir(), 'routes-'))
    writeFileSync(join(dir, '__root.tsx'), 'export const Route = {}')
    writeFileSync(join(dir, 'posts.tsx'), 'export const Route = {}')
    mkdirSync(join(dir, 'posts'))
    writeFileSync(join(dir, 'posts/route.tsx'), 'export const Route = {}')
    expect(() => scanRoutes({ routesDirectory: dir })).toThrow(/duplicate route key/i)
  })
})
