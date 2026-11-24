import { useId } from 'react'
import type { ReactNode } from 'react'

/** A labelled group of related inspector controls (a region named by its heading). */
export default function Group({ title, children }: { title: string; children: ReactNode }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="mt-4 border-t border-ui-border pt-3">
      <h4 id={id} className="mb-3 text-xs font-semibold uppercase tracking-wide text-ui-muted">{title}</h4>
      <div className="space-y-4">{children}</div>
    </section>
  )
}
