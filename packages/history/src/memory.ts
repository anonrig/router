import { BACK_ACTION, FORWARD_ACTION, PUSH_ACTION, REPLACE_ACTION, STATE_INDEX } from './constants'
import { assignKeyAndIndex, parseHref } from './parse'

function locationFromPath(path: string, state: ParsedHistoryState): HistoryLocation {
  const len = path.length
  if (len !== 0 && path.charCodeAt(0) === 47 && (len === 1 || path.charCodeAt(1) !== 47)) {
    let simple = true
    for (let i = 1; i < len; i++) {
      const code = path.charCodeAt(i)
      if (code <= 0x1f || code === 0x7f || code === 63 || code === 35) {
        simple = false
        break
      }
    }
    if (simple) {
      return { href: path, pathname: path, search: '', hash: '', state }
    }
  }
  return parseHref(path, state)
}
import type {
  BlockerFnArgs,
  HistoryLocation,
  NavigateOptions,
  NavigationBlocker,
  ParsedHistoryState,
  RouterHistory,
  SubscriberArgs,
  SubscriberHistoryAction,
} from './types'

class MemoryHistory implements RouterHistory {
  location: HistoryLocation
  private entries: Array<string>
  private states: Array<ParsedHistoryState>
  private index: number
  private _subscribers?: Set<(opts: SubscriberArgs) => void>
  private blockers?: Array<NavigationBlocker>

  constructor(
    opts: {
      initialEntries: Array<string>
      initialIndex?: number
    } = { initialEntries: ['/'] },
  ) {
    const src = opts.initialEntries
    if (src.length === 1 && opts.initialIndex == null) {
      const href = src[0]!
      const state = assignKeyAndIndex(0, undefined)
      this.entries = [href]
      this.states = [state]
      this.index = 0
      this.location = locationFromPath(href, state)
      return
    }
    this.entries = src.slice()
    this.index =
      opts.initialIndex != null
        ? Math.min(Math.max(opts.initialIndex, 0), this.entries.length - 1)
        : this.entries.length - 1
    this.states = new Array<ParsedHistoryState>(this.entries.length)
    for (let i = 0; i < this.entries.length; i++) {
      this.states[i] = assignKeyAndIndex(i, undefined)
    }
    this.location = locationFromPath(this.entries[this.index]!, this.states[this.index])
  }

  get length() {
    return this.entries.length
  }

  get subscribers() {
    return (this._subscribers ??= new Set())
  }

  subscribe(cb: (opts: SubscriberArgs) => void) {
    const subscribers = (this._subscribers ??= new Set())
    subscribers.add(cb)
    return () => {
      subscribers.delete(cb)
    }
  }

  private commitPush(path: string, state: ParsedHistoryState) {
    const { entries, states } = this
    if (this.index < entries.length - 1) {
      entries.length = this.index + 1
      states.length = this.index + 1
    }
    states.push(state)
    entries.push(path)
    this.index = entries.length - 1
    this.location = locationFromPath(path, state)
    this.notify(PUSH_ACTION)
  }

  private commitReplace(path: string, state: ParsedHistoryState) {
    this.states[this.index] = state
    this.entries[this.index] = path
    this.location = locationFromPath(path, state)
    this.notify(REPLACE_ACTION)
  }

  private runPushBlockers(
    type: 'PUSH' | 'REPLACE',
    path: string,
    state: ParsedHistoryState,
    task: () => void,
  ) {
    const list = this.blockers!
    const nextLocation = locationFromPath(path, state)
    const blockerArgs: BlockerFnArgs = {
      currentLocation: this.location,
      nextLocation,
      action: type,
    }
    const step = (start: number): void | Promise<void> => {
      for (let i = start; i < list.length; i++) {
        const result = list[i]!.blockerFn(blockerArgs)
        if (result != null && typeof (result as Promise<unknown>).then === 'function') {
          return (result as Promise<unknown>).then((isBlocked) => {
            if (isBlocked) return
            return step(i + 1)
          })
        }
        if (result) return
      }
      task()
    }
    return step(0)
  }

  push(path: string, state?: any, navigateOpts?: NavigateOptions) {
    const nextState = assignKeyAndIndex(this.location.state[STATE_INDEX] + 1, state)
    const blockers = this.blockers
    if (
      blockers &&
      blockers.length &&
      navigateOpts?.ignoreBlocker !== true &&
      typeof document !== 'undefined'
    ) {
      return this.runPushBlockers('PUSH', path, nextState, () => this.commitPush(path, nextState))
    }
    const { entries, states } = this
    if (this.index < entries.length - 1) {
      entries.length = this.index + 1
      states.length = this.index + 1
    }
    states.push(nextState)
    entries.push(path)
    this.index = entries.length - 1
    this.location = locationFromPath(path, nextState)
    this.notify(PUSH_ACTION)
  }

  replace(path: string, state?: any, navigateOpts?: NavigateOptions) {
    const nextState = assignKeyAndIndex(this.location.state[STATE_INDEX], state)
    const blockers = this.blockers
    if (
      blockers &&
      blockers.length &&
      navigateOpts?.ignoreBlocker !== true &&
      typeof document !== 'undefined'
    ) {
      return this.runPushBlockers('REPLACE', path, nextState, () =>
        this.commitReplace(path, nextState),
      )
    }
    this.states[this.index] = nextState
    this.entries[this.index] = path
    this.location = locationFromPath(path, nextState)
    this.notify(REPLACE_ACTION)
  }

  go(n: number) {
    const next = this.index + n
    this.index = next < 0 ? 0 : next >= this.entries.length ? this.entries.length - 1 : next
    this.location = locationFromPath(this.entries[this.index]!, this.states[this.index])
    this.notify({ type: 'GO', index: n })
  }

  back() {
    if (this.index !== 0) {
      this.index -= 1
      this.location = locationFromPath(this.entries[this.index]!, this.states[this.index])
    }
    this.notify(BACK_ACTION)
  }

  forward() {
    if (this.index < this.entries.length - 1) {
      this.index += 1
      this.location = locationFromPath(this.entries[this.index]!, this.states[this.index])
    }
    this.notify(FORWARD_ACTION)
  }

  canGoBack() {
    return this.location.state[STATE_INDEX] !== 0
  }

  createHref(path: string) {
    return path
  }

  block(blocker: NavigationBlocker) {
    const blockers = (this.blockers ??= [])
    blockers.push(blocker)
    return () => {
      this.blockers = this.blockers?.filter((candidate) => candidate !== blocker)
    }
  }

  hasBlockers() {
    return !!this.blockers?.length
  }

  flush() {}

  destroy() {}

  notify(action: SubscriberHistoryAction) {
    const subscribers = this._subscribers
    if (!subscribers || subscribers.size === 0) return
    const args: SubscriberArgs = { location: this.location, action }
    for (const subscriber of subscribers) subscriber(args)
  }
}

export const createMemoryHistory = /*#__PURE__*/ function createMemoryHistory(
  opts: {
    initialEntries: Array<string>
    initialIndex?: number
  } = { initialEntries: ['/'] },
): RouterHistory {
  return new MemoryHistory(opts)
}
