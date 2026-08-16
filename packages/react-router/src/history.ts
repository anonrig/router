import type { HistoryLocation } from '@anonrig/history'

export {
  createHistory,
  createBrowserHistory,
  createHashHistory,
  createMemoryHistory,
  parseHref,
} from '@anonrig/history'

export type {
  BlockerFn,
  HistoryLocation,
  RouterHistory,
  ParsedPath,
  HistoryState,
} from '@anonrig/history'

declare module '@anonrig/history' {
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
