import { basename, relative, resolve, sep } from 'node:path'
import { generateRouteTree, type GenerateRouteTreeOptions } from './generate'
import { isRouteFile, matchesRouteFileIgnorePattern } from './scan'
import type { Plugin, ResolvedConfig } from 'vite'

export type TanStackRouterPluginOptions = GenerateRouteTreeOptions & {
  /** Accepted for `@tanstack/router-plugin/vite` drop-in compatibility. */
  target?: string
  autoCodeSplitting?: boolean
  enableRouteGeneration?: boolean
  quoteStyle?: 'single' | 'double'
  semicolons?: boolean
}

function toPosix(value: string) {
  return value.split(sep).join('/')
}

function isInsideDirectory(file: string, directory: string) {
  const resolved = resolve(file)
  return resolved === directory || resolved.startsWith(directory + sep)
}

/**
 * Drop-in for `@tanstack/router-plugin/vite`.
 * Emits `routeTree` with `createRoute` + `.lazy()` so unused route modules
 * stay out of the initial bundle. Same app API: `createRouter({ routeTree })`.
 */
export function tanstackRouter(options: TanStackRouterPluginOptions = {}): Plugin | undefined {
  if (options.enableRouteGeneration === false) {
    return
  }

  let resolved: GenerateRouteTreeOptions | undefined
  let routesDirectory = ''
  let generated = ''

  function resolveOptions(config: ResolvedConfig): GenerateRouteTreeOptions {
    return {
      routesDirectory: resolve(config.root, options.routesDirectory ?? 'src/routes'),
      generatedRouteTree: resolve(
        config.root,
        options.generatedRouteTree ?? 'src/routeTree.gen.ts',
      ),
      runtimeImport: options.runtimeImport,
      rootImport: options.rootImport,
      slotImport: options.slotImport,
      routeFileIgnorePattern: options.routeFileIgnorePattern,
    }
  }

  const run = () => {
    const result = generateRouteTree(resolved ?? options)
    generated = result.runtimePath
    routesDirectory = result.routesDirectory
    return result
  }

  const onRouteTreeEvent = (file: string) => {
    if (!isInsideDirectory(file, routesDirectory)) return
    // Generated output is derived from route file names, not contents.
    if (!isRouteFile(basename(file))) return
    if (
      matchesRouteFileIgnorePattern(
        toPosix(relative(routesDirectory, file)),
        options.routeFileIgnorePattern,
      )
    ) {
      return
    }
    run()
    return true
  }

  return {
    name: 'speedy-router-generator',
    configResolved(config) {
      resolved = resolveOptions(config)
      routesDirectory = resolved.routesDirectory ?? resolve(config.root, 'src/routes')
    },
    buildStart() {
      run()
      this.addWatchFile(routesDirectory)
    },
    configureServer(server) {
      const regen = (file: string) => {
        if (!onRouteTreeEvent(file)) return
        if (generated) {
          const module = server.moduleGraph.getModuleById(generated)
          if (module) void server.reloadModule(module)
        }
      }
      server.watcher.add(routesDirectory)
      // `change` cannot alter ids/parents; skip the rescan and writes.
      server.watcher.on('add', regen)
      server.watcher.on('unlink', regen)
    },
  }
}
