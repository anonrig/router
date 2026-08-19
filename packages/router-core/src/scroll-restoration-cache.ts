import type { AnyRouter } from './router'
import type { ParsedLocation } from './location'

export type ScrollRestorationEntry = { scrollX: number; scrollY: number }

export type ScrollRestorationByElement = Record<string, ScrollRestorationEntry>

export type ScrollRestorationByKey = Record<string, ScrollRestorationByElement>

export type ScrollRestorationOptions = {
  getKey?: (location: ParsedLocation) => string
  scrollBehavior?: ScrollToOptions['behavior']
}

function getSafeSessionStorage() {
  try {
    // Accessing sessionStorage itself can throw SecurityError in locked-down
    // contexts, e.g. sandboxed/opaque origins or blocked storage policies.
    return sessionStorage
  } catch {
    return
  }
}

// SessionStorage key used to store scroll positions across navigations.
export const storageKey = 'tsr-scroll-restoration-v1_3'
const safeSessionStorage = getSafeSessionStorage()

function createScrollRestorationCache() {
  try {
    return JSON.parse(safeSessionStorage?.getItem(storageKey) || '{}') as ScrollRestorationByKey
  } catch {
    // ignore invalid session storage payloads
    return {}
  }
}

export const scrollRestorationCache = /* @__PURE__ */ createScrollRestorationCache()
export const scrollRestorationIdAttribute = 'data-scroll-restoration-id'
export const windowScrollTarget = 'window'

export function persistScrollRestorationCache() {
  try {
    safeSessionStorage?.setItem(storageKey, JSON.stringify(scrollRestorationCache))
  } catch {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[ts-router] Could not persist scroll restoration state to sessionStorage.')
    }
  }
}

/**
 * The default `getKey` function for `useScrollRestoration`.
 * It returns the `key` from the location state or the `href` of the location.
 *
 * The `location.href` is used as a fallback to support the use case where the location state is not available like the initial render.
 */
export const defaultGetScrollRestorationKey = (location: ParsedLocation) => {
  return location.state.__TSR_key! || location.href
}

export function getScrollRestorationSelector(element: Element): string {
  const attrId = element.getAttribute(scrollRestorationIdAttribute)
  if (attrId) {
    return `[${scrollRestorationIdAttribute}="${attrId}"]`
  }

  let selector = ''
  let el: any = element
  let parent: HTMLElement

  while ((parent = el.parentNode)) {
    let index = 1
    let sibling = el
    while ((sibling = sibling.previousElementSibling)) {
      index++
    }

    const part = `${el.localName}:nth-child(${index})`
    selector = selector ? `${part} > ${selector}` : part
    el = parent
  }

  return selector
}

export function getElementScrollRestorationEntry(
  router: AnyRouter,
  options: (
    | {
        id: string
        getElement?: () => Window | Element | undefined | null
      }
    | {
        id?: string
        getElement: () => Window | Element | undefined | null
      }
  ) & {
    getKey?: (location: ParsedLocation) => string
  },
): ScrollRestorationEntry | undefined {
  const getKey = options.getKey || defaultGetScrollRestorationKey
  const restoreKey = getKey(router.latestLocation)
  const entries = scrollRestorationCache[restoreKey]

  if (!entries) {
    return
  }

  if (options.id) {
    return entries[`[${scrollRestorationIdAttribute}="${options.id}"]`]
  }

  const element = options.getElement?.()
  if (!element) {
    return
  }

  return entries[
    element === window ? windowScrollTarget : getScrollRestorationSelector(element as Element)
  ]
}
