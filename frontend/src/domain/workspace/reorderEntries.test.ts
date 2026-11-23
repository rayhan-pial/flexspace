import { describe, expect, it } from 'vitest'
import type { Command } from './commands'
import { monthWeeks } from './dates'
import { deepFreeze } from './immutable'
import { parseWorkspaceConfig } from './parse'
import { listKeyOf, moveListItem, TRANSFERABLE_KINDS } from './reorder'
import type { CalendarEvent, Metric, WorkspaceConfig } from './types'

const metric = (id: string, label: string, value: number): Metric => ({ id, label, value })
const event = (id: string, date: string, title: string): CalendarEvent => ({ id, date, title })

function sample(): WorkspaceConfig {
  const parsed = parseWorkspaceConfig({
    schemaVersion: 1,
    title: 'Entries',
    sections: [
      {
        id: 's1', kind: 'stack', title: 'Main',
        widgets: [
          { id: 'anA', type: 'analytics', props: { metrics: [metric('m1', 'Visits', 300), metric('m2', 'Signups', 120), metric('m3', 'Churn', 4)] } },
          { id: 'anB', type: 'analytics', props: { metrics: [metric('m4', 'Revenue', 900)] } },
          { id: 'anE', type: 'analytics', props: { metrics: [] } },
          {
            id: 'cA', type: 'calendar',
            // Deliberately not in date order: the agenda is the stored array.
            props: { displayMonth: '2026-03', events: [event('e1', '2026-03-20', 'Launch'), event('e2', '2026-03-05', 'Kick-off'), event('e3', '2026-03-12', 'Review')] },
          },
          { id: 'cB', type: 'calendar', props: { displayMonth: '2026-03', events: [event('e4', '2026-03-30', 'Retro')] } },
          { id: 'tk', type: 'tasks', props: { items: [{ id: 't1', text: 'x', done: false }] } },
        ],
      },
    ],
  })
  if (!parsed.ok) throw new Error(parsed.message)
  return deepFreeze(parsed.config)
}

function run(command: Command, from = sample()): WorkspaceConfig {
  const result = command(from)
  if (!result.ok) throw new Error(result.error)
  const parsed = parseWorkspaceConfig(result.config)
  expect(parsed.ok).toBe(true)
  if (parsed.ok) expect(parsed.config).toEqual(result.config)
  return result.config
}
const refusal = (command: Command, from = sample()) => {
  const result = command(from)
  expect(result.ok).toBe(false)
  return result.ok ? '' : result.error
}
const widget = (config: WorkspaceConfig, id: string) => config.sections[0].widgets.find((w) => w.id === id)!
const metricIds = (config: WorkspaceConfig, id: string) => (widget(config, id).props.metrics as Metric[]).map((m) => m.id)
const eventIds = (config: WorkspaceConfig, id: string) => (widget(config, id).props.events as CalendarEvent[]).map((e) => e.id)

describe('which kinds may leave their widget', () => {
  it('only task rows and gallery tiles are transferable; metrics and agenda entries are scoped to their widget', () => {
    expect([...TRANSFERABLE_KINDS].sort()).toEqual(['gallery', 'tasks'])
    expect(listKeyOf('analytics')).toBe('metrics')
    expect(listKeyOf('calendar')).toBe('events')
    expect(listKeyOf('tasks')).toBe('items')
  })
})

