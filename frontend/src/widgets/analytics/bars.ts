export const formatValue = (value: number): string => value.toLocaleString('en-US', { maximumFractionDigits: 2 })

/** Bar length as a whole percentage of the largest value. Negative or zero values draw no bar. */
export function barPercent(value: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0 || value <= 0) return 0
  return Math.min(100, Math.max(0, Math.round((value / max) * 100)))
}
