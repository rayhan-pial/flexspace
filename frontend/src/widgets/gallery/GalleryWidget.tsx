import type { ReactNode } from 'react'
import type { GalleryItem, GalleryProps } from '../../domain/workspace/types'
import SortHandle from '../../features/sorting/SortHandle'
import SortableSection from '../../features/sorting/SortableSection'
import { useOptionalSortContext } from '../../features/sorting/sortContext'
import { GALLERY_ITEM_TYPE, listContainerId, lookupListItem } from '../../features/sorting/workspaceAdapter'
import type { WidgetRenderProps } from '../types'
import { galleryAsset } from './assets'

const GRID = 'grid h-full min-h-0 grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] content-start gap-3 overflow-y-auto'

function Tile({ item, handle }: { item: GalleryItem; handle?: ReactNode }) {
  const asset = galleryAsset(item.assetKey)
  return (
    <figure className="relative m-0">
      {asset ? (
        <img
          src={asset.url}
          alt={item.alt}
          loading="lazy"
          draggable={false}
          className="aspect-[4/3] w-full rounded-lg bg-black/5 object-cover"
        />
      ) : (
        <div className="flex aspect-[4/3] w-full items-center justify-center rounded-lg bg-black/5 text-xs opacity-70">Image unavailable</div>
      )}
      {handle && <span className="absolute left-1 top-1 rounded bg-white/90 shadow-sm ring-1 ring-slate-200">{handle}</span>}
      {item.caption !== '' && (
        <figcaption title={item.caption} className="mt-1 line-clamp-2 break-words text-xs opacity-80">{item.caption}</figcaption>
      )}
    </figure>
  )
}

/**
 * A grid of bundled images with captions. Pictures, alt text and captions are edited from the
 * inspector. Everything is bounded: the grid scrolls inside the card, images keep a fixed aspect
 * ratio and long captions are clamped (the full text stays in the tooltip). In Edit each tile has a
 * grip: tiles can be reordered or dragged into another Gallery widget (an empty one is a drop target).
 */
export default function GalleryWidget({ widgetId, title, props, mode }: WidgetRenderProps<GalleryProps>) {
  const hasSorting = useOptionalSortContext() !== null
  const sortable = mode === 'edit' && hasSorting

  if (sortable) {
    return (
      <SortableSection
        containerId={listContainerId('gallery', widgetId)}
        itemType={GALLERY_ITEM_TYPE}
        items={props.items.map((item) => item.id)}
        orientation="grid"
        label={`${title || 'Gallery'} images`}
        emptyLabel="No images yet. Select this widget and add some in Properties, or drag one here."
        className={GRID}
        renderItem={(id, { handleRef }) => {
          // An image being dragged in from another Gallery is previewed here, so look it up in the whole draft.
          const item = props.items.find((entry) => entry.id === id) ?? lookupListItem<GalleryItem>('gallery', id)
          return item ? <Tile item={item} handle={<SortHandle handleRef={handleRef} label={`Reorder image ${item.alt || item.caption || item.assetKey}`} />} /> : null
        }}
      />
    )
  }

  if (props.items.length === 0) {
    return (
      <p className="text-sm opacity-70">
        {mode === 'edit' ? 'No images yet. Select this widget and add some in Properties.' : 'No images yet.'}
      </p>
    )
  }

  return (
    <ul aria-label={`${title || 'Gallery'} images`} className={GRID}>
      {props.items.map((item) => (
        <li key={item.id} className="min-w-0">
          <Tile item={item} />
        </li>
      ))}
    </ul>
  )
}
