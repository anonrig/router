import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { emitRouteTree } from './emit'
import { scanRoutes } from './scan'

export type GenerateRouteTreeOptions = {
  routesDirectory?: string
  generatedRouteTree?: string
  runtimeImport?: string
  rootImport?: string
  slotImport?: string
  routeFileIgnorePattern?: string | RegExp
  quoteStyle?: 'single' | 'double'
  semicolons?: boolean
}

export type GeneratedRouteTree = {
  routesDirectory: string
  runtimePath: string
  generated: string
  routeCount: number
}

function staleTypesPathFor(runtimePath: string) {
  return runtimePath
    .replace(/\.gen\.(ts|js|tsx|jsx)$/, '.types.ts')
    .replace(/routeTree\.ts$/, 'routeTree.types.ts')
}

function writeIfChanged(filePath: string, contents: string, ensuredDirs: Set<string>) {
  try {
    if (readFileSync(filePath, 'utf8') === contents) return
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    const dir = dirname(filePath)
    if (!ensuredDirs.has(dir)) {
      mkdirSync(dir, { recursive: true })
      ensuredDirs.add(dir)
    }
  }
  writeFileSync(filePath, contents)
}

function removeIfExists(filePath: string) {
  try {
    unlinkSync(filePath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}

export function generateRouteTree(options: GenerateRouteTreeOptions): GeneratedRouteTree {
  const routesDirectory = resolve(options.routesDirectory ?? './src/routes')
  const runtimePath = resolve(options.generatedRouteTree ?? './src/routeTree.gen.ts')
  const routes = scanRoutes({
    routesDirectory,
    routeFileIgnorePattern: options.routeFileIgnorePattern,
  })
  const generated = emitRouteTree({
    routes,
    generatedRouteTree: runtimePath,
    routesDirectory,
    runtimeImport: options.runtimeImport,
    rootImport: options.rootImport,
    slotImport: options.slotImport,
    quoteStyle: options.quoteStyle,
    semicolons: options.semicolons,
  })
  const ensuredDirs = new Set<string>()
  writeIfChanged(runtimePath, generated, ensuredDirs)
  // Older versions of this package wrote a sibling types file.
  removeIfExists(staleTypesPathFor(runtimePath))
  return {
    routesDirectory,
    runtimePath,
    generated,
    routeCount: routes.length,
  }
}
