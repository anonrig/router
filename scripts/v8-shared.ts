/** Fixtures and helpers shared by the v8-* diagnostic scripts. */
import { createRootRoute, createRoute, encode } from 'speedy-router-core'

export const natives = (src: string) => new Function('fn', `return ${src}`) as (fn: Function) => any

/**
 * Node 24 / V8 bits:
 *   1 fn  2 never-opt  8 maybe-deopted  16 optimized
 *   32 maglev  64 turbofan  128 interpreted  32768 baseline
 */
export function describeStatus(status: number): string {
  const flags: string[] = []
  if (status & 1) flags.push('fn')
  if (status & 2) flags.push('never-opt')
  if (status & 4) flags.push('always-opt')
  if (status & 8) flags.push('maybe-deopted')
  if (status & 16) flags.push('optimized')
  if (status & 32) flags.push('maglev')
  if (status & 64) flags.push('turbofan')
  if (status & 128) flags.push('interpreted')
  if (status & 256) flags.push('marked-opt')
  if (status & 8192) flags.push('lite')
  if (status & 16384) flags.push('marked-deopt')
  if (status & 32768) flags.push('baseline')
  return flags.join(',') || String(status)
}

export const sample = { token: 'foo', page: 12, q: 'hello world', flag: true }
export const encoded = encode(sample)
export const ordinarySearch = {
  tab: 'specs',
  filter: 'available',
  category: 'hardware',
  sort: 'newest',
}

/** Width-8, depth-3 static route tree rooted at `/s{level}-{i}` segments. */
export function buildWideTree() {
  const root = createRootRoute()
  const make = (parent: any, level: number, prefix: string) => {
    if (level >= 3) return
    const children: any[] = []
    for (let i = 0; i < 8; i++) {
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
  return root
}

/** Small app tree: `/`, `/posts`, `/posts/$id` (with loader), `/about`. */
export function buildAppTree() {
  const appRoot = createRootRoute()
  const index = createRoute({ getParentRoute: () => appRoot, path: '/' })
  const posts = createRoute({ getParentRoute: () => appRoot, path: '/posts' })
  const post = createRoute({
    getParentRoute: () => appRoot,
    path: '/posts/$id',
    loader: () => ({ title: 'Post' }),
  })
  const about = createRoute({ getParentRoute: () => appRoot, path: '/about' })
  appRoot.addChildren([index, posts, post, about])
  return appRoot
}

export const appPaths = ['/', '/posts', '/posts/1', '/posts/2', '/about']
