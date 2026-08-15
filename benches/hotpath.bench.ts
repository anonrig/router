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
  const children: any[] = []
  const make = (parent: any, level: number, prefix: string) => {
    if (level >= depth) return
    for (let i = 0; i < width; i++) {
      const route = createRoute({
        getParentRoute: () => parent,
        path: `/${prefix}${level}-${i}`,
      })
      make(route, level + 1, `${prefix}${level}-${i}-`)
      if (level === 0) children.push(route)
    }
  }
  make(root, 0, 's')
  root.addChildren(children)
  return processRouteTree(root as any)
}

const processed = buildLargeTree(8, 3)
const needle = '/s0-7/s0-7-1-7/s0-7-1-7-2-7'

describe('query string', () => {
  bench('anonrig encode', () => {
    oursEncode(sample)
  })
  bench('URLSearchParams encode', () => {
    tanstackStyleEncode(sample)
  })
  bench('anonrig decode', () => {
    oursDecode(encoded)
  })
  bench('URLSearchParams decode', () => {
    tanstackStyleDecode(encoded)
  })
})

describe('path', () => {
  bench('anonrig cleanPath', () => {
    cleanPath('/a//b///c/d//e')
  })
  bench('regex cleanPath', () => {
    regexCleanPath('/a//b///c/d//e')
  })
  bench('anonrig resolvePath', () => {
    resolvePath({ base: '/a/b/c', to: '../../d/e' })
  })
  bench('anonrig interpolatePath', () => {
    interpolatePath({ path: '/posts/$slug/comments/$id', params: { slug: 'x', id: '1' } })
  })
})

describe('match', () => {
  bench('anonrig findRouteMatch large tree', () => {
    findRouteMatch(processed, needle)
  })
})
