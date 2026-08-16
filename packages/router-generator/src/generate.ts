import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { emitRouteTreeRuntime, emitRouteTreeTypes } from './emit'
import { scanRoutes } from './scan'

export type GenerateRouteTreeOptions = {
  routesDirectory: string
  generatedRouteTree?: string
  runtimeImport?: string
  rootImport?: string
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

export function generateRouteTree(options: GenerateRouteTreeOptions): GeneratedRouteTree {
  const routesDirectory = resolve(options.routesDirectory)
  const runtimePath = resolve(options.generatedRouteTree ?? './src/routeTree.gen.ts')
  const typesPath = typesPathFor(runtimePath)
  const routes = scanRoutes({ routesDirectory })
  const payload = {
    routes,
    generatedRouteTree: runtimePath,
    routesDirectory,
    runtimeImport: options.runtimeImport,
    rootImport: options.rootImport,
  }
  const runtime = emitRouteTreeRuntime(payload)
  const types = emitRouteTreeTypes(payload)
  mkdirSync(dirname(runtimePath), { recursive: true })
  writeFileSync(runtimePath, runtime)
  writeFileSync(typesPath, types)
  return {
    routesDirectory,
    runtimePath,
    typesPath,
    runtime,
    types,
    routeCount: routes.length,
  }
}
