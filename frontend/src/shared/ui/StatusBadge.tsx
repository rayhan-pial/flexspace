import type { ReactNode } from 'react'

type StatusTone ='neutral' | 'success' | 'warning' | 'danger'

const TONES: Record<StatusTone, { box: string; dot: string }> = {
  neutral: { box: 'bg-ui-subtle text-ui-text', dot: 'bg-ui-muted' },
  success: { box: 'bg-green-50 text-ui-success', dot: 'bg-ui-success' },
  warning: { box: 'bg-amber-50 text-ui-warning', dot: 'bg-ui-warning' },
  danger: { box: 'bg-red-50 text-ui-danger', dot: 'bg-ui-danger' },
}

/** A short state label. The text always carries the meaning; the dot is decoration. */
export default function StatusBadge({ tone = 'neutral', children }: { tone?: StatusTone; children: ReactNode }) {
  const { box, dot } = TONES[tone]
  return (
    <span className={`inline-flex items-center gap-2 rounded-ui-control px-3 py-1 text-sm font-medium ${box}`}>
      <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${dot}`} />
      {children}
    </span>
  )
}
