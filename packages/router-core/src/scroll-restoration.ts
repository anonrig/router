import { isServer } from 'speedy-router-core/is-server'
import { queryScrollElement } from './scroll-default'
import {
  defaultGetScrollRestorationKey,
  getScrollRestorationSelector,
  persistScrollRestorationCache,
  scrollRestorationCache,
  windowScrollTarget,
  type ScrollRestorationByElement,
} from './scroll-restoration-cache'
import type { AnyRouter } from './router'

let ignoreScroll = false

function getScrollToTopElements(
  scrollToTopSelectors: NonNullable<AnyRouter['options']['scrollToTopSelectors']>,
) {
  const elements = new Set<Element>()

  for (const selector of scrollToTopSelectors) {
    if (selector === windowScrollTarget) {
      continue
    }

    const element = queryScrollElement(selector)
    if (element) {
      elements.add(element)
    }
  }

  return elements
}

export function setupScrollRestoration(router: AnyRouter, force?: boolean) {
  // Keep hash/top scrolling active even when sessionStorage is unavailable.
  const shouldSetupScrollRestoration = force ?? router.options.scrollRestoration
  const scroll = router._scroll

  if (shouldSetupScrollRestoration) {
    scroll.restoring = true
  }

  if (isServer ?? router.isServer) {
    return
  }

  const getKey = router.options.getScrollRestorationKey || defaultGetScrollRestorationKey
  const trackedScrollTargets = new Set<Document | Element>()

  // Snapshot the current page's tracked scroll targets before navigation or unload.
  const snapshotCurrentScrollTargets = (restoreKey: string) => {
    const keyEntry = (scrollRestorationCache[restoreKey] ||= {} as ScrollRestorationByElement)

    for (const target of trackedScrollTargets) {
      if (target === document) {
        keyEntry[windowScrollTarget] = { scrollX, scrollY }
      } else if ((target as Element).isConnected) {
        keyEntry[getScrollRestorationSelector(target as Element)] = {
          scrollX: (target as Element).scrollLeft,
          scrollY: (target as Element).scrollTop,
        }
      }
    }
  }

  if (shouldSetupScrollRestoration && !scroll.restoration) {
    scroll.restoration = true
    ignoreScroll = false

    history.scrollRestoration = 'manual'

    document.addEventListener(
      'scroll',
      (event) => {
        if (ignoreScroll) {
          return
        }
        trackedScrollTargets.add(event.target as Document | Element)
      },
      true,
    )
    router.subscribe('onBeforeLoad', (event) => {
      if (event.fromLocation) {
        snapshotCurrentScrollTargets(getKey(event.fromLocation))
      }
      trackedScrollTargets.clear()
    })
    addEventListener('pagehide', () => {
      snapshotCurrentScrollTargets(
        getKey(router.stores.resolvedLocation.get() ?? router.stores.location.get()),
      )
      persistScrollRestorationCache()
    })
  }

  if (scroll.reset) {
    return
  }

  scroll.reset = true

  // Restore destination scroll after the new route has rendered.
  router.subscribe('onRendered', (event) => {
    const behavior = router.options.scrollRestorationBehavior
    const scrollToTopSelectors = router.options.scrollToTopSelectors
    const shouldResetScroll = scroll.next
    const hashNavigation = scroll.hash
    let scrollToTopElements: Set<Element> | undefined
    trackedScrollTargets.clear()
    scroll.next = true
    scroll.hash = false

    if (
      typeof router.options.scrollRestoration === 'function' &&
      !router.options.scrollRestoration({ location: router.latestLocation })
    ) {
      return
    }

    const cacheKey = getKey(event.toLocation)
    const fromCacheKey = event.fromLocation && getKey(event.fromLocation)

    if (scroll.restoring && fromCacheKey && fromCacheKey !== cacheKey) {
      const fromElementEntries = scrollRestorationCache[fromCacheKey]

      if (fromElementEntries) {
        let toElementEntries = scrollRestorationCache[cacheKey]

        for (const elementSelector in fromElementEntries) {
          if (elementSelector === windowScrollTarget) {
            if (shouldResetScroll) {
              continue
            }
          } else {
            const element = queryScrollElement(elementSelector)
            if (!element) {
              continue
            }

            if (shouldResetScroll && scrollToTopSelectors) {
              scrollToTopElements ??= getScrollToTopElements(scrollToTopSelectors)
              if (scrollToTopElements.has(element)) {
                continue
              }
            }
          }

          if (!toElementEntries) {
            toElementEntries = scrollRestorationCache[cacheKey] = {} as ScrollRestorationByElement
          }

          toElementEntries[elementSelector] ??= fromElementEntries[elementSelector]!
        }
      }
    }

    ignoreScroll = true

    try {
      const hash = event.toLocation.hash
      const hashScrollIntoViewOptions = event.toLocation.state.__hashScrollIntoViewOptions ?? true
      let windowRestored = false

      if (shouldResetScroll) {
        if (!hash && scrollToTopSelectors) {
          scrollToTopElements ??= getScrollToTopElements(scrollToTopSelectors)
        }

        const skipWindowRestore = hash && hashScrollIntoViewOptions && hashNavigation

        const elementEntries = scroll.restoring ? scrollRestorationCache[cacheKey] : undefined

        if (elementEntries) {
          for (const elementSelector in elementEntries) {
            const { scrollX, scrollY } = elementEntries[elementSelector]!

            if (elementSelector === windowScrollTarget) {
              if (skipWindowRestore) {
                continue
              }

              scrollTo({
                top: scrollY,
                left: scrollX,
                behavior,
              })
              windowRestored = true
            } else {
              const element = queryScrollElement(elementSelector)
              if (element) {
                element.scrollLeft = scrollX
                element.scrollTop = scrollY
                scrollToTopElements?.delete(element)
              }
            }
          }
        }

        if (!hash) {
          const scrollOptions = {
            top: 0,
            left: 0,
            behavior,
          }

          if (!windowRestored) {
            scrollTo(scrollOptions)
          }
          if (scrollToTopElements) {
            for (const element of scrollToTopElements) {
              element.scrollTo(scrollOptions)
            }
          }
        }
      }

      if (!windowRestored && hash && hashScrollIntoViewOptions) {
        document.getElementById(hash)?.scrollIntoView(hashScrollIntoViewOptions)
      }
    } finally {
      ignoreScroll = false
    }
  })
}
