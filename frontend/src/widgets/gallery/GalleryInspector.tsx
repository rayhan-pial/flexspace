import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { Command } from '../../domain/workspace/commands'
import { ASSET_KEYS, MAX_LIST_ITEMS, MAX_TEXT } from '../../domain/workspace/constants'
import { addGalleryItem, removeGalleryItem, updateGalleryItem } from '../../domain/workspace/gallery'
import type { GalleryItemPatch } from '../../domain/workspace/gallery'
import { newId } from '../../domain/workspace/ids'
import type { GalleryProps } from '../../domain/workspace/types'
import { CommitTextField, SelectField } from '../../shared/ui/fields'
import type { WidgetInspectorProps } from '../types'
import MoveButtons from '../../features/sorting/MoveButtons'
import { listContainerId, transferTargets, workspaceAdapter } from '../../features/sorting/workspaceAdapter'
import { GALLERY_ASSETS, galleryAsset } from './assets'

const OPTIONS = ASSET_KEYS.map((key) => ({ value: key, label: GALLERY_ASSETS[key].label }))

/** Add, change and remove the images of the selected gallery: picture, alt text and caption. */
export default function GalleryInspector({ widgetId, props, dispatch }: WidgetInspectorProps<GalleryProps>) {
  const [error, setError] = useState<string | null>(null)

  function run(command: Command): boolean {
    const result = dispatch(command)
    setError(result.ok ? null : result.error)
    return result.ok
  }

  const next = ASSET_KEYS[props.items.length % ASSET_KEYS.length]

  return (
    <fieldset className="space-y-3">
      <legend className="text-xs font-medium uppercase tracking-wide text-ui-muted">Images ({props.items.length})</legend>
      {props.items.length === 0 && <p className="text-sm text-ui-muted">No images yet.</p>}

      <ul className="space-y-3">
        {props.items.map((item, index) => {
          const asset = galleryAsset(item.assetKey)
          const name = `image ${index + 1}`
          return (
            <li key={item.id} className="space-y-2 rounded-xl bg-ui-subtle p-3 ring-1 ring-ui-border">
              <div className="flex items-start justify-between gap-2">
                {asset && <img src={asset.url} alt="" className="aspect-[4/3] w-20 rounded-md object-cover" />}
                <button
                  type="button"
                  onClick={() => run(removeGalleryItem(widgetId, item.id))}
                  aria-label={`Remove ${name}`}
                  className="rounded p-1 text-ui-muted hover:bg-ui-border hover:text-red-700 ui-focus"
                >
                  <Trash2 aria-hidden="true" className="size-4" />
                </button>
              </div>
              <SelectField label={`Picture for ${name}`} value={item.assetKey} options={OPTIONS} onChange={(assetKey) => run(updateGalleryItem(widgetId, item.id, { assetKey }))} />
              <CommitTextField label={`Alt text for ${name}`} value={item.alt} maxLength={MAX_TEXT} onCommit={(alt) => run(updateGalleryItem(widgetId, item.id, { alt } satisfies GalleryItemPatch))} />
              {item.alt === '' && <p className="text-xs text-ui-muted">Describe the picture for screen readers, or leave empty if it is purely decorative.</p>}
              <CommitTextField label={`Caption for ${name}`} value={item.caption} maxLength={MAX_TEXT} onCommit={(caption) => run(updateGalleryItem(widgetId, item.id, { caption }))} />
              <MoveButtons
                adapter={workspaceAdapter}
                itemId={item.id}
                containerId={listContainerId('gallery', widgetId)}
                otherContainers={transferTargets('gallery', widgetId)}
                subject={name}
              />
            </li>
          )
        })}
      </ul>

      <button
        type="button"
        disabled={props.items.length >= MAX_LIST_ITEMS}
        onClick={() => run(addGalleryItem(widgetId, newId('img'), next))}
        className="rounded-ui-control border border-ui-control px-3 py-1.5 text-sm font-medium text-ui-text hover:bg-ui-subtle ui-focus disabled:cursor-not-allowed disabled:opacity-50"
      >
        Add image
      </button>
      {error && <p role="alert" className="rounded-ui-control bg-red-50 px-3 py-2 text-sm text-red-900 ring-1 ring-red-200">{error}</p>}
    </fieldset>
  )
}
