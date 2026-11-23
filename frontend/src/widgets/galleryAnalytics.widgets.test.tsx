import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ASSET_KEYS } from '../domain/workspace/constants'
import type { AnalyticsProps, GalleryProps } from '../domain/workspace/types'
import AnalyticsWidget from './analytics/AnalyticsWidget'
import { barPercent, formatValue } from './analytics/bars'
import { GALLERY_ASSETS, galleryAsset } from './gallery/assets'
import GalleryWidget from './gallery/GalleryWidget'
import type { WidgetRenderProps } from './types'

const base = { widgetId: 'w', title: 'T', dispatch: () => ({ ok: true as const }), onChangeProps: () => {} }
const gallery = (props: GalleryProps, mode: WidgetRenderProps<GalleryProps>['mode'] = 'preview') =>
  render(<GalleryWidget {...base} props={props} mode={mode} />)
const analytics = (props: AnalyticsProps, mode: WidgetRenderProps<AnalyticsProps>['mode'] = 'preview') =>
  render(<AnalyticsWidget {...base} props={props} mode={mode} />)

describe('gallery assets', () => {
  it('bundles a local image for every allowed key and never resolves anything else', () => {
    for (const key of ASSET_KEYS) {
      const asset = galleryAsset(key)!
      expect(asset.url).toBeTruthy()
      expect(asset.url).not.toMatch(/^https?:/) // nothing comes from the network
      expect(asset.label).toBeTruthy()
    }
    expect(Object.keys(GALLERY_ASSETS).sort()).toEqual([...ASSET_KEYS].sort())
    for (const key of ['constructor', '__proto__', 'toString', 'https://x.test/a.png', '']) expect(galleryAsset(key)).toBeUndefined()
  })
})

describe('GalleryWidget', () => {
  it('shows each bundled image with its alt text and caption', () => {
    gallery({ items: [{ id: 'a', assetKey: 'aurora', alt: 'Northern lights', caption: 'Colour study' }, { id: 'b', assetKey: 'city', alt: '', caption: '' }] })
    const img = screen.getByAltText('Northern lights') as HTMLImageElement
    expect(img.src).toContain(galleryAsset('aurora')!.url.replace(/^\./, ''))
    expect(screen.getByText('Colour study')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(document.querySelectorAll('img')).toHaveLength(2)
  })
  it('renders alt and caption as plain text', () => {
    gallery({ items: [{ id: 'a', assetKey: 'forest', alt: '<script>x</script>', caption: '<b>bold</b>' }] })
    expect(screen.getByText('<b>bold</b>')).toBeInTheDocument()
    expect(document.querySelector('b, script')).toBeNull()
    expect(screen.getByAltText('<script>x</script>')).toBeInTheDocument()
  })
  it('stays bounded: empty list message, clamped long captions with a tooltip, scrolling grid', () => {
    const empty = gallery({ items: [] }, 'edit')
    expect(screen.getByText(/No images yet. Select this widget and add some in Properties/)).toBeInTheDocument()
    empty.unmount()
    const long = 'word '.repeat(400)
    gallery({ items: [{ id: 'a', assetKey: 'city', alt: 'x', caption: long }] })
    const caption = document.querySelector('figcaption')!
    expect(caption.className).toContain('line-clamp-2')
    expect(caption).toHaveAttribute('title', long)
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByRole('list').className).toContain('overflow-y-auto')
  })
  it('falls back to a placeholder instead of a broken image when a saved key is not bundled', () => {
    gallery({ items: [{ id: 'a', assetKey: 'nonexistent' as never, alt: '', caption: 'Lost' }] })
    expect(screen.getByText('Image unavailable')).toBeInTheDocument()
    expect(document.querySelector('img')).toBeNull()
  })
})

describe('bars', () => {
  it('scales to the largest value, clamping and ignoring non-positive numbers', () => {
    expect(barPercent(5, 10)).toBe(50)
    expect(barPercent(10, 10)).toBe(100)
    expect(barPercent(0, 10)).toBe(0)
    expect(barPercent(-3, 10)).toBe(0)
    expect(barPercent(5, 0)).toBe(0)
    expect(barPercent(50, 10)).toBe(100)
    expect(barPercent(Number.NaN, 10)).toBe(0)
    expect(barPercent(1, Infinity)).toBe(0)
  })
  it('formats with grouping and at most two decimals', () => {
    expect(formatValue(1234567.891)).toBe('1,234,567.89')
    expect(formatValue(0)).toBe('0')
    expect(formatValue(-4.5)).toBe('-4.5')
  })
})

describe('AnalyticsWidget', () => {
  const widths = () => [...document.querySelectorAll('[data-bar]')].map((el) => (el as HTMLElement).style.width)

  it('shows label, value and a proportional bar for each metric', () => {
    analytics({ metrics: [{ id: 'a', label: 'Visits', value: 200 }, { id: 'b', label: 'Signups', value: 50 }, { id: 'c', label: 'Churn', value: -5 }] })
    expect(screen.getByText('Visits')).toBeInTheDocument()
    expect(screen.getByText('200')).toBeInTheDocument()
    expect(screen.getByText('-5')).toBeInTheDocument()
    expect(widths()).toEqual(['100%', '25%', '0%'])
  })
  it('is bounded: empty message, truncated labels with tooltips, scrolling list', () => {
    const empty = analytics({ metrics: [] }, 'edit')
    expect(screen.getByText(/No metrics yet. Select this widget and add some in Properties/)).toBeInTheDocument()
    empty.unmount()
    const label = 'A very long metric label '.repeat(20)
    analytics({ metrics: [{ id: 'a', label, value: 1 }] })
    const span = document.querySelector('[title]')!
    expect(span.className).toContain('truncate')
    expect(span).toHaveAttribute('title', label)
    expect(screen.getByRole('list').className).toContain('overflow-y-auto')
  })
  it('handles all-zero and all-negative data without a bar or NaN', () => {
    analytics({ metrics: [{ id: 'a', label: 'Zero', value: 0 }, { id: 'b', label: 'Down', value: -9 }] })
    expect(widths()).toEqual(['0%', '0%'])
  })
  it('renders labels as plain text', () => {
    analytics({ metrics: [{ id: 'a', label: '<img src=x onerror=alert(1)>', value: 1 }] })
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument()
    expect(document.querySelector('img')).toBeNull()
  })
})
