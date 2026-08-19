import { BEFORE_UNLOAD, POP_STATE, STATE_INDEX } from './constants'
import { createHistory } from './create'
import { assignKeyAndIndex, createRandomKey, parseHref } from './parse'
import type {
  HistoryLocation,
  NavigationBlocker,
  RouterHistory,
  SubscriberHistoryAction,
} from './types'

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

  {
    const existing = win.history.state
    const hasIndex = existing != null && Number.isFinite(existing[STATE_INDEX])
    const hasKey = !!(existing?.__TSR_key || existing?.key)
    if (!hasIndex || !hasKey) {
      const addedKey = existing?.__TSR_key ?? existing?.key ?? createRandomKey()
      win.history.replaceState(
        {
          ...(existing && typeof existing === 'object' ? existing : null),
          [STATE_INDEX]: hasIndex ? existing[STATE_INDEX] : 0,
          key: addedKey,
          __TSR_key: addedKey,
        },
        '',
      )
    }
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
    if (!alive || !next) return
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
          let isBlocked
          try {
            isBlocked = await blocker.blockerFn({
              currentLocation,
              nextLocation,
              action,
            })
          } catch (error) {
            if (Number.isFinite(delta) && delta !== 0) {
              ignoreNextPop = true
              win.history.go(-delta)
            } else {
              currentLocation = nextLocation
              history.notify(notify)
            }
            throw error
          }
          if (isBlocked) {
            if (Number.isFinite(delta) && delta !== 0) {
              ignoreNextPop = true
              win.history.go(-delta)
            }
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

  let alive = true

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
      alive = false
      if (rollbackLocation) currentLocation = rollbackLocation
      next = undefined
      rollbackLocation = undefined
      // Only unwrap if this instance still owns the hooks. A newer history on the
      // same window may have wrapped us; restoring would disconnect that instance.
      if (win.history.pushState === pushStateWrapper) {
        win.history.pushState = originalPushState
      }
      if (win.history.replaceState === replaceStateWrapper) {
        win.history.replaceState = originalReplaceState
      }
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

  function pushStateWrapper(...args: Array<any>) {
    if (next && !history._ignoreSubscribers) flush()
    if (!history._ignoreSubscribers && !Number.isFinite(args[0]?.[STATE_INDEX])) {
      const currentIndex = currentLocation.state[STATE_INDEX]
      args[0] = assignKeyAndIndex((Number.isFinite(currentIndex) ? currentIndex : 0) + 1, args[0])
    }
    const res = originalPushState.apply(win.history, args as any)
    if (alive && !history._ignoreSubscribers) onPushPop('PUSH')
    return res
  }

  function replaceStateWrapper(...args: Array<any>) {
    if (next && !history._ignoreSubscribers) flush()
    if (!history._ignoreSubscribers && !Number.isFinite(args[0]?.[STATE_INDEX])) {
      const currentIndex = currentLocation.state[STATE_INDEX]
      args[0] = assignKeyAndIndex(Number.isFinite(currentIndex) ? currentIndex : 0, args[0])
    }
    const res = originalReplaceState.apply(win.history, args as any)
    if (alive && !history._ignoreSubscribers) onPushPop('REPLACE')
    return res
  }

  win.history.pushState = pushStateWrapper
  win.history.replaceState = replaceStateWrapper

  return history
}
