import { useId, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'

export interface TabDefinition {
  id: string
  label: string
  content: ReactNode
}

/** Accessible tabs: roving tabindex, Left/Right/Home/End, tab/panel association. */
export default function Tabs({ label, tabs }: { label: string; tabs: TabDefinition[] }) {
  const base = useId()
  const [active, setActive] = useState(tabs[0]?.id)
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})

  function move(index: number) {
    const next = tabs[(index + tabs.length) % tabs.length]
    setActive(next.id)
    refs.current[next.id]?.focus()
  }

  function onKeyDown(event: KeyboardEvent, index: number) {
    const keys: Record<string, number> = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: tabs.length - 1 }
    if (event.key in keys) {
      event.preventDefault()
      move(keys[event.key])
    }
  }

  return (
    <div>
      <div role="tablist" aria-label={label} className="flex gap-1 border-b border-ui-border">
        {tabs.map((tab, index) => {
          const selected = tab.id === active
          return (
            <button
              key={tab.id}
              ref={(el) => { refs.current[tab.id] = el }}
              role="tab"
              id={`${base}-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`${base}-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(tab.id)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={`ui-focus -mb-px rounded-t-ui-control border-b-2 px-3 py-2 text-sm font-medium [@media(pointer:coarse)]:min-h-11 ${
                selected ? 'border-ui-primary text-ui-selected-text' : 'border-transparent text-ui-muted hover:text-ui-text'
              }`}
            >
              {tab.label}
            </button>
          )
        })}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`${base}-panel-${tab.id}`}
          aria-labelledby={`${base}-tab-${tab.id}`}
          hidden={tab.id !== active}
          className="pt-4"
        >
          {tab.id === active && tab.content}
        </div>
      ))}
    </div>
  )
}
