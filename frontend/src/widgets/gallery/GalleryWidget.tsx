import type { GalleryProps } from '../../domain/workspace/types'
import type { WidgetRenderProps } from '../types'
import { galleryAsset } from './assets'

/**
 * A grid of bundled images with captions. Display only: images are edited from the inspector.
 * Everything is bounded: the grid scrolls inside the card, images keep a fixed aspect ratio and
 * long captions are clamped (the full text stays in the tooltip).
 */
export default function GalleryWidget({ title, props, mode }: WidgetRenderProps<GalleryProps>) {
  if (props.items.length === 0) {
    return (
      <p className="text-sm opacity-70">
        {mode === 'edit' ? 'No images yet. Select this widget and add some in Properties.' : 'No images yet.'}
      </p>
    )
  }

  return (
    <ul aria-label={`${title || 'Gallery'} images`} className="grid h-full min-h-0 grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] content-start gap-3 overflow-y-auto">
      {props.items.map((item) => {
        const asset = galleryAsset(item.assetKey)
        return (
          <li key={item.id} className="min-w-0">
            <figure className="m-0">
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
              {item.caption !== '' && (
                <figcaption title={item.caption} className="mt-1 line-clamp-2 break-words text-xs opacity-80">{item.caption}</figcaption>
              )}
            </figure>
          </li>
        )
      })}
    </ul>
  )
}
