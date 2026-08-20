import { BACK_ACTION, FORWARD_ACTION, PUSH_ACTION, REPLACE_ACTION, STATE_INDEX } from './constants'
import { assignKeyAndIndex, parseHref } from './parse'
import type {
  BlockerFnArgs,
  HistoryLocation,
  NavigateOptions,
  NavigationBlocker,
  RouterHistory,
  SubscriberArgs,
  SubscriberHistoryAction,
} from './types'

/**
 * Run PUSH/REPLACE blockers serially (supporting async blockers), then commit
 * via `task`. `isStale` re-checks navigation ownership before every step so an
 * outdated navigation never commits over a newer one.
 */
export function runBlockerChain(
  blockers: Array<NavigationBlocker>,
  blockerArgs: BlockerFnArgs,
  isStale: () => boolean,
  onBlocked: (() => void) | undefined,
  task: () => void,
): void | Promise<void> {
  const step = (start: number): void | Promise<void> => {
    if (isStale()) return
    for (let i = start; i < blockers.length; i++) {
      const result = blockers[i]!.blockerFn(blockerArgs)
      if (result != null && typeof (result as Promise<unknown>).then === 'function') {
        return (result as Promise<unknown>).then((isBlocked) => {
          if (isBlocked) {
            onBlocked?.()
            return
          }
          return step(i + 1)
        })
      }
      if (result) {
        onBlocked?.()
        return
      }
    }
    task()
  }
  return step(0)
}

export const createHistory = /*#__PURE__*/ function createHistory(opts: {
  getLocation: () => HistoryLocation
  getLength: () => number
  pushState: (path: string, state: any) => void
  replaceState: (path: string, state: any) => void
  go: (n: number, ignoreBlocker: boolean) => void
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
  let navigationId = 0
  let committedNavigationId = 0

  const notify = (action: SubscriberHistoryAction) => {
    location = opts.getLocation()
    // A pop takes ownership only once it has actually landed. opts.back, opts.go,
    // and opts.forward can return before the pop is applied, and a popstate
    // blocker may still reject it, so claiming ownership at call time would retire
    // an in-flight blocked push that is still valid.
    if (action.type !== 'PUSH' && action.type !== 'REPLACE') {
      committedNavigationId = ++navigationId
    }
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

  // Push/replace share everything except the action, the index delta, and the
  // state application. The next state index is re-read at commit time so
  // overlapping async blockers cannot reuse the same __TSR_index.
  const navigate = (
    type: 'PUSH' | 'REPLACE',
    path: string,
    state: any,
    navigateOpts?: NavigateOptions,
  ): void | Promise<void> => {
    const owner = ++navigationId
    const delta = type === 'PUSH' ? 1 : 0
    const commit = () => {
      committedNavigationId = owner
      const nextState = assignKeyAndIndex(location.state[STATE_INDEX] + delta, state)
      ;(type === 'PUSH' ? opts.pushState : opts.replaceState)(path, nextState)
      notify(type === 'PUSH' ? PUSH_ACTION : REPLACE_ACTION)
    }
    if (shouldRunBlockers(navigateOpts)) {
      return runBlockerChain(
        opts.getBlockers!(),
        {
          currentLocation: location,
          nextLocation: parseHref(
            path,
            assignKeyAndIndex(location.state[STATE_INDEX] + delta, state),
          ),
          action: type,
        },
        () => owner < committedNavigationId,
        opts.onBlocked,
        commit,
      )
    }
    commit()
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
    push: (path, state, navigateOpts) => navigate('PUSH', path, state, navigateOpts),
    replace: (path, state, navigateOpts) => navigate('REPLACE', path, state, navigateOpts),
    go: (index, navigateOpts) => {
      opts.go(index, navigateOpts?.ignoreBlocker === true)
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
    hasBlockers: () => (opts.getBlockers?.()?.length ?? 0) > 0,
    flush: () => opts.flush?.(),
    destroy: () => opts.destroy?.(),
    notify,
    _claimNavigation: () => {
      committedNavigationId = ++navigationId
    },
  }
}
