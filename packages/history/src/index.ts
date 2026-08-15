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

type TryNavigateArgs = {
  task: () => void
  type: 'PUSH' | 'REPLACE' | 'BACK' | 'FORWARD' | 'GO'
  navigateOpts?: NavigateOptions
} & ({ type: 'PUSH' | 'REPLACE'; path: string; state: any } | { type: 'BACK' | 'FORWARD' | 'GO' })

export function createHistory(opts: {
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

  const notify = (action: SubscriberHistoryAction) => {
    location = opts.getLocation()
    subscribers.forEach((subscriber) => subscriber({ location, action }))
  }

  const handleIndexChange = (action: SubscriberHistoryAction) => {
    if (opts.notifyOnIndexChange ?? true) notify(action)
    else location = opts.getLocation()
  }

  const tryNavigation = async ({ task, navigateOpts, ...actionInfo }: TryNavigateArgs) => {
    const ignoreBlocker = navigateOpts?.ignoreBlocker ?? false
    if (ignoreBlocker) {
      task()
      return
    }

    const blockers = opts.getBlockers?.() ?? []
    const isPushOrReplace = actionInfo.type === 'PUSH' || actionInfo.type === 'REPLACE'
    if (typeof document !== 'undefined' && blockers.length && isPushOrReplace) {
      for (const blocker of blockers) {
        const nextLocation = parseHref(actionInfo.path, actionInfo.state)
        const isBlocked = await blocker.blockerFn({
          currentLocation: location,
          nextLocation,
          action: actionInfo.type,
        })
        if (isBlocked) {
          opts.onBlocked?.()
          return
        }
      }
    }

    task()
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
      const currentIndex = location.state[STATE_INDEX]
      state = assignKeyAndIndex(currentIndex + 1, state)
      tryNavigation({
        task: () => {
          opts.pushState(path, state)
          notify({ type: 'PUSH' })
        },
        navigateOpts,
        type: 'PUSH',
        path,
        state,
      })
    },
    replace: (path, state, navigateOpts) => {
      const currentIndex = location.state[STATE_INDEX]
      state = assignKeyAndIndex(currentIndex, state)
      tryNavigation({
        task: () => {
          opts.replaceState(path, state)
          notify({ type: 'REPLACE' })
        },
        navigateOpts,
        type: 'REPLACE',
        path,
        state,
      })
    },
    go: (index, navigateOpts) => {
      tryNavigation({
        task: () => {
          opts.go(index)
          handleIndexChange({ type: 'GO', index })
        },
        navigateOpts,
        type: 'GO',
      })
    },
    back: (navigateOpts) => {
      tryNavigation({
        task: () => {
          opts.back(navigateOpts?.ignoreBlocker ?? false)
          handleIndexChange({ type: 'BACK' })
        },
        navigateOpts,
        type: 'BACK',
      })
    },
    forward: (navigateOpts) => {
      tryNavigation({
        task: () => {
          opts.forward(navigateOpts?.ignoreBlocker ?? false)
          handleIndexChange({ type: 'FORWARD' })
        },
        navigateOpts,
        type: 'FORWARD',
      })
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
  if (!state) state = {}
  const key = createRandomKey()
  return {
    ...state,
    key,
    __TSR_key: key,
    [STATE_INDEX]: index,
  } as ParsedHistoryState
}

export function createBrowserHistory(opts?: {
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

export function createHashHistory(opts?: { window?: any }): RouterHistory {
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

export function createMemoryHistory(
  opts: {
    initialEntries: Array<string>
    initialIndex?: number
  } = { initialEntries: ['/'] },
): RouterHistory {
  const entries = opts.initialEntries.slice()
  let index = opts.initialIndex
    ? Math.min(Math.max(opts.initialIndex, 0), entries.length - 1)
    : entries.length - 1
  const states = entries.map((_entry, i) => assignKeyAndIndex(i, undefined))

  const getLocation = () => parseHref(entries[index]!, states[index])

  let blockers: Array<NavigationBlocker> = []

  return createHistory({
    getLocation,
    getLength: () => entries.length,
    pushState: (path, state) => {
      if (index < entries.length - 1) {
        entries.splice(index + 1)
        states.splice(index + 1)
      }
      states.push(state)
      entries.push(path)
      index = Math.max(entries.length - 1, 0)
    },
    replaceState: (path, state) => {
      states[index] = state
      entries[index] = path
    },
    back: () => {
      index = Math.max(index - 1, 0)
    },
    forward: () => {
      index = Math.min(index + 1, entries.length - 1)
    },
    go: (n) => {
      index = Math.min(Math.max(index + n, 0), entries.length - 1)
    },
    createHref: (path) => path,
    getBlockers: () => blockers,
    setBlockers: (next) => {
      blockers = next
    },
  })
}

function sanitizePath(path: string): string {
  let sanitized = ''
  for (let i = 0; i < path.length; i++) {
    const code = path.charCodeAt(i)
    if (code > 0x1f && code !== 0x7f) sanitized += path[i]
  }
  if (sanitized.charCodeAt(0) === 47 && sanitized.charCodeAt(1) === 47) {
    let i = 0
    while (sanitized.charCodeAt(i) === 47) i++
    sanitized = '/' + sanitized.slice(i)
  }
  return sanitized
}

export function parseHref(href: string, state: ParsedHistoryState | undefined): HistoryLocation {
  const sanitizedHref = sanitizePath(href)
  let hashIndex = -1
  let searchIndex = -1
  for (let i = 0; i < sanitizedHref.length; i++) {
    const code = sanitizedHref.charCodeAt(i)
    if (code === 63 && searchIndex === -1) searchIndex = i
    else if (code === 35) {
      hashIndex = i
      break
    }
  }

  const addedKey = createRandomKey()
  const pathEnd =
    hashIndex > 0
      ? searchIndex > 0
        ? Math.min(hashIndex, searchIndex)
        : hashIndex
      : searchIndex > 0
        ? searchIndex
        : sanitizedHref.length

  return {
    href: sanitizedHref,
    pathname: sanitizedHref.substring(0, pathEnd),
    hash: hashIndex > -1 ? sanitizedHref.substring(hashIndex) : '',
    search:
      searchIndex > -1
        ? sanitizedHref.slice(searchIndex, hashIndex === -1 ? undefined : hashIndex)
        : '',
    state: state || { [STATE_INDEX]: 0, key: addedKey, __TSR_key: addedKey },
  }
}

function createRandomKey() {
  return (Math.random() + 1).toString(36).substring(7)
}
