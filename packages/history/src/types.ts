export interface NavigateOptions {
  ignoreBlocker?: boolean
  /** When true, `path` is a pathname with no search, hash, or control characters. */
  simple?: boolean
}

export type HistoryAction = 'PUSH' | 'REPLACE' | 'FORWARD' | 'BACK' | 'GO'

export type SubscriberHistoryAction =
  | { type: Exclude<HistoryAction, 'GO'> }
  | { type: 'GO'; index: number }

export type SubscriberArgs = {
  location: HistoryLocation
  action: SubscriberHistoryAction
}

export interface RouterHistory {
  location: HistoryLocation
  length: number
  subscribers: Set<(opts: SubscriberArgs) => void>
  subscribe: (cb: (opts: SubscriberArgs) => void) => () => void
  push: (path: string, state?: any, navigateOpts?: NavigateOptions) => void
  replace: (path: string, state?: any, navigateOpts?: NavigateOptions) => void
  go: (index: number, navigateOpts?: NavigateOptions) => void
  back: (navigateOpts?: NavigateOptions) => void
  forward: (navigateOpts?: NavigateOptions) => void
  canGoBack: () => boolean
  createHref: (href: string) => string
  block: (blocker: NavigationBlocker) => () => void
  hasBlockers?: () => boolean
  flush: () => void
  destroy: () => void
  notify: (action: SubscriberHistoryAction) => void
  _ignoreSubscribers?: boolean
}

export interface HistoryLocation extends ParsedPath {
  state: ParsedHistoryState
}

export interface ParsedPath {
  href: string
  pathname: string
  search: string
  hash: string
}

export interface HistoryState {}

export type ParsedHistoryState = HistoryState & {
  key?: string
  __TSR_key?: string
  __TSR_index: number
}

export type BlockerFnArgs = {
  currentLocation: HistoryLocation
  nextLocation: HistoryLocation
  action: HistoryAction
}

export type BlockerFn = (args: BlockerFnArgs) => Promise<any> | any

export type NavigationBlocker = {
  blockerFn: BlockerFn
  enableBeforeUnload?: (() => boolean) | boolean
}
