import { mkdir, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { build, type Plugin } from 'vite'

function exactAliases(alias?: Record<string, string>) {
  if (!alias) return undefined
  return Object.entries(alias).map(([find, replacement]) => ({
    find: new RegExp(`^${find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`),
    replacement,
  }))
}

export type ViteBundleChunk = {
  fileName: string
  code: string
  isEntry: boolean
  isDynamicEntry: boolean
  imports: Array<string>
  dynamicImports: Array<string>
}

export type ViteBundleResult = {
  entry: string
  chunks: Record<string, string>
  outputs: Array<ViteBundleChunk>
}

export function scriptStringPlugin(opts: { stub?: boolean } = {}): Plugin {
  return {
    name: 'script-string',
    enforce: 'pre',
    resolveId(id, importer) {
      if (!id.includes('?script-string')) return
      const bare = id.slice(0, id.indexOf('?'))
      if ((bare.startsWith('.') || bare.startsWith('/')) && importer) {
        return `${resolve(dirname(importer.split('?')[0]!), bare)}?script-string`
      }
      return id
    },
    async load(id) {
      if (!id.includes('?script-string')) return
      const file = id.slice(0, id.indexOf('?'))
      const contents = opts.stub ? '' : await readFile(file, 'utf8')
      return {
        code: `export default ${JSON.stringify(contents)}`,
        moduleType: 'js',
      }
    },
  }
}

export async function viteBundle(opts: {
  root: string
  entry: string
  outDir: string
  alias?: Record<string, string>
  external?: Array<string>
  minify?: boolean
  plugins?: Array<Plugin>
  define?: Record<string, string>
}): Promise<ViteBundleResult> {
  await mkdir(opts.outDir, { recursive: true })
  const result = await build({
    configFile: false,
    envFile: false,
    root: opts.root,
    logLevel: 'silent',
    plugins: opts.plugins,
    define: opts.define ?? {
      'process.env.NODE_ENV': '"production"',
    },
    resolve: {
      alias: exactAliases(opts.alias),
    },
    build: {
      outDir: opts.outDir,
      emptyOutDir: true,
      write: true,
      minify: opts.minify ?? false,
      cssCodeSplit: false,
      sourcemap: false,
      lib: {
        entry: opts.entry,
        formats: ['es'],
        fileName: () => 'entry',
      },
      rolldownOptions: {
        treeshake: true,
        external: opts.external,
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
  if (bundle == null || !('output' in bundle)) {
    throw new Error('vite.build() did not return a Rolldown bundle')
  }

  const chunks: Record<string, string> = {}
  const outputs: Array<ViteBundleChunk> = []
  for (const item of bundle.output) {
    if (item.type !== 'chunk') continue
    chunks[item.fileName] = item.code
    outputs.push({
      fileName: item.fileName,
      code: item.code,
      isEntry: item.isEntry,
      isDynamicEntry: item.isDynamicEntry,
      imports: item.imports,
      dynamicImports: item.dynamicImports,
    })
  }

  const entry = outputs.find((chunk) => chunk.isEntry)?.code ?? Object.values(chunks)[0] ?? ''
  return { entry, chunks, outputs }
}
