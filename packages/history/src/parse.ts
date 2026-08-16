import { STATE_INDEX } from './constants'
import type { HistoryLocation, HistoryState, ParsedHistoryState } from './types'

const HREF_RING = 8
const hrefRing = new Array<string>(HREF_RING)
const sanitizedRing = new Array<string>(HREF_RING)
const pathnameRing = new Array<string>(HREF_RING)
const searchRing = new Array<string>(HREF_RING)
const hashRing = new Array<string>(HREF_RING)
let hrefRingWrite = 0
let lastHref: string | undefined
let lastRing = 0

let keySeq = 0

function rememberParsedHref(
  href: string,
  sanitizedHref: string,
  pathname: string,
  search: string,
  hash: string,
) {
  const i = hrefRingWrite++ & 7
  hrefRing[i] = href
  sanitizedRing[i] = sanitizedHref
  pathnameRing[i] = pathname
  searchRing[i] = search
  hashRing[i] = hash
  lastHref = href
  lastRing = i
}

export function createRandomKey() {
  return (++keySeq).toString(36)
}

function parsedLocation(
  href: string,
  pathname: string,
  hash: string,
  search: string,
  state: ParsedHistoryState | undefined,
): HistoryLocation {
  return {
    href,
    pathname,
    hash,
    search,
    state: state ?? defaultHistoryState(),
  }
}

export function defaultHistoryState(): ParsedHistoryState {
  const key = createRandomKey()
  return { __TSR_index: 0, key, __TSR_key: key }
}

export function assignKeyAndIndex(index: number, state: HistoryState | undefined) {
  const key = createRandomKey()
  const next = { key, __TSR_key: key, [STATE_INDEX]: index } as ParsedHistoryState
  if (state != null) {
    for (const k in state) {
      if (k !== 'key' && k !== '__TSR_key' && k !== STATE_INDEX) {
        ;(next as any)[k] = (state as any)[k]
      }
    }
    next.key = key
    next.__TSR_key = key
    next[STATE_INDEX] = index
  }
  return next
}

export function parseHref(href: string, state: ParsedHistoryState | undefined): HistoryLocation {
  if (state == null) state = defaultHistoryState()
  if (href === lastHref) {
    return parsedLocation(
      sanitizedRing[lastRing]!,
      pathnameRing[lastRing]!,
      hashRing[lastRing]!,
      searchRing[lastRing]!,
      state,
    )
  }
  for (let i = 0; i < HREF_RING; i++) {
    if (hrefRing[i] === href) {
      lastHref = href
      lastRing = i
      return parsedLocation(
        sanitizedRing[i]!,
        pathnameRing[i]!,
        hashRing[i]!,
        searchRing[i]!,
        state,
      )
    }
  }

  const hrefLen = href.length
  if (hrefLen !== 0 && href.charCodeAt(0) === 47 && (hrefLen === 1 || href.charCodeAt(1) !== 47)) {
    let simple = true
    for (let i = 1; i < hrefLen; i++) {
      const code = href.charCodeAt(i)
      if (code <= 0x1f || code === 0x7f || code === 63 || code === 35) {
        simple = false
        break
      }
    }
    if (simple) {
      rememberParsedHref(href, href, href, '', '')
      return parsedLocation(href, href, '', '', state)
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
  rememberParsedHref(href, sanitizedHref, pathname, search, hash)

  return parsedLocation(sanitizedHref, pathname, hash, search, state)
}
