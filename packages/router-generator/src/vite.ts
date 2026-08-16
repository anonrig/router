import { basename, resolve, sep } from 'node:path'
import { generateRouteTree, type GenerateRouteTreeOptions } from './generate'
import { isRouteFile } from './scan'
import type { Plugin } from 'vite'

export type TanStackRouterPluginOptions = GenerateRouteTreeOptions

function isInsideDirectory(file: string, directory: string) {
  const resolved = resolve(file)
  return resolved === directory || resolved.startsWith(directory + sep)
}

/**
 * Drop-in for `@tanstack/router-plugin/vite`.
 * Emits `routeTree` with `createRoute` + `.lazy()` so unused route modules
 * stay out of the initial bundle. Same app API: `createRouter({ routeTree })`.
 */
export function tanstackRouter(options: TanStackRouterPluginOptions): Plugin {
  const routesDirectory = resolve(options.routesDirectory)
  let generated = ''

  const run = () => {
    const result = generateRouteTree(options)
    generated = result.runtimePath
    return result
  }

  const onRouteTreeEvent = (file: string) => {
    if (!isInsideDirectory(file, routesDirectory)) return
    // Generated output is derived from route file names, not contents.
    if (!isRouteFile(basename(file))) return
    run()
    return true
  }

  return {
    name: 'fast-router-generator',
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
