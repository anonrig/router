import { STATE_INDEX } from './constants'
import type { HistoryLocation, HistoryState, ParsedHistoryState } from './types'

let lastHref = ''
let lastSanitizedHref = ''
let lastPathname = ''
let lastSearch = ''
let lastHash = ''

let keySeq = 0

export function createRandomKey() {
  return (++keySeq).toString(36)
}

export function defaultHistoryState(): ParsedHistoryState {
  const key = createRandomKey()
  return { __TSR_index: 0, key, __TSR_key: key }
}

export function assignKeyAndIndex(index: number, state: HistoryState | undefined) {
  const key = createRandomKey()
  if (state == null) {
    return { key, __TSR_key: key, [STATE_INDEX]: index }
  }
  return {
    ...state,
    key,
    __TSR_key: key,
    [STATE_INDEX]: index,
  } as ParsedHistoryState
}

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
