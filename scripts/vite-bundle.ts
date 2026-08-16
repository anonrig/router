import { mkdir, readFile, readdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { build, type Plugin } from 'vite'

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
  await build({
    configFile: false,
    envFile: false,
    root: opts.root,
    logLevel: 'silent',
    plugins: opts.plugins,
    define: opts.define ?? {
      'process.env.NODE_ENV': '"production"',
    },
    resolve: {
      alias: opts.alias,
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
          inlineDynamicImports: false,
          entryFileNames: 'entry.js',
          chunkFileNames: '[name].js',
        },
      },
    },
  })

  const files = await readdir(opts.outDir)
  const chunks: Record<string, string> = {}
  for (const file of files) {
    if (!file.endsWith('.js')) continue
    chunks[file] = await readFile(resolve(opts.outDir, file), 'utf8')
  }

  const outputs: Array<ViteBundleChunk> = []
  for (const [fileName, code] of Object.entries(chunks)) {
    outputs.push({
      fileName,
      code,
      isEntry: fileName === 'entry.js',
      isDynamicEntry: fileName !== 'entry.js' && /load-server|loadServerRoute/.test(code),
      imports: [...code.matchAll(/from\s*["'](\.?\.?\/[^"']+)["']/g)].map((match) => match[1]!),
      dynamicImports: [...code.matchAll(/import\s*\(\s*["']([^"']+)["']\s*\)/g)].map(
        (match) => match[1]!,
      ),
    })
  }

  return {
    entry: chunks['entry.js'] ?? Object.values(chunks)[0] ?? '',
    chunks,
    outputs,
  }
}
