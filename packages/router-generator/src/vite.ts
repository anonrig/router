import { basename, relative, resolve, sep } from 'node:path'
import { generateRouteTree, type GenerateRouteTreeOptions } from './generate'
import { fileNameFromModuleId, splitTargetFromModuleId } from './module-id'
import { isRouteFile, matchesRouteFileIgnorePattern } from './scan'
import type { Plugin, PluginOption, ResolvedConfig } from 'vite'

export type TanStackRouterPluginOptions = GenerateRouteTreeOptions & {
  /** Accepted for `@tanstack/router-plugin/vite` drop-in compatibility. */
  target?: string
  autoCodeSplitting?: boolean
  enableRouteGeneration?: boolean
}

function toPosix(value: string) {
  return value.split(sep).join('/')
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
 * When `autoCodeSplitting` is on, `ssr: false` route UI properties become
 * `lazyRouteComponent` imports so those components stay out of the SSR graph.
 * The virtual `?tsr-split=` module is stubbed during `ssr` transforms.
 * SSR pages keep eager components so `Route.useLoaderData()` and body markup
 * still render on the server.
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
      slotImport: options.slotImport,
      routeFileIgnorePattern: options.routeFileIgnorePattern,
      quoteStyle: options.quoteStyle,
      semicolons: options.semicolons,
    }
  }

  function isSplitableRoute(id: string) {
    const fileName = fileNameFromModuleId(id)
    if (!routesDirectory || !isInsideDirectory(fileName, routesDirectory)) return false
    if (!isRouteFile(basename(fileName))) return false
    return !matchesRouteFileIgnorePattern(
      toPosix(relative(routesDirectory, fileName)),
      options.routeFileIgnorePattern,
    )
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
      if (!isSplitableRoute(id)) return null
      const fileName = fileNameFromModuleId(id)
      const splitTarget = splitTargetFromModuleId(id)
      const { compileReferenceRoute, compileVirtualRoute } = await import('./code-split')
      if (splitTarget) {
        // Stub split modules during SSR so the server graph does not evaluate
        // client-only UI that lives behind `ssr: false`.
        if (options?.ssr) {
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
