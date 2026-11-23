import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseWorkspaceConfig } from '../../domain/workspace/parse'
import { stubViewport } from '../../test/viewport'
import InspectorPanel from '../editor/InspectorPanel'
import { selectIsDirty, useEditorStore } from '../editor/editorStore'
import WorkspaceView from '../workspace/WorkspaceView'
import { listContainerId, transferTargets, workspaceAdapter } from './workspaceAdapter'

/* @dnd-kit is stubbed as in SortProvider.test.tsx; real pointer gestures run in e2e/entries-sorting.mjs. */
type Operation = { operation: { source: unknown; target: unknown }; canceled?: boolean }
type Handlers = { onDragStart?: (event: Operation) => void; onDragOver?: (event: Operation) => void; onDragEnd?: (event: Operation) => void }
const provider: { current: Handlers } = { current: {} }

vi.mock('@dnd-kit/react', () => ({
  DragDropProvider: ({ children, onDragStart, onDragOver, onDragEnd }: Handlers & { children: ReactNode }) => {
    provider.current = { onDragStart, onDragOver, onDragEnd }
    return <>{children}</>
  },
  useDroppable: () => ({ ref: () => {}, isDropTarget: false }),
}))
vi.mock('@dnd-kit/react/sortable', () => ({
  useSortable: () => ({ ref: () => {}, handleRef: () => {}, isDragging: false }),
}))
vi.mock('@dnd-kit/dom/sortable', () => ({ SortableKeyboardPlugin: class {} }))

const editor = () => useEditorStore.getState()

function load() {
  const parsed = parseWorkspaceConfig({
    schemaVersion: 1,
    title: 'Entries',
    sections: [
      {
        id: 's1', kind: 'stack', title: 'Main',
        widgets: [
          { id: 'anA', type: 'analytics', title: 'KPIs', props: { metrics: [{ id: 'm1', label: 'Visits', value: 400 }, { id: 'm2', label: 'Signups', value: 100 }, { id: 'm3', label: 'Churn', value: 20 }] } },
          { id: 'anB', type: 'analytics', title: 'Other KPIs', props: { metrics: [{ id: 'm4', label: 'Revenue', value: 50 }] } },
          { id: 'anE', type: 'analytics', title: 'No KPIs', props: { metrics: [] } },
          {
            id: 'cA', type: 'calendar', title: 'Plan',
            props: { displayMonth: '2026-03', events: [{ id: 'e1', date: '2026-03-20', title: 'Launch' }, { id: 'e2', date: '2026-03-05', title: 'Kick-off' }, { id: 'e3', date: '2026-03-12', title: 'Review' }] },
          },
          { id: 'cB', type: 'calendar', title: 'Other plan', props: { displayMonth: '2026-03', events: [{ id: 'e4', date: '2026-03-30', title: 'Retro' }] } },
        ],
      },
    ],
  })
  if (!parsed.ok) throw new Error(parsed.message)
  editor().load({ ownerId: 'u', workspaceId: 'w', revision: 1, config: parsed.config })
}

const widget = (id: string) => editor().draftConfig!.sections[0].widgets.find((w) => w.id === id)!
const metricIds = (id: string) => (widget(id).props.metrics as Array<{ id: string }>).map((m) => m.id)
const eventIds = (id: string) => (widget(id).props.events as Array<{ id: string }>).map((e) => e.id)
const card = (id: string) => within(document.querySelector(`[data-widget-id="${id}"]`) as HTMLElement)

const drawnMetrics = (title: string) => within(screen.getByRole('list', { name: `${title} metrics` })).queryAllByRole('button', { name: /^Reorder metric / }).map((b) => b.getAttribute('aria-label')!.replace('Reorder metric ', ''))
const drawnEvents = (title: string) => within(screen.getByRole('list', { name: `${title} agenda` })).queryAllByRole('button', { name: /^Reorder event / }).map((b) => b.getAttribute('aria-label')!.replace('Reorder event ', ''))
const barWidths = (widgetId: string) => [...document.querySelectorAll(`[data-widget-id="${widgetId}"] [data-bar]`)].map((el) => (el as HTMLElement).style.width)
const agendaTexts = (widgetId: string) => card(widgetId).getAllByRole('time').map((t) => t.textContent)
const dayNumbers = (widgetId: string) => within(card(widgetId).getByRole('table')).getAllByRole('cell').map((c) => c.textContent?.match(/^\d+/)?.[0]).filter(Boolean)

