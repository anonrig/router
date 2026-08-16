import type { AnyRouter } from './router'

function getScrollElement(selector: string | (() => Element | null | undefined)) {
  try {
    return typeof selector === 'function' ? selector() : document.querySelector(selector)
  } catch {
    return
  }
}

export function setupDefaultScroll(router: AnyRouter) {
  const scroll = router._scroll
  if (scroll.reset) return
  scroll.reset = true

  router.subscribe('onRendered', (event) => {
    const shouldResetScroll = scroll.next
    scroll.next = true
    scroll.hash = false

    const hash = event.toLocation.hash
    const hashScrollIntoViewOptions = event.toLocation.state.__hashScrollIntoViewOptions ?? true
    const behavior = router.options.scrollRestorationBehavior

    if (shouldResetScroll && !hash) {
      const scrollOptions = { top: 0, left: 0, behavior }
      scrollTo(scrollOptions)
      const selectors = router.options.scrollToTopSelectors
      if (selectors) {
        for (const selector of selectors) {
          if (selector === 'window') continue
          getScrollElement(selector)?.scrollTo(scrollOptions)
        }
      }
    }

    if (hash && hashScrollIntoViewOptions) {
      document.getElementById(hash)?.scrollIntoView(hashScrollIntoViewOptions)
    }
  })
}
