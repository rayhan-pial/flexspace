/*
 * Calendar date helpers. Dates are plain `YYYY-MM-DD` strings and months `YYYY-MM`; all arithmetic
 * is done in UTC so the result never depends on the viewer's time zone. The accepted range matches
 * the schema (years 1900 to 2199).
 */

export const MIN_YEAR = 1900
export const MAX_YEAR = 2199

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December',
] as const

const MONTH_RE = /^(19|20|21)[0-9]{2}-(0[1-9]|1[0-2])$/
const DATE_RE = /^(19|20|21)[0-9]{2}-[0-9]{2}-[0-9]{2}$/

export const isMonth = (value: unknown): value is string => typeof value === 'string' && MONTH_RE.test(value)

/** A real calendar date (no 2026-02-31), inside the supported years. */
export function isDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  const real = new Date(Date.UTC(y, m - 1, d))
  return real.getUTCFullYear() === y && real.getUTCMonth() === m - 1 && real.getUTCDate() === d
}

export const monthOf = (date: string): string => date.slice(0, 7)

export const splitMonth = (month: string): { year: number; month: number } => ({
  year: Number(month.slice(0, 4)),
  month: Number(month.slice(5, 7)),
})

export const joinMonth = (year: number, month: number): string => `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`

/** The month `delta` months away, or `null` when that leaves the supported years. */
export function shiftMonth(month: string, delta: number): string | null {
  const { year, month: m } = splitMonth(month)
  const index = year * 12 + (m - 1) + delta
  const nextYear = Math.floor(index / 12)
  if (nextYear < MIN_YEAR || nextYear > MAX_YEAR) return null
  return joinMonth(nextYear, (index % 12) + 1)
}

export interface DayCell { date: string; day: number }

/** The month as weeks of seven cells, Sunday first; days outside the month are `null`. */
export function monthWeeks(month: string): Array<Array<DayCell | null>> {
  const { year, month: m } = splitMonth(month)
  const leading = new Date(Date.UTC(year, m - 1, 1)).getUTCDay()
  const days = new Date(Date.UTC(year, m, 0)).getUTCDate()
  const cells: Array<DayCell | null> = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: days }, (_, n) => ({ date: `${month}-${String(n + 1).padStart(2, '0')}`, day: n + 1 })),
  ]
  while (cells.length % 7 !== 0) cells.push(null)
  return Array.from({ length: cells.length / 7 }, (_, week) => cells.slice(week * 7, week * 7 + 7))
}

/** "March 2026" */
export function monthTitle(month: string): string {
  const { year, month: m } = splitMonth(month)
  return `${MONTH_NAMES[m - 1]} ${year}`
}

/** "Jan 5, 2026", independent of the viewer's time zone and locale. */
export function formatDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return `${MONTH_NAMES[m - 1].slice(0, 3)} ${d}, ${y}`
}
