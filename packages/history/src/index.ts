export interface NavigateOptions {
  ignoreBlocker?: boolean
}

export type HistoryAction = 'PUSH' | 'REPLACE' | 'FORWARD' | 'BACK' | 'GO'

type SubscriberHistoryAction =
  | { type: Exclude<HistoryAction, 'GO'> }
  | { type: 'GO'; index: number }

type SubscriberArgs = {
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

const STATE_INDEX = '__TSR_index'
const POP_STATE = 'popstate'
const BEFORE_UNLOAD = 'beforeunload'

const PUSH_ACTION = { type: 'PUSH' } as const
const REPLACE_ACTION = { type: 'REPLACE' } as const
const BACK_ACTION = { type: 'BACK' } as const
const FORWARD_ACTION = { type: 'FORWARD' } as const

export const createHistory = /*#__PURE__*/ function createHistory(opts: {
  getLocation: () => HistoryLocation
  getLength: () => number
  pushState: (path: string, state: any) => void
  replaceState: (path: string, state: any) => void
  go: (n: number) => void
  back: (ignoreBlocker: boolean) => void
  forward: (ignoreBlocker: boolean) => void
  createHref: (path: string) => string
  flush?: () => void
  destroy?: () => void
  onBlocked?: () => void
  getBlockers?: () => Array<NavigationBlocker>
  setBlockers?: (blockers: Array<NavigationBlocker>) => void
  notifyOnIndexChange?: boolean
}): RouterHistory {
  let location = opts.getLocation()
  const subscribers = new Set<(opts: SubscriberArgs) => void>()
  const notifyOnIndexChange = opts.notifyOnIndexChange ?? true

  const notify = (action: SubscriberHistoryAction) => {
    location = opts.getLocation()
    if (subscribers.size === 0) return
    const args: SubscriberArgs = { location, action }
    for (const subscriber of subscribers) subscriber(args)
  }

  const handleIndexChange = (action: SubscriberHistoryAction) => {
    if (notifyOnIndexChange) notify(action)
    else location = opts.getLocation()
  }

  const shouldRunBlockers = (navigateOpts?: NavigateOptions) => {
    if (navigateOpts?.ignoreBlocker === true) return false
    if (typeof document === 'undefined') return false
    const blockers = opts.getBlockers?.()
    return blockers != null && blockers.length > 0
  }

  const runPushBlockers = (
    type: 'PUSH' | 'REPLACE',
    path: string,
    state: any,
    task: () => void,
  ) => {
    const blockers = opts.getBlockers!()
    const nextLocation = parseHref(path, state)
    const blockerArgs: BlockerFnArgs = {
      currentLocation: location,
      nextLocation,
      action: type,
    }

    const step = (start: number): void | Promise<void> => {
      for (let i = start; i < blockers.length; i++) {
        const result = blockers[i]!.blockerFn(blockerArgs)
        if (result != null && typeof (result as Promise<unknown>).then === 'function') {
          return (result as Promise<unknown>).then((isBlocked) => {
            if (isBlocked) {
              opts.onBlocked?.()
              return
            }
            return step(i + 1)
          })
        }
        if (result) {
          opts.onBlocked?.()
          return
        }
      }
      task()
    }
    return step(0)
  }

  return {
    get location() {
      return location
    },
    get length() {
      return opts.getLength()
    },
    subscribers,
    subscribe: (cb) => {
      subscribers.add(cb)
      return () => {
        subscribers.delete(cb)
      }
    },
    push: (path, state, navigateOpts) => {
      const nextState = assignKeyAndIndex(location.state[STATE_INDEX] + 1, state)
      if (shouldRunBlockers(navigateOpts)) {
        return runPushBlockers('PUSH', path, nextState, () => {
          opts.pushState(path, nextState)
          notify(PUSH_ACTION)
        })
      }
      opts.pushState(path, nextState)
      notify(PUSH_ACTION)
    },
    replace: (path, state, navigateOpts) => {
      const nextState = assignKeyAndIndex(location.state[STATE_INDEX], state)
      if (shouldRunBlockers(navigateOpts)) {
        return runPushBlockers('REPLACE', path, nextState, () => {
          opts.replaceState(path, nextState)
          notify(REPLACE_ACTION)
        })
      }
      opts.replaceState(path, nextState)
      notify(REPLACE_ACTION)
    },
    go: (index) => {
      opts.go(index)
      handleIndexChange({ type: 'GO', index })
    },
    back: (navigateOpts) => {
      opts.back(navigateOpts?.ignoreBlocker === true)
      handleIndexChange(BACK_ACTION)
    },
    forward: (navigateOpts) => {
      opts.forward(navigateOpts?.ignoreBlocker === true)
      handleIndexChange(FORWARD_ACTION)
    },
    canGoBack: () => location.state[STATE_INDEX] !== 0,
    createHref: (str) => opts.createHref(str),
    block: (blocker) => {
      if (!opts.setBlockers) return () => {}
      const blockers = opts.getBlockers?.() ?? []
      opts.setBlockers([...blockers, blocker])
      return () => {
        const next = opts.getBlockers?.() ?? []
        opts.setBlockers?.(next.filter((b) => b !== blocker))
      }
    },
    flush: () => opts.flush?.(),
    destroy: () => opts.destroy?.(),
    notify,
  }
}

function assignKeyAndIndex(index: number, state: HistoryState | undefined) {
  const key = createRandomKey()
  if (state == null) {
    return { key, __TSR_key: key, __TSR_index: index }
  }
  return {
    ...state,
    key,
    __TSR_key: key,
    __TSR_index: index,
  } as ParsedHistoryState
}

export const createBrowserHistory = /*#__PURE__*/ function createBrowserHistory(opts?: {
  parseLocation?: () => HistoryLocation
  createHref?: (path: string) => string
  window?: any
}): RouterHistory {
  const win = opts?.window ?? (typeof document !== 'undefined' ? window : (undefined as any))

  const originalPushState = win.history.pushState
  const originalReplaceState = win.history.replaceState

  let blockers: Array<NavigationBlocker> = []
  const _getBlockers = () => blockers
  const _setBlockers = (next: Array<NavigationBlocker>) => {
    blockers = next
  }

  const createHref = opts?.createHref ?? ((path: string) => path)
  const parseLocation =
    opts?.parseLocation ??
    (() =>
      parseHref(
        `${win.location.pathname}${win.location.search}${win.location.hash}`,
        win.history.state,
      ))

  if (!win.history.state?.__TSR_key && !win.history.state?.key) {
    const addedKey = createRandomKey()
    win.history.replaceState(
      {
        [STATE_INDEX]: 0,
        key: addedKey,
        __TSR_key: addedKey,
      },
      '',
    )
  }

  let currentLocation = parseLocation()
  let rollbackLocation: HistoryLocation | undefined
  let nextPopIsGo = false
  let ignoreNextPop = false
  let skipBlockerNextPop = false
  let ignoreNextBeforeUnload = false

  const getLocation = () => currentLocation

  let next: undefined | [href: string, state: any, isPush: boolean]

  const flush = () => {
    if (!next) return
    history._ignoreSubscribers = true
    ;(next[2] ? win.history.pushState : win.history.replaceState)(next[1], '', next[0])
    history._ignoreSubscribers = false
    next = undefined
    rollbackLocation = undefined
  }

  const queueHistoryAction = (isPush: boolean, destHref: string, state: any) => {
    const href = createHref(destHref)
    const hasPendingAction = !!next
    if (!hasPendingAction) rollbackLocation = currentLocation
    currentLocation = parseHref(destHref, state)
    next = [href, state, next?.[2] || isPush]
    if (!hasPendingAction) queueMicrotask(() => flush())
  }

  const onPushPop = (type: 'PUSH' | 'REPLACE') => {
    currentLocation = parseLocation()
    history.notify({ type })
  }

  const onPushPopEvent = async () => {
    if (ignoreNextPop) {
      ignoreNextPop = false
      return
    }

    const nextLocation = parseLocation()
    const delta = nextLocation.state[STATE_INDEX] - currentLocation.state[STATE_INDEX]
    const isForward = delta === 1
    const isBack = delta === -1
    const isGo = (!isForward && !isBack) || nextPopIsGo
    nextPopIsGo = false

    const action = isGo ? 'GO' : isBack ? 'BACK' : 'FORWARD'
    const notify: SubscriberHistoryAction = isGo
      ? { type: 'GO', index: delta }
      : { type: isBack ? 'BACK' : 'FORWARD' }

    if (skipBlockerNextPop) {
      skipBlockerNextPop = false
    } else {
      const currentBlockers = _getBlockers()
      if (typeof document !== 'undefined' && currentBlockers.length) {
        for (const blocker of currentBlockers) {
          const isBlocked = await blocker.blockerFn({
            currentLocation,
            nextLocation,
            action,
          })
          if (isBlocked) {
            ignoreNextPop = true
            win.history.go(1)
            history.notify(notify)
            return
          }
        }
      }
    }

    currentLocation = parseLocation()
    history.notify(notify)
  }

  const onBeforeUnload = (e: BeforeUnloadEvent) => {
    if (ignoreNextBeforeUnload) {
      ignoreNextBeforeUnload = false
      return
    }

    let shouldBlock = false
    const currentBlockers = _getBlockers()
    if (typeof document !== 'undefined' && currentBlockers.length) {
      for (const blocker of currentBlockers) {
        const shouldHaveBeforeUnload = blocker.enableBeforeUnload ?? true
        if (shouldHaveBeforeUnload === true) {
          shouldBlock = true
          break
        }
        if (typeof shouldHaveBeforeUnload === 'function' && shouldHaveBeforeUnload() === true) {
          shouldBlock = true
          break
        }
      }
    }

    if (shouldBlock) {
      e.preventDefault()
      return (e.returnValue = '')
    }
  }

  const history = createHistory({
    getLocation,
    getLength: () => win.history.length,
    pushState: (href, state) => queueHistoryAction(true, href, state),
    replaceState: (href, state) => queueHistoryAction(false, href, state),
    back: (ignoreBlocker) => {
      if (ignoreBlocker) skipBlockerNextPop = true
      ignoreNextBeforeUnload = true
      return win.history.back()
    },
    forward: (ignoreBlocker) => {
      if (ignoreBlocker) skipBlockerNextPop = true
      ignoreNextBeforeUnload = true
      win.history.forward()
    },
    go: (n) => {
      nextPopIsGo = true
      win.history.go(n)
    },
    createHref: (href) => createHref(href),
    flush,
    destroy: () => {
      win.history.pushState = originalPushState
      win.history.replaceState = originalReplaceState
      win.removeEventListener(BEFORE_UNLOAD, onBeforeUnload, { capture: true })
      win.removeEventListener(POP_STATE, onPushPopEvent)
    },
    onBlocked: () => {
      if (rollbackLocation && currentLocation !== rollbackLocation) {
        currentLocation = rollbackLocation
      }
    },
    getBlockers: _getBlockers,
    setBlockers: _setBlockers,
    notifyOnIndexChange: false,
  })

  win.addEventListener(BEFORE_UNLOAD, onBeforeUnload, { capture: true })
  win.addEventListener(POP_STATE, onPushPopEvent)

  win.history.pushState = function (...args: Array<any>) {
    const res = originalPushState.apply(win.history, args as any)
    if (!history._ignoreSubscribers) onPushPop('PUSH')
    return res
  }

  win.history.replaceState = function (...args: Array<any>) {
    const res = originalReplaceState.apply(win.history, args as any)
    if (!history._ignoreSubscribers) onPushPop('REPLACE')
    return res
  }

  return history
}

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

export const createMemoryHistory = /*#__PURE__*/ function createMemoryHistory(
  opts: {
    initialEntries: Array<string>
    initialIndex?: number
  } = { initialEntries: ['/'] },
): RouterHistory {
  const entries = opts.initialEntries.slice()
  let index = opts.initialIndex
    ? Math.min(Math.max(opts.initialIndex, 0), entries.length - 1)
    : entries.length - 1
  const states = new Array<ParsedHistoryState>(entries.length)
  for (let i = 0; i < entries.length; i++) {
    states[i] = assignKeyAndIndex(i, undefined)
  }

  let current = parseHref(entries[index]!, states[index])
  const getLocation = () => current

  let blockers: Array<NavigationBlocker> = []

  return createHistory({
    getLocation,
    getLength: () => entries.length,
    pushState: (path, state) => {
      if (index < entries.length - 1) {
        entries.length = index + 1
        states.length = index + 1
      }
      states.push(state)
      entries.push(path)
      index = entries.length - 1
      current = parseHref(path, state)
    },
    replaceState: (path, state) => {
      states[index] = state
      entries[index] = path
      current = parseHref(path, state)
    },
    back: () => {
      if (index === 0) return
      index -= 1
      current = parseHref(entries[index]!, states[index])
    },
    forward: () => {
      if (index >= entries.length - 1) return
      index += 1
      current = parseHref(entries[index]!, states[index])
    },
    go: (n) => {
      const next = index + n
      index = next < 0 ? 0 : next >= entries.length ? entries.length - 1 : next
      current = parseHref(entries[index]!, states[index])
    },
    createHref: (path) => path,
    getBlockers: () => blockers,
    setBlockers: (next) => {
      blockers = next
    },
  })
}

let lastHref = ''
let lastSanitizedHref = ''
let lastPathname = ''
let lastSearch = ''
let lastHash = ''

export function parseHref(href: string, state: ParsedHistoryState | undefined): HistoryLocation {
  if (href === lastHref) {
    return {
      href: lastSanitizedHref,
      pathname: lastPathname,
      hash: lastHash,
      search: lastSearch,
      state: state ?? defaultHistoryState(),
    }
  }

  let sanitizedHref = href
  let hashIndex = -1
  let searchIndex = -1
  let dirty = false
  let lead = 0
  const len = href.length
  for (let i = 0; i < len; i++) {
    const code = href.charCodeAt(i)
    if (code <= 0x1f || code === 0x7f) {
      dirty = true
      break
    }
    if (lead === i && code === 47) lead++
    if (hashIndex === -1) {
      if (code === 63 && searchIndex === -1) searchIndex = i
      else if (code === 35) hashIndex = i
    }
  }

  if (dirty) {
    sanitizedHref = ''
    lead = 0
    hashIndex = -1
    searchIndex = -1
    for (let i = 0; i < len; i++) {
      const code = href.charCodeAt(i)
      if (code <= 0x1f || code === 0x7f) continue
      if (lead === sanitizedHref.length && code === 47) lead++
      if (hashIndex === -1) {
        if (code === 63 && searchIndex === -1) searchIndex = sanitizedHref.length
        else if (code === 35) hashIndex = sanitizedHref.length
      }
      sanitizedHref += href[i]
    }
  }

  if (lead > 1) {
    const drop = lead - 1
    sanitizedHref = sanitizedHref.slice(drop)
    if (searchIndex !== -1) searchIndex -= drop
    if (hashIndex !== -1) hashIndex -= drop
  }

  const pathEnd =
    hashIndex > 0
      ? searchIndex > 0
        ? Math.min(hashIndex, searchIndex)
        : hashIndex
      : searchIndex > 0
        ? searchIndex
        : sanitizedHref.length

  const pathname = sanitizedHref.substring(0, pathEnd)
  const hash = hashIndex > -1 ? sanitizedHref.substring(hashIndex) : ''
  const search =
    searchIndex > -1
      ? sanitizedHref.slice(searchIndex, hashIndex === -1 ? undefined : hashIndex)
      : ''
  lastHref = href
  lastSanitizedHref = sanitizedHref
  lastPathname = pathname
  lastSearch = search
  lastHash = hash

  return {
    href: sanitizedHref,
    pathname,
    hash,
    search,
    state: state ?? defaultHistoryState(),
  }
}

function defaultHistoryState(): ParsedHistoryState {
  const key = createRandomKey()
  return { __TSR_index: 0, key, __TSR_key: key }
}

let keySeq = 0

function createRandomKey() {
  return (++keySeq).toString(36)
}
