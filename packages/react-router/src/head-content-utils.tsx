import {
  _getAssetMatches,
  appendUniqueUserTags,
  escapeHtml,
  getAssetCrossOrigin,
  getScriptPreloadAttrs,
  resolveManifestCssLink,
} from 'speedy-router-core'
import { isServer } from 'speedy-router-core/is-server'
import { useRouter } from './use-router'
import { collectMatchAssets, useMatchDerived } from './asset'
import type { AnyRouteMatch, AssetCrossOriginConfig, RouterManagedTag } from 'speedy-router-core'

function buildTagsFromMatches(
  router: ReturnType<typeof useRouter>,
  nonce: string | undefined,
  matches: Array<AnyRouteMatch>,
  assetCrossOrigin?: AssetCrossOriginConfig,
): Array<RouterManagedTag> {
  matches = _getAssetMatches(matches)
  const routeMeta = matches.map((match) => match.meta).filter((meta) => meta !== undefined)

  const resultMeta: Array<RouterManagedTag> = []
  const metaByAttribute: Record<string, true> = {}
  let title: RouterManagedTag | undefined
  for (let i = routeMeta.length - 1; i >= 0; i--) {
    const metas = routeMeta[i]!
    for (let j = metas.length - 1; j >= 0; j--) {
      const m = metas[j]
      if (!m) continue

      if (m.title) {
        if (!title) {
          title = {
            tag: 'title',
            children: m.title,
          }
        }
      } else if ('script:ld+json' in m) {
        try {
          const json = JSON.stringify(m['script:ld+json'])
          resultMeta.push({
            tag: 'script',
            attrs: {
              type: 'application/ld+json',
            },
            children: escapeHtml(json),
          })
        } catch {
          // Skip invalid JSON-LD objects
        }
      } else {
        const attribute = m.name ?? m.property
        if (attribute) {
          if (metaByAttribute[attribute]) {
            continue
          } else {
            metaByAttribute[attribute] = true
          }
        }

        resultMeta.push({
          tag: 'meta',
          attrs: {
            ...m,
            nonce,
          },
        })
      }
    }
  }

  if (title) {
    resultMeta.push(title)
  }

  if (nonce) {
    resultMeta.push({
      tag: 'meta',
      attrs: {
        property: 'csp-nonce',
        content: nonce,
      },
    })
  }
  resultMeta.reverse()

  const constructedLinks = collectMatchAssets(matches, 'links', 'link', { nonce })

  const manifest = router.ssr?.manifest
  const manifestCssTags: Array<RouterManagedTag> = []
  const preloadLinks: Array<RouterManagedTag> = []
  if (manifest) {
    for (const match of matches) {
      const routeAssets = manifest.routes[match.routeId]
      routeAssets?.css?.forEach((link: any) => {
        const resolvedLink = resolveManifestCssLink(link)
        manifestCssTags.push({
          tag: 'link',
          attrs: {
            rel: 'stylesheet',
            ...resolvedLink,
            crossOrigin:
              getAssetCrossOrigin(assetCrossOrigin, 'stylesheet') ?? resolvedLink.crossOrigin,
            suppressHydrationWarning: true,
            nonce,
          },
        })
      })
      routeAssets?.preloads?.forEach((preload: string) => {
        preloadLinks.push({
          tag: 'link',
          attrs: {
            ...getScriptPreloadAttrs(manifest, preload, assetCrossOrigin),
            nonce,
          },
        })
      })
    }

    if (manifest.inlineStyle) {
      manifestCssTags.push({
        tag: 'style',
        attrs: {
          ...manifest.inlineStyle.attrs,
          nonce,
        },
        children: manifest.inlineStyle.children,
        inlineCss: true,
      })
    }
  }

  const styles = collectMatchAssets(matches, 'styles', 'style', { nonce })
  const headScripts = collectMatchAssets(matches, 'headScripts', 'script', { nonce })

  const tags: Array<RouterManagedTag> = []
  appendUniqueUserTags(tags, resultMeta)
  tags.push(...preloadLinks)
  appendUniqueUserTags(tags, constructedLinks)
  tags.push(...manifestCssTags)
  appendUniqueUserTags(tags, styles)
  appendUniqueUserTags(tags, headScripts)
  return tags
}

/**
 * Build the head/link/meta/script tags from the renderable presented prefix.
 * Used internally by `HeadContent`.
 */
export const useTags = (assetCrossOrigin?: AssetCrossOriginConfig) => {
  const router = useRouter()
  const nonce = router.options.ssr?.nonce

  if (isServer ?? router.isServer) {
    return buildTagsFromMatches(router, nonce, router.stores.matches.get(), assetCrossOrigin)
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks -- server/client is static
  return useMatchDerived(router, (matches) =>
    buildTagsFromMatches(router, nonce, matches, assetCrossOrigin),
  )
}
