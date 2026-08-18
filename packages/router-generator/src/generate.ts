import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { emitRouteTreeRuntime, emitRouteTreeTypes } from './emit'
import { scanRoutes } from './scan'

export type GenerateRouteTreeOptions = {
  routesDirectory?: string
  generatedRouteTree?: string
  runtimeImport?: string
  rootImport?: string
  slotImport?: string
  routeFileIgnorePattern?: string | RegExp
}

export type GeneratedRouteTree = {
  routesDirectory: string
  runtimePath: string
  typesPath: string
  runtime: string
  types: string
  routeCount: number
}

function typesPathFor(runtimePath: string) {
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

export function generateRouteTree(options: GenerateRouteTreeOptions): GeneratedRouteTree {
  const routesDirectory = resolve(options.routesDirectory ?? './src/routes')
  const runtimePath = resolve(options.generatedRouteTree ?? './src/routeTree.gen.ts')
  const typesPath = typesPathFor(runtimePath)
  const routes = scanRoutes({
    routesDirectory,
    routeFileIgnorePattern: options.routeFileIgnorePattern,
  })
  const payload = {
    routes,
    generatedRouteTree: runtimePath,
    routesDirectory,
    runtimeImport: options.runtimeImport,
    rootImport: options.rootImport,
    slotImport: options.slotImport,
  }
  const runtime = emitRouteTreeRuntime(payload)
  const types = emitRouteTreeTypes(payload)
  const ensuredDirs = new Set<string>()
  writeIfChanged(runtimePath, runtime, ensuredDirs)
  writeIfChanged(typesPath, types, ensuredDirs)
  return {
    routesDirectory,
    runtimePath,
    typesPath,
    runtime,
    types,
    routeCount: routes.length,
  }
}
