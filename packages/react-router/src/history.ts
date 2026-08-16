import type { HistoryLocation } from 'fast-router-history'

export {
  createHistory,
  createBrowserHistory,
  createHashHistory,
  createMemoryHistory,
  parseHref,
} from 'fast-router-history'

export type {
  BlockerFn,
  HistoryLocation,
  RouterHistory,
  ParsedPath,
  HistoryState,
} from 'fast-router-history'

declare module 'fast-router-history' {
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
