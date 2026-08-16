import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'
import { build } from 'vite'

const repo = resolve(import.meta.dirname, '..')
const cache = join(repo, 'node_modules/.cache')
await mkdir(cache, { recursive: true })
const dir = await mkdtemp(join(cache, 'anonrig-analyze-'))
const entry = join(dir, 'entry.tsx')
await writeFile(
  entry,
  `export {
  Link,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from '@anonrig/react-router'
`,
)

const modules = []
try {
  const result = await build({
    configFile: false,
    envFile: false,
    root: repo,
    logLevel: 'silent',
    define: { 'process.env.NODE_ENV': '"production"' },
    resolve: {
      alias: [
        {
          find: /^@anonrig\/history$/,
          replacement: join(repo, 'packages/history/src/index.ts'),
        },
        {
          find: /^@anonrig\/router-core$/,
          replacement: join(repo, 'packages/router-core/src/index.ts'),
        },
        {
          find: /^@anonrig\/router-core\/is-server$/,
          replacement: join(repo, 'packages/router-core/src/is-server.ts'),
        },
        {
          find: /^@anonrig\/react-router$/,
          replacement: join(repo, 'packages/react-router/src/index.ts'),
        },
      ],
    },
    plugins: [
      {
        name: 'collect-modules',
        moduleParsed(info) {
          if (!info.id.includes('/packages/')) return
          modules.push({
            id: info.id.replace(repo + '/', ''),
            bytes: info.code?.length ?? 0,
          })
        },
      },
    ],
    build: {
      outDir: join(dir, 'out'),
      emptyOutDir: true,
      write: true,
      minify: true,
      lib: { entry, formats: ['es'], fileName: () => 'entry' },
      rolldownOptions: {
        treeshake: true,
        external: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
        output: {
          format: 'es',
          codeSplitting: true,
          entryFileNames: 'entry.js',
          chunkFileNames: '[name].js',
        },
      },
    },
  })

  const bundle = Array.isArray(result) ? result[0] : result
  let entryCode = ''
  const chunks = []
  for (const item of bundle.output) {
    if (item.type !== 'chunk') continue
    chunks.push({
      file: item.fileName,
      entry: item.isEntry,
      dynamic: item.isDynamicEntry,
      bytes: item.code.length,
      gzip: gzipSync(item.code, { level: 9 }).length,
      modules: Object.entries(item.modules ?? {}).map(([id, mod]) => ({
        id: id.replace(repo + '/', ''),
        bytes: mod.renderedLength ?? mod.code?.length ?? 0,
      })),
    })
    if (item.isEntry) entryCode = item.code
  }

  console.log('CHUNKS')
  for (const chunk of chunks) {
    console.log(
      `${chunk.file} entry=${chunk.entry} dynamic=${chunk.dynamic} min=${chunk.bytes} gzip=${chunk.gzip}`,
    )
    chunk.modules
      .sort((a, b) => b.bytes - a.bytes)
      .slice(0, 25)
      .forEach((mod) => console.log(`  ${String(mod.bytes).padStart(7)} ${mod.id}`))
  }

  console.log('\nPARSED PACKAGE MODULES')
  modules
    .sort((a, b) => b.bytes - a.bytes)
    .forEach((mod) => console.log(`${String(mod.bytes).padStart(7)} ${mod.id}`))

  const markers = [
    'segment-tree',
    'buildSegmentTree',
    'findCachedSegmentMatch',
    'RawStream',
    'makeSerovalPlugin',
    'defaultSerovalPlugins',
    'crossSerializeStream',
    'loadServerRoute',
    'createRequestHandler',
    'tsr-scroll-restoration',
    'useLinkProps',
    'LinkComponentRoute',
    'cookie-es',
    'seroval',
  ]
  console.log('\nENTRY MARKERS')
  for (const marker of markers) {
    console.log(`${entryCode.includes(marker) ? 'YES' : 'no '} ${marker}`)
  }
} finally {
  await rm(dir, { recursive: true, force: true })
}
