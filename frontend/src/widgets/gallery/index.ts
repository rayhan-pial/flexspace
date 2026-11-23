import { DEFAULT_WIDGET_PROPS } from '../../domain/workspace/defaults'
import type { GalleryProps } from '../../domain/workspace/types'
import type { WidgetDefinition } from '../types'
import GalleryInspector from './GalleryInspector'
import GalleryWidget from './GalleryWidget'

export const galleryWidget: WidgetDefinition<GalleryProps> = {
  type: 'gallery',
  label: 'Gallery',
  defaultProps: DEFAULT_WIDGET_PROPS.gallery,
  fields: [],
  Component: GalleryWidget,
  Inspector: GalleryInspector,
}
