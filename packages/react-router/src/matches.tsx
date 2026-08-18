import { Suspense, useState } from 'react'
import { rootRouteId, type AnyRouter } from 'speedy-router-core'
import { isServer } from 'speedy-router-core/is-server'
import { CatchBoundary } from './catch-boundary'
import { Match, renderPending } from './match'
import { errorResetContext, matchContext } from './match-context'
import { SafeFragment } from './safe-fragment'
import { settleOwner, Transitioner } from './transitioner'
import { useLayoutEffect } from './utils'
import { useRouter } from './use-router'
import { useRouterState } from './use-router-state'

export function Matches() {
  const router = useRouter()
  const rootRoute = router.routesById[rootRouteId]
  const pendingElement = renderPending(router, rootRoute)
  const ResolvedSuspense = (isServer ?? router.isServer) || router.ssr ? SafeFragment : Suspense
  const [, setRouter] = useState<AnyRouter>()

  const inner = (
    <>
      {!(isServer ?? router.isServer) && <Transitioner t={setRouter} />}
      <ResolvedSuspense fallback={pendingElement}>
        <MatchesInner />
      </ResolvedSuspense>
    </>
  )

  return router.options.InnerWrap ? (
    <router.options.InnerWrap>{inner}</router.options.InnerWrap>
  ) : (
    inner
  )
}

function MatchesInner() {
  const router = useRouter()
  const acknowledgement = (router._rendered ??= [])
  const matches =
    (isServer ?? router.isServer)
      ? router.stores.matches.get()
      : // eslint-disable-next-line react-hooks/rules-of-hooks
        useRouterState({
          select: (state) => acknowledgement[0 /* offered */] ?? state.matches,
        })
  const match = matches[0]
  const routeId = match?.routeId
  let errorReset = ''
  for (let i = 0; i < matches.length; i++) {
    const item = matches[i]!
    errorReset += `${item.id}:${item.status}:${item.updatedAt}:`
  }

  useLayoutEffect(() => {
    if (acknowledgement[0 /* offered */] === matches) {
      settleOwner(acknowledgement, true)
    }
  }, [acknowledgement, matches])

  const matchComponent = routeId ? <Match routeId={routeId} /> : null

  return (
    <errorResetContext.Provider value={errorReset}>
      <matchContext.Provider value={routeId}>
        {router.options.disableGlobalCatchBoundary ? (
          matchComponent
        ) : (
          <CatchBoundary
            getResetKey={() => errorReset}
            onCatch={
              process.env.NODE_ENV !== 'production'
                ? (error) => {
                    console.warn(
                      `Warning: The following error wasn't caught by any route! At the very least, consider setting an 'errorComponent' in your RootRoute!`,
                    )
                    console.warn(`Warning: ${error.message || error.toString()}`)
                  }
                : undefined
            }
          >
            {matchComponent}
          </CatchBoundary>
        )}
      </matchContext.Provider>
    </errorResetContext.Provider>
  )
}