const metricItem = (id: string, widgetId: string) => ({ id, data: { itemId: id, containerId: listContainerId('analytics', widgetId), itemType: 'metric' } })
const eventItem = (id: string, widgetId: string) => ({ id, data: { itemId: id, containerId: listContainerId('calendar', widgetId), itemType: 'event' } })
const container = (containerId: string, itemType: string) => ({ id: containerId, data: { kind: 'container', containerId, itemType } })

const start = (source: unknown) => act(() => provider.current.onDragStart!({ operation: { source, target: null } }))
const hover = (source: unknown, target: unknown) => act(() => provider.current.onDragOver!({ operation: { source, target } }))
const end = (source: unknown, target: unknown, canceled = false) => act(() => provider.current.onDragEnd!({ canceled, operation: { source, target } }))

beforeEach(() => {
  useEditorStore.setState(useEditorStore.getInitialState(), true)
  stubViewport(true)
  load()
})

describe('metrics', () => {
  it('every card has a grip in Edit and none in Preview', () => {
    render(<WorkspaceView />)
    expect(drawnMetrics('KPIs')).toEqual(['Visits', 'Signups', 'Churn'])
    act(() => editor().setMode('preview'))
    expect(screen.queryByRole('button', { name: /^Reorder metric / })).not.toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'KPIs metrics' })).getAllByRole('listitem')).toHaveLength(3)
  })

  it('the visual KPI and bar order follow the saved array after a reorder, with bars still scaled to the largest value', () => {
    render(<WorkspaceView />)
    expect(barWidths('anA')).toEqual(['100%', '25%', '5%'])
    start(metricItem('m3', 'anA'))
    hover(metricItem('m3', 'anA'), metricItem('m1', 'anA'))
    expect(drawnMetrics('KPIs')).toEqual(['Churn', 'Visits', 'Signups']) // the live preview
    expect(metricIds('anA')).toEqual(['m1', 'm2', 'm3']) // nothing committed yet
    end(metricItem('m3', 'anA'), metricItem('m1', 'anA'))
    expect(metricIds('anA')).toEqual(['m3', 'm1', 'm2'])
    expect(barWidths('anA')).toEqual(['5%', '100%', '25%']) // bars follow the new array order
    expect(card('anA').getAllByText(/^\d/).map((n) => n.textContent)).toEqual(['20', '400', '100'])
  })

  it('cancellation and an outside drop restore the initial draft', () => {
    render(<WorkspaceView />)
    const before = editor().draftConfig
    start(metricItem('m1', 'anA'))
    hover(metricItem('m1', 'anA'), metricItem('m3', 'anA'))
    end(metricItem('m1', 'anA'), metricItem('m3', 'anA'), true)
    expect(editor().draftConfig).toBe(before)
    start(metricItem('m1', 'anA'))
    hover(metricItem('m1', 'anA'), metricItem('m3', 'anA'))
    end(metricItem('m1', 'anA'), null)
    expect(editor().draftConfig).toBe(before)
    expect(drawnMetrics('KPIs')).toEqual(['Visits', 'Signups', 'Churn'])
  })

  it('a metric dragged over another Analytics widget (or its empty list) previews nothing and moves nothing', () => {
    render(<WorkspaceView />)
    const before = editor().draftConfig
    start(metricItem('m1', 'anA'))
    hover(metricItem('m1', 'anA'), metricItem('m4', 'anB'))
    hover(metricItem('m1', 'anA'), container(listContainerId('analytics', 'anE'), 'metric'))
    expect(drawnMetrics('Other KPIs')).toEqual(['Revenue'])
    expect(drawnMetrics('No KPIs')).toEqual([])
    expect(drawnMetrics('KPIs')).toEqual(['Visits', 'Signups', 'Churn'])
    end(metricItem('m1', 'anA'), metricItem('m4', 'anB'))
    expect(editor().draftConfig).toBe(before)
    for (const to of ['anB', 'anE']) {
      const request = { itemId: 'm1', fromContainerId: listContainerId('analytics', 'anA'), toContainerId: listContainerId('analytics', to), toIndex: 0 }
      expect(workspaceAdapter.canMove(request)).toBe('These entries can only be reordered within their own widget.')
      expect(workspaceAdapter.commitMove(request).status).toBe('rejected')
    }
  })
})

