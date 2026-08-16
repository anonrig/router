import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import {
  RawStream,
  createNonReactiveMutableStore,
  createNonReactiveReadonlyStore,
  createRawStreamDeserializePlugin,
  createRawStreamRPCPlugin,
  defaultSerializeError,
  defaultSerovalPlugins,
  getInitialRouterState,
  makeSerovalPlugin,
  makeSsrSerovalPlugin,
} from 'fast-router-core'
import { isServer } from 'fast-router-core/isServer'
import { getScrollRestorationScriptForRouter } from 'fast-router-core/scroll-restoration-script'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const require = createRequire(import.meta.url)

describe('TanStack public export surface', () => {
  test('defaultSerializeError matches TanStack serializable error shape', () => {
    const error = new Error('boom')
    error.name = 'TestError'
    expect(defaultSerializeError(error)).toEqual({
      name: 'TestError',
      message: 'boom',
    })
    expect(defaultSerializeError(42)).toEqual({ data: 42 })
  })

  test('getInitialRouterState builds an idle router state', () => {
    const location = {
      href: '/',
      pathname: '/',
      search: {},
      searchStr: '',
      state: { __TSR_index: 0 },
      hash: '',
    }
    expect(getInitialRouterState(location)).toMatchObject({
      isLoading: false,
      isTransitioning: false,
      status: 'idle',
      resolvedLocation: undefined,
      location,
      matches: [],
      statusCode: 200,
    })
  })

  test('non-reactive store factories are public', () => {
    const mutable = createNonReactiveMutableStore(1)
    mutable.set((value) => value + 1)
    expect(mutable.get()).toBe(2)

    const readonly = createNonReactiveReadonlyStore(() => mutable.get() * 2)
    expect(readonly.get()).toBe(4)
  })

  test('seroval and RawStream helpers are public', () => {
    expect(typeof makeSerovalPlugin).toBe('function')
    expect(typeof makeSsrSerovalPlugin).toBe('function')
    expect(Array.isArray(defaultSerovalPlugins)).toBe(true)
    expect(typeof createRawStreamRPCPlugin).toBe('function')
    expect(typeof createRawStreamDeserializePlugin).toBe('function')
    expect(new RawStream(new ReadableStream())).toBeInstanceOf(RawStream)
  })

  test('isServer and scroll-restoration-script package paths resolve', () => {
    expect(isServer === true || isServer === undefined).toBe(true)
    expect(typeof getScrollRestorationScriptForRouter).toBe('function')
  })

  test('package.json exports include TanStack drop-in paths', () => {
    const core = require(resolve(root, 'packages/router-core/package.json'))
    const react = require(resolve(root, 'packages/react-router/package.json'))

    expect(core.exports['./isServer']).toBe('./src/is-server.ts')
    expect(core.exports['./scroll-restoration-script']).toEqual({
      browser: './src/scroll-restoration-script/client.ts',
      default: './src/scroll-restoration-script/server.ts',
    })
    expect(react.exports['.']['react-server']).toBe('./src/index.rsc.ts')
  })
})
