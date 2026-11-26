import aurora from '../../assets/gallery/aurora.svg'
import city from '../../assets/gallery/city.svg'
import forest from '../../assets/gallery/forest.svg'
import mountain from '../../assets/gallery/mountain.svg'
import studio from '../../assets/gallery/studio.svg'
import workspace from '../../assets/gallery/workspace.svg'
import { UPLOAD_KEY } from '../../domain/workspace/constants'
import type { AssetKey } from '../../domain/workspace/types'

/**
 * The only images a gallery can show: a code-owned map from the persisted `assetKey` to a bundled
 * file. Configuration never supplies a URL, so nothing is fetched from the network and nothing
 * can be uploaded.
 */
export const GALLERY_ASSETS: Record<AssetKey, { url: string; label: string }> = {
  aurora: { url: aurora, label: 'Aurora' },
  workspace: { url: workspace, label: 'Workspace' },
  mountain: { url: mountain, label: 'Mountain' },
  studio: { url: studio, label: 'Studio' },
  forest: { url: forest, label: 'Forest' },
  city: { url: city, label: 'City' },
}

/** Own-key lookup, so a key such as "constructor" is simply not an image. */
export const galleryAsset = (key: string): { url: string; label: string } | undefined => {
  // An upload is read from the signed-in user's own private images; the key is checked, never used as a free-form URL.
  if (UPLOAD_KEY.test(key)) return { url: `/api/images/${key.slice('upload:'.length)}`, label: 'Uploaded image' }
  return Object.hasOwn(GALLERY_ASSETS, key) ? GALLERY_ASSETS[key as AssetKey] : undefined
}