describe('ending a drag over another widget of the same type', () => {
  it('is an outside drop: the reorder previewed on the way is not committed (metrics and agenda entries)', () => {
    render(<WorkspaceView />)
    // Pretend only the other widgets' lists are under the pointer; the dragged item's own list is elsewhere.
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const id = this.getAttribute('data-container-id') ?? ''
      const near = id === listContainerId('analytics', 'anB') || id === listContainerId('calendar', 'cB')
      return { left: near ? 0 : 1000, right: near ? 500 : 1100, top: 0, bottom: 500, width: 100, height: 100, x: 0, y: 0, toJSON: () => ({}) }
    })
    const before = editor().draftConfig

    start(metricItem('m1', 'anA'))
    hover(metricItem('m1', 'anA'), metricItem('m3', 'anA')) // passes over its own siblings: a reorder is previewed
    expect(drawnMetrics('KPIs')).toEqual(['Signups', 'Churn', 'Visits'])
    act(() => provider.current.onDragEnd!({ canceled: false, operation: { source: metricItem('m1', 'anA'), target: null, position: { current: { x: 50, y: 50 } } } as never }))
    expect(editor().draftConfig).toBe(before)
    expect(drawnMetrics('KPIs')).toEqual(['Visits', 'Signups', 'Churn'])

    start(eventItem('e1', 'cA'))
    hover(eventItem('e1', 'cA'), eventItem('e3', 'cA'))
    act(() => provider.current.onDragEnd!({ canceled: false, operation: { source: eventItem('e1', 'cA'), target: null, position: { current: { x: 50, y: 50 } } } as never }))
    expect(editor().draftConfig).toBe(before)

    // dnd-kit reports the other widget's entry as the target too (the item types match): still an outside drop.
    start(eventItem('e1', 'cA'))
    hover(eventItem('e1', 'cA'), eventItem('e3', 'cA'))
    expect(drawnEvents('Plan')).toEqual(['Kick-off', 'Review', 'Launch'])
    act(() => provider.current.onDragEnd!({ canceled: false, operation: { source: eventItem('e1', 'cA'), target: eventItem('e4', 'cB'), position: { current: { x: 50, y: 50 } } } as never }))
    expect(editor().draftConfig).toBe(before)
    expect(drawnEvents('Plan')).toEqual(['Launch', 'Kick-off', 'Review'])
    vi.restoreAllMocks()
  })
})

describe('calendar agenda', () => {
  it('every agenda entry has a grip in Edit and none in Preview', () => {
    render(<WorkspaceView />)
    expect(drawnEvents('Plan')).toEqual(['Launch', 'Kick-off', 'Review'])
    act(() => editor().setMode('preview'))
    expect(screen.queryByRole('button', { name: /^Reorder event / })).not.toBeInTheDocument()
  })

  it('the agenda follows the saved array order after a reorder, while the day cells stay in date order', () => {
    render(<WorkspaceView />)
    const daysBefore = dayNumbers('cA')
    expect(agendaTexts('cA')).toEqual(['Mar 20, 2026', 'Mar 5, 2026', 'Mar 12, 2026'])
    start(eventItem('e3', 'cA'))
    hover(eventItem('e3', 'cA'), eventItem('e1', 'cA'))
    expect(drawnEvents('Plan')).toEqual(['Review', 'Launch', 'Kick-off'])
    end(eventItem('e3', 'cA'), eventItem('e1', 'cA'))
    expect(eventIds('cA')).toEqual(['e3', 'e1', 'e2'])
    expect(agendaTexts('cA')).toEqual(['Mar 12, 2026', 'Mar 20, 2026', 'Mar 5, 2026']) // array order, not date order
    expect(dayNumbers('cA')).toEqual(daysBefore) // 1..31, chronological
    expect(daysBefore).toEqual(Array.from({ length: 31 }, (_, n) => String(n + 1)))
    expect(widget('cA').props.displayMonth).toBe('2026-03')
  })

  it('Preview shows the same agenda: the saved array order, not date order', () => {
    render(<WorkspaceView />)
    act(() => editor().setMode('preview'))
    expect(agendaTexts('cA')).toEqual(['Mar 20, 2026', 'Mar 5, 2026', 'Mar 12, 2026'])
    expect(dayNumbers('cA')).toEqual(Array.from({ length: 31 }, (_, n) => String(n + 1)))
  })

  it('an entry dragged over another Calendar previews nothing and moves nothing; Escape restores the draft', () => {
    render(<WorkspaceView />)
    const before = editor().draftConfig
    start(eventItem('e1', 'cA'))
    hover(eventItem('e1', 'cA'), eventItem('e4', 'cB'))
    expect(drawnEvents('Other plan')).toEqual(['Retro'])
    end(eventItem('e1', 'cA'), eventItem('e4', 'cB'))
    expect(editor().draftConfig).toBe(before)
    start(eventItem('e1', 'cA'))
    hover(eventItem('e1', 'cA'), eventItem('e3', 'cA'))
    end(eventItem('e1', 'cA'), eventItem('e3', 'cA'), true)
    expect(editor().draftConfig).toBe(before)
    expect(workspaceAdapter.commitMove({ itemId: 'e1', fromContainerId: listContainerId('calendar', 'cA'), toContainerId: listContainerId('calendar', 'cB'), toIndex: 0 }).status).toBe('rejected')
  })

  it('entries never mix with metrics', () => {
    render(<WorkspaceView />)
    const before = editor().draftConfig
    start(eventItem('e1', 'cA'))
    hover(eventItem('e1', 'cA'), container(listContainerId('analytics', 'anE'), 'metric'))
    hover(eventItem('e1', 'cA'), metricItem('m1', 'anA'))
    end(eventItem('e1', 'cA'), metricItem('m1', 'anA'))
    expect(editor().draftConfig).toBe(before)
    expect(workspaceAdapter.canMove({ itemId: 'm1', fromContainerId: listContainerId('analytics', 'anA'), toContainerId: listContainerId('calendar', 'cA'), toIndex: 0 })).toBe('That item cannot be moved there.')
  })
})

