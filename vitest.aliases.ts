import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

const root = dirname(fileURLToPath(import.meta.url))

function kebabSegment(segment: string) {
  return segment.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}

function resolveUnder(baseDir: string, rest: string) {
  const kebabed = rest.split('/').map(kebabSegment).join('/')
  const candidates = [
    `${baseDir}/${kebabed}.ts`,
    `${baseDir}/${kebabed}.tsx`,
    `${baseDir}/${kebabed}.js`,
    `${baseDir}/${kebabed}/index.ts`,
    `${baseDir}/${kebabed}/index.tsx`,
    `${baseDir}/${rest}.ts`,
    `${baseDir}/${rest}.tsx`,
    `${baseDir}/${rest}/index.ts`,
    `${baseDir}/${rest}/index.tsx`,
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  return undefined
}

const specialSubpaths: Record<string, string> = {
  '@tanstack/router-core/new-process-route-tree': resolve(
    root,
    'packages/router-core/src/match.ts',
  ),
  '@tanstack/router-core/isServer': resolve(root, 'packages/router-core/src/is-server.ts'),
  '@tanstack/react-router/ssr/renderRouterToStream': resolve(
    root,
    'packages/react-router/src/ssr/render-router-to-stream.tsx',
  ),
  '@tanstack/react-router/ssr/RouterClient': resolve(
    root,
    'packages/react-router/src/ssr/router-client.tsx',
  ),
  '@tanstack/react-router/ClientOnly': resolve(root, 'packages/react-router/src/client-only.tsx'),
  '@tanstack/react-router/Scripts': resolve(root, 'packages/react-router/src/scripts.tsx'),
}

function stripQuery(id: string) {
  const index = id.indexOf('?')
  return index === -1
    ? { bare: id, query: '' }
    : { bare: id.slice(0, index), query: id.slice(index) }
}

function resolveTanstackId(id: string) {
  const special = specialSubpaths[id]
  if (special) return special

  if (id.startsWith('@tanstack/router-core/')) {
    return resolveUnder(
      resolve(root, 'packages/router-core/src'),
      id.slice('@tanstack/router-core/'.length),
    )
  }
  if (id.startsWith('@anonrig/router-core/')) {
    return resolveUnder(
      resolve(root, 'packages/router-core/src'),
      id.slice('@anonrig/router-core/'.length),
    )
  }
  if (id.startsWith('@tanstack/react-router/')) {
    return resolveUnder(
      resolve(root, 'packages/react-router/src'),
      id.slice('@tanstack/react-router/'.length),
    )
  }
  if (id.startsWith('@anonrig/react-router/')) {
    return resolveUnder(
      resolve(root, 'packages/react-router/src'),
      id.slice('@anonrig/react-router/'.length),
    )
  }
  return undefined
}

function resolveScriptStringRelative(id: string, importer?: string) {
  if (importer == null || importer === '' || !(id.startsWith('./') || id.startsWith('../'))) {
    return undefined
  }
  const resolved = resolve(dirname(stripQuery(importer).bare), id)
  for (const candidate of [resolved, `${resolved}.ts`, `${resolved}.tsx`, `${resolved}.js`]) {
    if (existsSync(candidate)) return candidate
  }
  return undefined
}

export function tanstackSubpathPlugin(): Plugin {
  return {
    name: 'tanstack-subpath-alias',
    enforce: 'pre',
    resolveId(id, importer) {
      const { bare, query } = stripQuery(id)
      const resolved = query.includes('script-string')
        ? (resolveTanstackId(bare) ?? resolveScriptStringRelative(bare, importer))
        : resolveTanstackId(bare)
      if (resolved == null) return undefined
      return query === '' ? resolved : `${resolved}${query}`
    },
    load(id) {
      if (!id.includes('?script-string')) return undefined
      const file = stripQuery(id).bare
      if (!existsSync(file)) return undefined
      const source = readFileSync(file, 'utf8')
        .replace(/^export default\s+/m, '')
        .trim()
      return `export default ${JSON.stringify(source)}`
    },
  }
}

export const tanstackAliases = [
  {
    find: '@tanstack/router-core/path',
    replacement: resolve(root, 'packages/router-core/src/path.ts'),
  },
  {
    find: '@tanstack/router-core/qss',
    replacement: resolve(root, 'packages/router-core/src/qss.ts'),
  },
  {
    find: '@tanstack/router-core/utils',
    replacement: resolve(root, 'packages/router-core/src/utils.ts'),
  },
  {
    find: '@tanstack/router-core/lru-cache',
    replacement: resolve(root, 'packages/router-core/src/lru-cache.ts'),
  },
  {
    find: '@tanstack/router-core/new-process-route-tree',
    replacement: resolve(root, 'packages/router-core/src/match.ts'),
  },
  {
    find: '@tanstack/router-core/isServer',
    replacement: resolve(root, 'packages/router-core/src/is-server.ts'),
  },
  {
    find: '@tanstack/router-core/ssr/server',
    replacement: resolve(root, 'packages/router-core/src/ssr/server.ts'),
  },
  {
    find: '@tanstack/router-core/ssr/client',
    replacement: resolve(root, 'packages/router-core/src/ssr/client.ts'),
  },
  {
    find: '@tanstack/router-core/ssr/ssr-match-id',
    replacement: resolve(root, 'packages/router-core/src/ssr/ssr-match-id.ts'),
  },
  {
    find: '@tanstack/react-router/ssr/renderRouterToStream',
    replacement: resolve(root, 'packages/react-router/src/ssr/render-router-to-stream.tsx'),
  },
  {
    find: '@tanstack/react-router/ssr/RouterClient',
    replacement: resolve(root, 'packages/react-router/src/ssr/router-client.tsx'),
  },
  {
    find: '@tanstack/react-router/ssr/server',
    replacement: resolve(root, 'packages/react-router/src/ssr/server.ts'),
  },
  {
    find: '@tanstack/react-router/ssr/client',
    replacement: resolve(root, 'packages/react-router/src/ssr/client.ts'),
  },
  {
    find: '@tanstack/react-router/ClientOnly',
    replacement: resolve(root, 'packages/react-router/src/client-only.tsx'),
  },
  {
    find: '@tanstack/react-router/Scripts',
    replacement: resolve(root, 'packages/react-router/src/scripts.tsx'),
  },
  {
    find: '@anonrig/router-core/ssr/server',
    replacement: resolve(root, 'packages/router-core/src/ssr/server.ts'),
  },
  {
    find: '@anonrig/router-core/ssr/client',
    replacement: resolve(root, 'packages/router-core/src/ssr/client.ts'),
  },
  {
    find: '@anonrig/router-core/is-server',
    replacement: resolve(root, 'packages/router-core/src/is-server.ts'),
  },
  {
    find: '@anonrig/router-core/path',
    replacement: resolve(root, 'packages/router-core/src/path.ts'),
  },
  {
    find: '@anonrig/router-core/qss',
    replacement: resolve(root, 'packages/router-core/src/qss.ts'),
  },
  { find: /^@anonrig\/history$/, replacement: resolve(root, 'packages/history/src/index.ts') },
  {
    find: /^@anonrig\/router-core$/,
    replacement: resolve(root, 'packages/router-core/src/index.ts'),
  },
  {
    find: /^@anonrig\/react-router$/,
    replacement: resolve(root, 'packages/react-router/src/index.ts'),
  },
  { find: /^@tanstack\/history$/, replacement: resolve(root, 'packages/history/src/index.ts') },
  {
    find: /^@tanstack\/router-core$/,
    replacement: resolve(root, 'packages/router-core/src/index.ts'),
  },
  {
    find: /^@tanstack\/react-router$/,
    replacement: resolve(root, 'packages/react-router/src/index.ts'),
  },
  {
    find: /^@tanstack\/react-store$/,
    replacement: resolve(root, 'packages/react-router/src/react-store.ts'),
  },
]
