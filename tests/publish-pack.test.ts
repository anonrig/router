import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(import.meta.dirname, '..')
const packages = [
  'packages/history',
  'packages/router-core',
  'packages/react-router',
  'packages/router-generator',
] as const

describe('published package shape', () => {
  it('points npm at dist JS and types, not TypeScript source', async () => {
    for (const dir of packages) {
      const manifest = JSON.parse(await readFile(join(root, dir, 'package.json'), 'utf8')) as {
        files: Array<string>
        main: string
        types: string
        exports: Record<string, unknown>
      }
      expect(manifest.files).toEqual(['dist', 'LICENSE', 'README.md'])
      expect(manifest.main).toMatch(/^\.\/dist\/.+\.js$/)
      expect(manifest.types).toMatch(/^\.\/dist\/.+\.d\.ts$/)
      const exportsJson = JSON.stringify(manifest.exports)
      expect(exportsJson).not.toContain('./src/')
      expect(exportsJson.replaceAll('.d.ts"', '')).not.toContain('.ts"')
      expect(exportsJson).not.toContain('.tsx')
    }
  })

  it('history dist is importable after pnpm build', async () => {
    const entry = join(root, 'packages/history/dist/index.js')
    if (!existsSync(entry)) return
    const mod = await import(entry)
    expect(typeof mod.createMemoryHistory).toBe('function')
    const history = mod.createMemoryHistory({ initialEntries: ['/ok'] })
    expect(history.location.pathname).toBe('/ok')
  })
})
