/**
 * Emit published JS + .d.ts for each public package.
 * Workspace tests keep resolving TypeScript via aliases.
 */
import { readdir, rm } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { build } from 'vite'
import { scriptStringPlugin } from './vite-bundle.ts'

const repo = join(import.meta.dirname, '..')

const packages = [
  {
    dir: 'packages/history',
    src: 'packages/history/src',
    entries: ['index.ts'],
  },
  {
    dir: 'packages/router-core',
    src: 'packages/router-core/src',
    entries: [
      'index.ts',
      'is-server.ts',
      'new-process-route-tree.ts',
      'utils.ts',
      'ssr/server.ts',
      'ssr/register-load-server.ts',
      'ssr/client.ts',
      'ssr/ssr-match-id.ts',
      'ssr/serializer/transformer-types.ts',
      'scroll-restoration-script/client.ts',
      'scroll-restoration-script/server.ts',
    ],
  },
  {
    dir: 'packages/react-router',
    src: 'packages/react-router/src',
    entries: [
      'index.ts',
      'index.rsc.ts',
      'client-only.tsx',
      'scripts.tsx',
      'ssr/server.ts',
      'ssr/client.ts',
      'ssr/router-client.tsx',
      'ssr/render-router-to-stream.tsx',
    ],
  },
  {
    dir: 'packages/router-plugin',
    src: 'packages/router-plugin/src',
    entries: ['index.ts', 'vite.ts'],
  },
] as const

function isExternal(id: string) {
  if (id.includes('?script-string')) return false
  if (id.startsWith('.') || id.startsWith('/') || id.startsWith('\0')) return false
  if (id.startsWith(repo)) return false
  return true
}

async function emitJs(pkg: (typeof packages)[number]) {
  const srcDir = join(repo, pkg.src)
  const outDir = join(repo, pkg.dir, 'dist')
  await rm(outDir, { recursive: true, force: true })
  await build({
    configFile: false,
    envDir: false,
    root: repo,
    logLevel: 'warn',
    plugins: [scriptStringPlugin()],
    define: {},
    build: {
      outDir,
      emptyOutDir: true,
      write: true,
      minify: false,
      sourcemap: false,
      cssCodeSplit: false,
      lib: {
        entry: pkg.entries.map((file) => join(srcDir, file)),
        formats: ['es'],
      },
      rolldownOptions: {
        treeshake: false,
        external: isExternal,
        output: {
          format: 'es',
          preserveModules: true,
          preserveModulesRoot: srcDir,
          entryFileNames: '[name].js',
          chunkFileNames: '[name].js',
        },
      },
    },
  })
}

function emitDts(pkg: (typeof packages)[number]) {
  const result = spawnSync(
    process.execPath,
    [
      join(repo, 'node_modules/typescript/bin/tsc'),
      '-p',
      join(repo, pkg.dir, 'tsconfig.build.json'),
      '--pretty',
      'false',
      '--noCheck',
    ],
    { cwd: repo, encoding: 'utf8' },
  )
  if (result.status !== 0) {
    throw new Error(`tsc failed for ${pkg.dir}\n${result.stdout}${result.stderr}`)
  }
}

async function listFiles(dir: string): Promise<Array<string>> {
  const out: Array<string> = []
  async function walk(current: string) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const next = join(current, entry.name)
      if (entry.isDirectory()) await walk(next)
      else out.push(relative(dir, next))
    }
  }
  await walk(dir)
  return out.sort()
}

async function main() {
  const only = process.argv.includes('--package')
    ? process.argv[process.argv.indexOf('--package') + 1]
    : undefined
  const selected = only
    ? packages.filter((pkg) => pkg.dir === `packages/${only}` || pkg.dir.endsWith(`/${only}`))
    : [...packages]
  if (only && selected.length === 0) {
    throw new Error(`unknown package: ${only}`)
  }

  for (const pkg of selected) {
    await emitJs(pkg)
    emitDts(pkg)
    const files = await listFiles(join(repo, pkg.dir, 'dist'))
    const ts = files.filter((file) => file.endsWith('.ts') && !file.endsWith('.d.ts'))
    if (ts.length > 0) {
      throw new Error(`${pkg.dir} dist still contains TypeScript:\n${ts.join('\n')}`)
    }
    const manifest = JSON.parse(readFileSync(join(repo, pkg.dir, 'package.json'), 'utf8')) as {
      files?: Array<string>
      main?: string
      types?: string
    }
    if (!manifest.files?.includes('dist') || manifest.files.includes('src')) {
      throw new Error(`${pkg.dir} must publish dist, not src`)
    }
    if (!manifest.main?.startsWith('./dist/') || !manifest.types?.startsWith('./dist/')) {
      throw new Error(`${pkg.dir} main/types must point at dist`)
    }
    console.log(`${pkg.dir}: ${files.length} files`)
  }
}

await main()
