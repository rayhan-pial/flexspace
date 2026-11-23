import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../app/App'
import type { GalleryItem, Metric } from '../../domain/workspace/types'
import { installFetch } from '../../test/fakeApi'
import { createFakeServer } from '../../test/fakeServer'
import type { FakeServer } from '../../test/fakeServer'
import { stubViewport } from '../../test/viewport'
import { useSessionStore } from '../auth/sessionStore'
import { selectIsDirty, useEditorStore } from '../editor/editorStore'

const PASSWORD = 'correct horse battery'
const editor = () => useEditorStore.getState()

const config = {
  schemaVersion: 1,
  title: 'Ada workspace',
  sections: [
    {
      id: 's-main', kind: 'grid', title: 'Board',
      widgets: [
        { id: 'w-gallery', type: 'gallery', title: 'Inspiration', props: { items: [{ id: 'img-1', assetKey: 'aurora', alt: 'Aurora', caption: 'Colour study' }] } },
        { id: 'w-analytics', type: 'analytics', title: 'Key metrics', props: { metrics: [{ id: 'm-1', label: 'Visits', value: 200 }, { id: 'm-2', label: 'Signups', value: 50 }] } },
      ],
      layout: [{ i: 'w-gallery', x: 0, y: 0, w: 6, h: 6 }, { i: 'w-analytics', x: 6, y: 0, w: 6, h: 6 }],
    },
  ],
}

let server: FakeServer
let viewport: ReturnType<typeof stubViewport>

beforeEach(() => {
  useSessionStore.setState(useSessionStore.getInitialState(), true)
  useEditorStore.setState(useEditorStore.getInitialState(), true)
  server = createFakeServer({ a: 'Ada workspace' }, { a: config })
  server.session = 'a'
  installFetch(server.handlers)
  viewport = stubViewport(true)
})
afterEach(() => {
  viewport.restore()
  vi.unstubAllGlobals()
})

async function open() {
  render(<App />)
  await screen.findByAltText('Aurora')
  return userEvent.setup()
}

const settings = () => within(screen.getByRole('complementary', { name: 'Settings panel' }))
const card = (id: string) => within(document.querySelector(`[data-widget-id="${id}"]`) as HTMLElement)
const props = (id: string) => editor().draftConfig!.sections[0].widgets.find((w) => w.id === id)!.props
const images = () => props('w-gallery').items as GalleryItem[]
const metrics = () => props('w-analytics').metrics as Metric[]
const widths = () => [...document.querySelectorAll('[data-widget-id="w-analytics"] [data-bar]')].map((el) => (el as HTMLElement).style.width)

async function select(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(within(screen.getByRole('list', { name: 'Components' })).getByRole('button', { name }))
}
const saved = () => waitFor(() => expect(screen.getByText('All changes saved')).toBeInTheDocument())

async function logOutAndIn(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Log out' }))
  await screen.findByRole('heading', { name: 'Sign in to your workspace' })
  await user.type(screen.getByLabelText('Email'), 'a@example.com')
  await user.type(screen.getByLabelText('Password'), PASSWORD)
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
}

