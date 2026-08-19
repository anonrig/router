import { loadServerRoute } from '../load-server'
import { setLoadServerRoute } from '../router'

/** Published builds compile `import.meta.env.SSR` to false. The SSR graph must install the server loader itself. */
export function registerLoadServerRoute() {
  setLoadServerRoute(loadServerRoute)
}

registerLoadServerRoute()
