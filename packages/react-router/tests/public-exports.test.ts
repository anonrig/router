import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { isNotFound, isRedirect, notFound, redirect, rootRouteId } from '../src/index.rsc'
import type { HistoryState } from '../src/history'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const require = createRequire(import.meta.url)

describe('TanStack react-router public surface', () => {
  test('RSC entry re-exports the TanStack react-server names', () => {
    expect(rootRouteId).toBe('__root__')
    expect(isNotFound(notFound())).toBe(true)
    expect(isRedirect(redirect({ to: '/' }))).toBe(true)
  })

  test('HistoryState accepts TanStack temp-location fields', () => {
    const state: HistoryState = {
      __tempKey: 'temp',
      __hashScrollIntoViewOptions: true,
    }
    expect(state.__tempKey).toBe('temp')
    expect(state.__hashScrollIntoViewOptions).toBe(true)
  })

  test('package.json exposes the react-server condition', () => {
    const react = require(resolve(root, 'packages/react-router/package.json'))
    expect(react.exports['.']['react-server']).toBe('./src/index.rsc.ts')
  })
})
