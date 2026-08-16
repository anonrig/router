import { resolve } from 'node:path'
import { generateRouteTree, type GenerateRouteTreeOptions } from './generate'
import type { Plugin } from 'vite'

export type TanStackRouterPluginOptions = GenerateRouteTreeOptions

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

  return {
    name: '@anonrig/router-generator',
    buildStart() {
      run()
      this.addWatchFile(routesDirectory)
    },
    configureServer(server) {
      const regen = () => {
        run()
        if (generated) {
          const module = server.moduleGraph.getModuleById(generated)
          if (module) void server.reloadModule(module)
        }
      }
      server.watcher.add(routesDirectory)
      server.watcher.on('add', regen)
      server.watcher.on('change', regen)
      server.watcher.on('unlink', regen)
    },
  }
}
