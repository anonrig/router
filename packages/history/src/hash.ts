import { createBrowserHistory } from './browser'
import { parseHref } from './parse'
import type { RouterHistory } from './types'

export const createHashHistory = /*#__PURE__*/ function createHashHistory(opts?: {
  window?: any
}): RouterHistory {
  const win = opts?.window ?? (typeof document !== 'undefined' ? window : (undefined as any))
  return createBrowserHistory({
    window: win,
    parseLocation: () => {
      const hashSplit = win.location.hash.split('#').slice(1)
      const pathPart = hashSplit[0] ?? '/'
      const searchPart = win.location.search
      const hashEntries = hashSplit.slice(1)
      const hashPart = hashEntries.length === 0 ? '' : `#${hashEntries.join('#')}`
      return parseHref(`${pathPart}${searchPart}${hashPart}`, win.history.state)
    },
    createHref: (href) => `${win.location.pathname}${win.location.search}#${href}`,
  })
}
