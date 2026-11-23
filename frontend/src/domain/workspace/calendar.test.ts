import { describe, expect, it } from 'vitest'
import { addEvent, removeEvent, setDisplayMonth, updateEvent } from './calendar'
import type { Command } from './commands'
import { MAX_LABEL, MAX_LIST_ITEMS } from './constants'
import { formatDate, isDate, isMonth, joinMonth, monthTitle, monthWeeks, shiftMonth } from './dates'
import { deepFreeze } from './immutable'
import { parseWorkspaceConfig } from './parse'
import type { CalendarEvent, WorkspaceConfig } from './types'

function sample(): WorkspaceConfig {
  const parsed = parseWorkspaceConfig({
    schemaVersion: 1,
    title: 'C',
    sections: [
      {
        id: 's1', kind: 'stack', title: 'Main',
        widgets: [
          {
            id: 'cal', type: 'calendar',
            props: { displayMonth: '2026-03', events: [{ id: 'e2', date: '2026-04-02', title: 'Later' }, { id: 'e1', date: '2026-03-05', title: 'Earlier' }] },
          },
          { id: 'note', type: 'notes' },
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
const calendar = (config: WorkspaceConfig) => config.sections[0].widgets[0].props as { displayMonth: string; events: CalendarEvent[] }

describe('date helpers', () => {
  it('validates months and real dates inside the supported years', () => {
    expect(isMonth('2026-03')).toBe(true)
    for (const bad of ['2026-13', '2026-00', '1899-12', '2200-01', '2026-3', '', 5, null]) expect(isMonth(bad)).toBe(false)
    expect(isDate('2024-02-29')).toBe(true)
    for (const bad of ['2026-02-29', '2026-04-31', '2026-02-30', '2026-13-01', '1899-01-01', '2026-1-1', '2026-03-05T00:00', '']) expect(isDate(bad)).toBe(false)
  })
  it('shifts months across year boundaries and refuses to leave the supported range', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2026-03', 0)).toBe('2026-03')
    expect(shiftMonth('2026-03', -15)).toBe('2024-12')
    expect(shiftMonth('1900-01', -1)).toBeNull()
    expect(shiftMonth('2199-12', 1)).toBeNull()
    expect(joinMonth(900, 5)).toBe('0900-05')
  })
  it('lays months out chronologically, Sunday first, with leading and trailing blanks', () => {
    const weeks = monthWeeks('2026-02') // 1 Feb 2026 is a Sunday; 28 days
    expect(weeks).toHaveLength(4)
    expect(weeks[0][0]).toEqual({ date: '2026-02-01', day: 1 })
    expect(weeks[3][6]).toEqual({ date: '2026-02-28', day: 28 })
    const march = monthWeeks('2026-03') // starts on a Sunday too
    expect(march.flat().filter(Boolean)).toHaveLength(31)
    const may = monthWeeks('2026-05') // starts on a Friday
    expect(may[0].slice(0, 5).every((c) => c === null)).toBe(true)
    expect(may[0][5]!.date).toBe('2026-05-01')
    for (const week of may) expect(week).toHaveLength(7)
    const days = may.flat().filter((c): c is { date: string; day: number } => c !== null).map((c) => c.date)
    expect(days).toEqual([...days].sort())
    expect(monthWeeks('2024-02').flat().filter(Boolean)).toHaveLength(29) // leap year
  })
  it('formats independent of locale or time zone', () => {
    expect(monthTitle('2026-03')).toBe('March 2026')
    expect(formatDate('2026-01-05')).toBe('Jan 5, 2026')
    expect(formatDate('2026-12-31')).toBe('Dec 31, 2026')
  })
})

describe('calendar commands', () => {
  it('adds an event at the end of the stored order without sorting', () => {
    const config = run(addEvent('cal', 'new-1', '2026-01-01', '  Kick-off  '))
    expect(calendar(config).events.map((e) => e.id)).toEqual(['e2', 'e1', 'new-1']) // array order is kept, not date order
    expect(calendar(config).events.at(-1)).toEqual({ id: 'new-1', date: '2026-01-01', title: 'Kick-off' })
  })
  it('rejects impossible dates, empty or long titles, reused ids, the limit and other widgets', () => {
    for (const date of ['2026-02-30', '2026-13-01', '1899-01-01', '', 'tomorrow']) expect(refusal(addEvent('cal', 'x', date, 'T'))).toMatch(/real date/)
    expect(refusal(addEvent('cal', 'x', '2026-01-01', '  '))).toMatch(/needs a title/)
    expect(refusal(addEvent('cal', 'x', '2026-01-01', 'a'.repeat(MAX_LABEL + 1)))).toMatch(/at most/)
    for (const used of ['e1', 'cal', 's1']) expect(refusal(addEvent('cal', used, '2026-01-01', 'T'))).toMatch(/already in use/)
    expect(refusal(addEvent('note', 'x', '2026-01-01', 'T'))).toMatch(/not a calendar/)
    let config = sample()
    for (let n = calendar(config).events.length; n < MAX_LIST_ITEMS; n += 1) config = run(addEvent('cal', `f${n}`, '2026-01-01', 'F'), config)
    expect(refusal(addEvent('cal', 'over', '2026-01-01', 'F'), config)).toMatch(/at most 100/)
  })
  it('updates date and title by id, keeping position and id', () => {
    const config = run(updateEvent('cal', 'e2', { date: '2026-03-20', title: ' Moved ' }))
    expect(calendar(config).events).toEqual([{ id: 'e2', date: '2026-03-20', title: 'Moved' }, calendar(sample()).events[1]])
    expect(refusal(updateEvent('cal', 'e1', { date: '2026-02-31' }))).toMatch(/real date/)
    expect(refusal(updateEvent('cal', 'e1', { title: '' }))).toMatch(/needs a title/)
    expect(refusal(updateEvent('cal', 'nope', { title: 'x' }))).toMatch(/not found/)
    const before = sample()
    const same = updateEvent('cal', 'e1', { date: '2026-03-05', title: 'Earlier' })(before)
    expect(same.ok && same.config).toBe(before)
  })
  it('removes by id and frees the id', () => {
    const config = run(removeEvent('cal', 'e2'))
    expect(calendar(config).events.map((e) => e.id)).toEqual(['e1'])
    expect(refusal(removeEvent('cal', 'nope'))).toMatch(/not found/)
  })
  it('sets the saved display month, validating it and ignoring no-ops', () => {
    expect(calendar(run(setDisplayMonth('cal', '2027-11'))).displayMonth).toBe('2027-11')
    for (const bad of ['2026-13', '2026-3', '1899-12', '', '2026-03-01']) expect(refusal(setDisplayMonth('cal', bad))).toMatch(/between 1900 and 2199/)
    expect(refusal(setDisplayMonth('note', '2026-03'))).toMatch(/not a calendar/)
    expect(refusal(setDisplayMonth('missing', '2026-03'))).toMatch(/not found/)
    const before = sample()
    const same = setDisplayMonth('cal', '2026-03')(before)
    expect(same.ok && same.config).toBe(before)
  })
})
