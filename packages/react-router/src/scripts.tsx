import { _getAssetMatches } from 'speedy-router-core'
import { isServer } from 'speedy-router-core/is-server'
import { Asset, collectMatchAssets, useMatchDerived } from './asset'
import { useRouter } from './use-router'
import type { AnyRouteMatch, RouterManagedTag } from 'speedy-router-core'

type ScriptRenderAsset = RouterManagedTag & {
  preventScriptHoist?: boolean
}

/**
 * Render body script tags collected from route matches and SSR manifests.
 * Should be placed near the end of the document body.
 */
export const Scripts = () => {
  const router = useRouter()
  const nonce = router.options.ssr?.nonce

  const getScripts = (matches: Array<AnyRouteMatch>) => {
    matches = _getAssetMatches(matches)
    const scripts = collectMatchAssets(matches, 'scripts', 'script', {
      suppressHydrationWarning: true,
      nonce,
    }) as Array<ScriptRenderAsset>
    const manifest = router.ssr?.manifest

    if (!manifest) {
      return scripts
    }

    for (const match of matches) {
      const manifestScripts = manifest.routes[match.routeId]?.scripts

      if (!manifestScripts) {
        continue
      }

      for (const asset of manifestScripts) {
        scripts.push({
          tag: 'script',
          attrs: { ...asset.attrs, nonce },
          children: asset.children,
          ...(typeof asset.attrs?.src === 'string' ? { preventScriptHoist: true } : {}),
        })
      }
    }

    return scripts
  }

  const scripts = useMatchDerived(router, getScripts)
  return renderScripts(router, scripts)
}

function renderScripts(router: ReturnType<typeof useRouter>, scripts: Array<ScriptRenderAsset>) {
  if ((isServer ?? router.isServer) && router.serverSsr) {
    const serverBufferedScript = router.serverSsr.takeBufferedScripts()
    if (serverBufferedScript) {
      scripts.unshift(serverBufferedScript)
    }
  }

  return (
    <>
      {scripts.map((asset, i) => (
        <Asset {...asset} key={`tsr-scripts-${asset.tag}-${i}`} />
      ))}
    </>
  )
}