describe('Move up and Move down use the same command', () => {
  const properties = (id: string) => {
    act(() => editor().select({ kind: 'widget', id }))
    return render(<InspectorPanel />)
  }
  const body = () => within(document.body)

  it('Analytics: per-metric buttons reorder, disable at the ends, and offer no transfer', async () => {
    const user = userEvent.setup()
    properties('anA')
    expect(body().getByRole('button', { name: 'Move up metric 1' })).toBeDisabled()
    expect(body().getByRole('button', { name: 'Move down metric 3' })).toBeDisabled()
    await user.click(body().getByRole('button', { name: 'Move down metric 1' }))
    expect(metricIds('anA')).toEqual(['m2', 'm1', 'm3'])
    await user.click(body().getByRole('button', { name: 'Move up metric 3' }))
    expect(metricIds('anA')).toEqual(['m2', 'm3', 'm1'])
    expect(body().queryByRole('button', { name: /Move to / })).not.toBeInTheDocument()
  })

  it('Calendar: per-event buttons reorder the agenda and offer no transfer', async () => {
    const user = userEvent.setup()
    properties('cA')
    await user.click(body().getByRole('button', { name: 'Move down event 1' }))
    expect(eventIds('cA')).toEqual(['e2', 'e1', 'e3'])
    await user.click(body().getByRole('button', { name: 'Move up event 3' }))
    expect(eventIds('cA')).toEqual(['e2', 'e3', 'e1'])
    expect(body().queryByRole('button', { name: /Move to / })).not.toBeInTheDocument()
  })

  it('a move by button is one change that Cancel reverses', async () => {
    const user = userEvent.setup()
    properties('anA')
    await user.click(body().getByRole('button', { name: 'Move down metric 1' }))
    expect(selectIsDirty(editor())).toBe(true)
    act(() => {
      editor().cancel()
    })
    expect(metricIds('anA')).toEqual(['m1', 'm2', 'm3'])
  })
})

describe('transfer destinations', () => {
  it('metrics and agenda entries are offered no other widget; tasks and gallery tiles are', () => {
    expect(transferTargets('analytics', 'anA')).toEqual([])
    expect(transferTargets('calendar', 'cA')).toEqual([])
  })
})

describe('the adapter containers', () => {
  it('list the entries of a widget of that type only', () => {
    expect(workspaceAdapter.readItems(listContainerId('analytics', 'anA'))).toEqual(['m1', 'm2', 'm3'])
    expect(workspaceAdapter.readItems(listContainerId('calendar', 'cA'))).toEqual(['e1', 'e2', 'e3'])
    expect(workspaceAdapter.readItems(listContainerId('calendar', 'anA'))).toBeNull()
    expect(workspaceAdapter.readItems(listContainerId('analytics', 'cA'))).toBeNull()
  })
})
