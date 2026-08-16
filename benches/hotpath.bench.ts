import { bench, describe } from 'vitest'
import { decode as oursDecode, encode as oursEncode } from '../packages/router-core/src/qss'
import { cleanPath, interpolatePath, resolvePath } from '../packages/router-core/src/path'
import { findRouteMatch, processRouteTree } from '../packages/router-core/src/match'
import { createRootRoute, createRoute } from '../packages/router-core/src/route'

function tanstackStyleEncode(obj: Record<string, any>) {
  const result = new URLSearchParams()
  for (const key in obj) {
    const val = obj[key]
    if (val !== undefined) result.set(key, String(val))
  }
  return result.toString()
}

function tanstackStyleDecode(str: string) {
  const searchParams = new URLSearchParams(str)
  const result: Record<string, unknown> = Object.create(null)
  for (const [key, value] of searchParams.entries()) {
    result[key] = value
  }
  return result
}

function regexCleanPath(path: string) {
  return path.replace(/\/{2,}/g, '/')
}

const sample = { token: 'foo', page: 12, q: 'hello world', flag: true }
const encoded = oursEncode(sample)

function buildLargeTree(width: number, depth: number) {
  const root = createRootRoute()
  const make = (parent: any, level: number, prefix: string) => {
    if (level >= depth) return
    const children: any[] = []
    for (let i = 0; i < width; i++) {
      const route = createRoute({
        getParentRoute: () => parent,
        path: `/${prefix}${level}-${i}`,
      })
      make(route, level + 1, `${prefix}${level}-${i}-`)
      children.push(route)
    }
    parent.addChildren(children)
  }
  make(root, 0, 's')
  return processRouteTree(root as any)
}

const processed = buildLargeTree(8, 3)
const needle = '/s0-7/s0-7-1-7/s0-7-1-7-2-7'

describe('query string', () => {
  bench('fast-router encode', () => {
    oursEncode(sample)
  })
  bench('URLSearchParams encode', () => {
    tanstackStyleEncode(sample)
  })
  bench('fast-router decode', () => {
    oursDecode(encoded)
  })
  bench('URLSearchParams decode', () => {
    tanstackStyleDecode(encoded)
  })
})

describe('path', () => {
  bench('fast-router cleanPath', () => {
    cleanPath('/a//b///c/d//e')
  })
  bench('regex cleanPath', () => {
    regexCleanPath('/a//b///c/d//e')
  })
  bench('fast-router resolvePath', () => {
    resolvePath({ base: '/a/b/c', to: '../../d/e' })
  })
  bench('fast-router interpolatePath', () => {
    interpolatePath({ path: '/posts/$slug/comments/$id', params: { slug: 'x', id: '1' } })
  })
})

describe('match', () => {
  bench('fast-router findRouteMatch large tree', () => {
    findRouteMatch(processed, needle)
  })
  bench('fast-router findRouteMatch 1000 lookups', () => {
    for (let i = 0; i < 1000; i++) findRouteMatch(processed, needle)
  })
})
