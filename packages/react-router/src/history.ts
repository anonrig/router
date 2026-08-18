import type { HistoryLocation } from 'speedy-router-history'

export {
  createHistory,
  createBrowserHistory,
  createHashHistory,
  createMemoryHistory,
  parseHref,
} from 'speedy-router-history'

export type {
  BlockerFn,
  HistoryLocation,
  RouterHistory,
  ParsedPath,
  HistoryState,
} from 'speedy-router-history'

declare module 'speedy-router-history' {
  interface HistoryState {
    __tempLocation?: HistoryLocation
    __tempKey?: string
    __hashScrollIntoViewOptions?: boolean | ScrollIntoViewOptions
  }
}

declare module '@tanstack/history' {
  interface HistoryState {
    __tempLocation?: HistoryLocation
    __tempKey?: string
    __hashScrollIntoViewOptions?: boolean | ScrollIntoViewOptions
  }
}
