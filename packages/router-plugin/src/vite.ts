import { basename, relative, resolve, sep } from 'node:path'
import { generateRouteTree, type GenerateRouteTreeOptions } from './generate'
import { fileNameFromModuleId, splitTargetFromModuleId } from './module-id'
import { isRouteFile, matchesRouteFileIgnorePattern, toPosix } from './scan'
import type { Plugin, PluginOption, ResolvedConfig } from 'vite'

export type TanStackRouterPluginOptions = GenerateRouteTreeOptions & {
  /** Accepted for `@tanstack/router-plugin/vite` drop-in compatibility. */
  target?: string
  autoCodeSplitting?: boolean
  enableRouteGeneration?: boolean
}

function isInsideDirectory(file: string, directory: string) {
  const resolved = resolve(file)
  return resolved === directory || resolved.startsWith(directory + sep)
}

function isRootRouteFile(fileName: string) {
  return basename(fileName).startsWith('__root.')
}

/**
 * Drop-in for `@tanstack/router-plugin/vite`.
 * Emits the same `routeTree.gen.ts` shape: eager `Route` imports, `.update()`,
 * and `declare module '@tanstack/react-router'`.
 * When `autoCodeSplitting` is on, route UI properties become
 * `lazyRouteComponent` imports so page components stay out of the client
 * entry graph. During SSR, `ssr: false` split modules are stubbed; other
 * routes compile the virtual module so body markup still renders.
 */
export function tanstackRouter(options: TanStackRouterPluginOptions = {}): PluginOption {
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
      routeFileIgnorePattern: options.routeFileIgnorePattern,
      quoteStyle: options.quoteStyle,
      semicolons: options.semicolons,
    }
  }

  function isWatchedRouteFile(file: string) {
    if (!routesDirectory || !isInsideDirectory(file, routesDirectory)) return false
    if (!isRouteFile(basename(file))) return false
    return !matchesRouteFileIgnorePattern(
      toPosix(relative(routesDirectory, file)),
      options.routeFileIgnorePattern,
    )
  }

  const run = () => {
    const result = generateRouteTree(resolved ?? options)
    generated = result.runtimePath
    routesDirectory = result.routesDirectory
    return result
  }

  // Generated output is derived from route file names, not contents.
  const onRouteTreeEvent = (file: string) => {
    if (!isWatchedRouteFile(file)) return
    run()
    return true
  }

  const generator: Plugin = {
    name: 'tanstack-router',
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

  if (!options.autoCodeSplitting) return generator

  const splitter: Plugin = {
    name: 'tanstack-router:code-splitter',
    enforce: 'pre',
    configResolved(config) {
      if (!routesDirectory) {
        routesDirectory = resolve(config.root, options.routesDirectory ?? 'src/routes')
      }
    },
    async transform(code, id, options) {
      if (!isWatchedRouteFile(fileNameFromModuleId(id))) return null
      const fileName = fileNameFromModuleId(id)
      const splitTarget = splitTargetFromModuleId(id)
      const { compileReferenceRoute, compileVirtualRoute, routeHasDisabledSsr } =
        await import('./code-split')
      if (splitTarget) {
        // Stub only client-only UI (`ssr: false`) during SSR. SSR pages still
        // need the real virtual module so `lazyRouteComponent` can render.
        if (options?.ssr && routeHasDisabledSsr(code, fileName)) {
          return `export const ${splitTarget} = () => null\n`
        }
        return compileVirtualRoute(code, fileName, splitTarget)
      }
      if (isRootRouteFile(fileName)) return null
      return compileReferenceRoute(code, fileName)
    },
  }

  return [generator, splitter]
}
