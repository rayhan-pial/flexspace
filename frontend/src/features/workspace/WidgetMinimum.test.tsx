import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import WelcomeWidget from '../../widgets/welcome/WelcomeWidget'
import WidgetShell, { COMPACT_CARD_HEIGHT } from './WidgetShell'

/* UI-025: the smallest (2-row, 80px) card tightens its chrome, and Welcome scrolls instead of clipping. */

let callbacks: Array<() => void> = []
let height = 80

class FakeResizeObserver {
  constructor(callback: () => void) {
    callbacks.push(callback)
  }
  observe() {}
  disconnect() {}
}

beforeEach(() => {
  callbacks = []
  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ height, width: 200, top: 0, left: 0, right: 200, bottom: height, x: 0, y: 0, toJSON: () => ({}) }))
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function card(greeting = 'Welcome back', subtitle = 'Supporting text') {
  return render(
    <WidgetShell widgetId="w1" title="Welcome" mode="edit" selected={false} appearance={{}} onSelect={() => {}}>
      <WelcomeWidget widgetId="w1" title="Welcome" props={{ greeting, subtitle }} mode="edit" onChangeProps={() => {}} dispatch={() => ({ ok: true })} />
    </WidgetShell>,
  )
}
const resize = (next: number) => {
  height = next
  act(() => callbacks.forEach((callback) => callback()))
}

describe('widget chrome at the smallest size', () => {
  it('tightens when the card is shorter than the threshold and relaxes when it grows', () => {
    card()
    const article = screen.getByRole('article', { name: 'Welcome' })
    resize(80)
    expect(article).toHaveAttribute('data-compact', 'true')
    expect(article.className).toContain('data-[compact=true]:p-2')
    resize(COMPACT_CARD_HEIGHT + 20)
    expect(article).not.toHaveAttribute('data-compact')
  })

  it('Welcome never hides content with overflow: it scrolls, steps its type down in compact cards and keeps newlines', () => {
    const { container } = card('Line one\nLine two', 'A\nB')
    const body = container.querySelector('[data-welcome-accent]') as HTMLElement
    expect(body.className).toContain('overflow-y-auto')
    expect(body.className).not.toContain('overflow-hidden')
    const greeting = screen.getByText(/Line one/)
    expect(greeting.className).toContain('whitespace-pre-line')
    expect(greeting.className).toContain('group-data-[compact=true]:text-base')
    expect(screen.getByText(/^A/).className).toContain('group-data-[compact=true]:text-xs')
    expect(greeting.parentElement?.className).toContain('my-auto') // centered when short, top-aligned (reachable) when long
  })

  it('renders every character as text, never as markup, and the empty state stays visible', () => {
    const { container } = card('<b>x</b>', '')
    expect(container.querySelector('b')).toBeNull()
    expect(screen.getByText('<b>x</b>')).toBeInTheDocument()
  })
})