describe('metrics: reorder within one Analytics widget', () => {
  it('moves a card, keeping every metric unchanged and the array as the single source of order', () => {
    const config = run(moveListItem('analytics', 'm1', 'anA', 2))
    expect(metricIds(config, 'anA')).toEqual(['m2', 'm3', 'm1'])
    expect(widget(config, 'anA').props.metrics).toEqual([metric('m2', 'Signups', 120), metric('m3', 'Churn', 4), metric('m1', 'Visits', 300)])
    expect(metricIds(run(moveListItem('analytics', 'm3', 'anA', 0)), 'anA')).toEqual(['m3', 'm1', 'm2'])
  })
  it('is a no-op for the current position, clamps indices and shares everything untouched', () => {
    const before = sample()
    const same = moveListItem('analytics', 'm2', 'anA', 1)(before)
    expect(same.ok && same.config).toBe(before)
    expect(metricIds(run(moveListItem('analytics', 'm1', 'anA', 99)), 'anA')).toEqual(['m2', 'm3', 'm1'])
    const moved = run(moveListItem('analytics', 'm1', 'anA', 2), before)
    expect(widget(moved, 'anB')).toBe(widget(before, 'anB'))
    expect(widget(moved, 'cA')).toBe(widget(before, 'cA'))
  })
  it('refuses any move into another Analytics widget, including an empty one', () => {
    expect(refusal(moveListItem('analytics', 'm1', 'anB', 0))).toMatch(/only be reordered within their own widget/)
    expect(refusal(moveListItem('analytics', 'm4', 'anE', 0))).toMatch(/only be reordered within their own widget/)
    expect(refusal(moveListItem('analytics', 'm1', 'anE', 0))).toMatch(/only be reordered within their own widget/)
  })
  it('never mixes types: not into a calendar, a tasks widget or a missing widget', () => {
    expect(refusal(moveListItem('analytics', 'm1', 'cA', 0))).toMatch(/only be moved into another analytics widget/)
    expect(refusal(moveListItem('analytics', 'm1', 'tk', 0))).toMatch(/only be moved into another analytics widget/)
    expect(refusal(moveListItem('analytics', 'm1', 'nope', 0))).toMatch(/only be moved into another analytics widget/)
    expect(refusal(moveListItem('analytics', 'e1', 'anA', 0))).toMatch(/not found in any analytics/) // an event id is not a metric
    expect(refusal(moveListItem('analytics', 'm1', 'constructor', 0))).toMatch(/only be moved into another analytics widget/)
  })
})

describe('agenda: reorder within one Calendar widget', () => {
  it('moves an entry and the agenda order is exactly the saved array order, not date order', () => {
    const config = run(moveListItem('calendar', 'e3', 'cA', 0))
    expect(eventIds(config, 'cA')).toEqual(['e3', 'e1', 'e2'])
    expect((widget(config, 'cA').props.events as CalendarEvent[]).map((e) => e.date)).toEqual(['2026-03-12', '2026-03-20', '2026-03-05']) // not sorted
  })
  it('leaves the display month and the chronological day cells alone', () => {
    const before = sample()
    const config = run(moveListItem('calendar', 'e2', 'cA', 2), before)
    expect(widget(config, 'cA').props.displayMonth).toBe('2026-03')
    expect(monthWeeks(widget(config, 'cA').props.displayMonth as string)).toEqual(monthWeeks('2026-03'))
    const days = monthWeeks('2026-03').flat().filter((c) => c !== null).map((c) => c!.date)
    expect(days).toEqual([...days].sort())
  })
  it('refuses any move into another Calendar, and never mixes types', () => {
    expect(refusal(moveListItem('calendar', 'e1', 'cB', 0))).toMatch(/only be reordered within their own widget/)
    expect(refusal(moveListItem('calendar', 'e4', 'cA', 0))).toMatch(/only be reordered within their own widget/)
    expect(refusal(moveListItem('calendar', 'e1', 'anA', 0))).toMatch(/only be moved into another calendar widget/)
    expect(refusal(moveListItem('calendar', 'm1', 'cA', 0))).toMatch(/not found in any calendar/)
  })
})

describe('reordering never loses or duplicates an entry', () => {
  it('keeps every metric and event exactly once across arbitrary sequences of moves', () => {
    let config = sample()
    const metrics = ['m1', 'm2', 'm3', 'm4']
    const events = ['e1', 'e2', 'e3', 'e4']
    const all = (c: WorkspaceConfig) => ({
      metrics: ['anA', 'anB', 'anE'].flatMap((id) => metricIds(c, id)).sort(),
      events: ['cA', 'cB'].flatMap((id) => eventIds(c, id)).sort(),
    })
    const moves: Array<[Parameters<typeof moveListItem>[0], string, string, number]> = [
      ['analytics', 'm1', 'anA', 2], ['analytics', 'm3', 'anA', 0], ['analytics', 'm2', 'anA', 1], ['calendar', 'e1', 'cA', 2], ['calendar', 'e3', 'cA', 0],
      ['analytics', 'm1', 'anB', 0], ['calendar', 'e2', 'cB', 0], ['calendar', 'e2', 'cA', 1],
    ]
    for (const [kind, id, to, index] of moves) {
      const result = moveListItem(kind, id, to, index)(config)
      if (result.ok) config = run(moveListItem(kind, id, to, index), config)
      expect(all(config)).toEqual({ metrics, events })
    }
  })
})