describe('Gallery inspector', () => {
  it('renders the saved image, caption and alt text without any network request for it', async () => {
    await open()
    expect(card('w-gallery').getByAltText('Aurora')).toBeInTheDocument()
    expect(card('w-gallery').getByText('Colour study')).toBeInTheDocument()
    expect(server.gets).toBe(1) // only the workspace itself was fetched
  })

  it('changes the picture, alt text and caption live; text commits on Enter or blur', async () => {
    const user = await open()
    await select(user, 'Inspiration')
    await user.selectOptions(settings().getByLabelText('Picture for image 1'), 'studio')
    expect(images()[0].assetKey).toBe('studio')
    const alt = settings().getByLabelText('Alt text for image 1')
    await user.clear(alt)
    await user.type(alt, 'Desk with sketches{Enter}')
    expect(images()[0].alt).toBe('Desk with sketches')
    expect(card('w-gallery').getByAltText('Desk with sketches')).toBeInTheDocument()
    const caption = settings().getByLabelText('Caption for image 1')
    await user.clear(caption)
    await user.type(caption, 'Workspace')
    expect(images()[0].caption).toBe('Colour study') // not committed until blur or Enter
    await user.tab()
    expect(images()[0].caption).toBe('Workspace')
    expect(card('w-gallery').getByText('Workspace')).toBeInTheDocument()
    expect(images()[0].id).toBe('img-1') // stable id
  })

  it('adds images with fresh stable ids and removes them', async () => {
    const user = await open()
    await select(user, 'Inspiration')
    await user.click(settings().getByRole('button', { name: 'Add image' }))
    await user.click(settings().getByRole('button', { name: 'Add image' }))
    expect(images()).toHaveLength(3)
    expect(new Set(images().map((i) => i.id)).size).toBe(3)
    expect(images()[1].id).toMatch(/^img-[0-9a-f]{12}$/)
    expect(images().every((i) => ['aurora', 'workspace', 'mountain', 'studio', 'forest', 'city'].includes(i.assetKey))).toBe(true)
    expect(settings().getAllByText(/Describe the picture for screen readers/)).toHaveLength(2)
    await user.click(settings().getByRole('button', { name: 'Remove image 1' }))
    expect(images().map((i) => i.id)).not.toContain('img-1')
    expect(images()).toHaveLength(2)
  })

  it('only offers the bundled pictures and rejects anything else', async () => {
    const user = await open()
    await select(user, 'Inspiration')
    const options = within(settings().getByLabelText('Picture for image 1')).getAllByRole('option').map((o) => (o as HTMLOptionElement).value)
    expect(options).toEqual(['aurora', 'workspace', 'mountain', 'studio', 'forest', 'city'])
    const result = editor().apply((c) => ({ ok: true, config: { ...c, sections: c.sections.map((s) => ({ ...s, widgets: s.widgets.map((w) => (w.id === 'w-gallery' ? { ...w, props: { items: [{ id: 'img-1', assetKey: 'https://evil.test/x.png', alt: '', caption: '' }] } } : w)) })) } }))
    expect(result.status).toBe('rejected') // the store refuses an asset key outside the allowlist
    expect(images()[0].assetKey).toBe('aurora')
  })

  it('changes persist after Save, log out and log in; Cancel reverses them', async () => {
    const user = await open()
    await select(user, 'Inspiration')
    await user.selectOptions(settings().getByLabelText('Picture for image 1'), 'city')
    await user.click(settings().getByRole('button', { name: 'Add image' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.click(screen.getByRole('button', { name: 'Discard changes' }))
    expect(images()).toEqual(config.sections[0].widgets[0].props!.items)

    await select(user, 'Inspiration')
    await user.selectOptions(settings().getByLabelText('Picture for image 1'), 'city')
    const alt = settings().getByLabelText('Alt text for image 1')
    await user.clear(alt)
    await user.type(alt, 'Skyline{Enter}')
    await user.click(settings().getByRole('button', { name: 'Add image' }))
    const expected = images()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await saved()
    await logOutAndIn(user)
    await screen.findByAltText('Skyline')
    expect(images()).toEqual(expected)
  })
})

describe('Analytics inspector', () => {
  it('shows proportional bars that follow edits live', async () => {
    const user = await open()
    expect(widths()).toEqual(['100%', '25%'])
    await select(user, 'Key metrics')
    const value = settings().getByLabelText('Value for metric 2')
    await user.clear(value)
    await user.type(value, '100')
    expect(metrics()[1].value).toBe(100)
    expect(widths()).toEqual(['100%', '50%'])
    expect(card('w-analytics').getByText('100')).toBeInTheDocument()
  })

  it('renames a metric on commit and refuses an empty label', async () => {
    const user = await open()
    await select(user, 'Key metrics')
    const label = settings().getByLabelText('Label for metric 1')
    await user.clear(label)
    await user.type(label, 'Page views{Enter}')
    expect(metrics()[0]).toEqual({ id: 'm-1', label: 'Page views', value: 200 })
    await user.clear(settings().getByLabelText('Label for metric 1'))
    await user.tab()
    expect(metrics()[0].label).toBe('Page views')
    expect(settings().getByRole('alert')).toHaveTextContent('needs a label')
    expect(settings().getByLabelText('Label for metric 1')).toHaveValue('Page views')
  })

  it('rejects non-numeric and non-finite values without touching the draft', async () => {
    const user = await open()
    await select(user, 'Key metrics')
    const before = editor().draftConfig
    const value = settings().getByLabelText('Value for metric 1')
    for (const bad of ['abc', 'Infinity', '']) {
      await user.clear(value)
      if (bad) await user.type(value, bad)
      expect(settings().getByRole('alert')).toHaveTextContent('Enter a number')
    }
    await user.clear(value)
    await user.paste('1e999') // overflows to Infinity in a single edit
    expect(settings().getByRole('alert')).toHaveTextContent('Enter a number')
    expect(editor().draftConfig).toBe(before)
    expect(selectIsDirty(editor())).toBe(false)
  })

  it('adds and removes metrics with stable ids', async () => {
    const user = await open()
    await select(user, 'Key metrics')
    await user.click(settings().getByRole('button', { name: 'Add metric' }))
    expect(metrics()).toHaveLength(3)
    expect(metrics()[2]).toMatchObject({ label: 'New metric', value: 0 })
    expect(metrics()[2].id).toMatch(/^metric-[0-9a-f]{12}$/)
    expect(widths()).toEqual(['100%', '25%', '0%'])
    await user.click(settings().getByRole('button', { name: 'Remove metric 1' }))
    expect(metrics().map((m) => m.id)).not.toContain('m-1')
    expect(widths()).toEqual(['100%', '0%']) // re-scaled to the new maximum
  })

  it('changes persist after Save, log out and log in', async () => {
    const user = await open()
    await select(user, 'Key metrics')
    const value = settings().getByLabelText('Value for metric 1')
    await user.clear(value)
    await user.type(value, '12.5')
    await user.click(settings().getByRole('button', { name: 'Add metric' }))
    const expected = metrics()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await saved()
    await logOutAndIn(user)
    await screen.findByText('12.5')
    expect(metrics()).toEqual(expected)
  })
})

describe('Preview', () => {
  it('shows the widgets without any editing controls', async () => {
    const user = await open()
    await user.click(screen.getByRole('button', { name: 'Preview' }))
    expect(screen.queryByRole('button', { name: 'Add image' })).not.toBeInTheDocument()
    expect(card('w-gallery').getByAltText('Aurora')).toBeInTheDocument()
    expect(widths()).toEqual(['100%', '25%'])
  })
})
