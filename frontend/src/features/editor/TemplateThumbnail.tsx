import type { ReactNode } from 'react'
import type { Section, Widget, WorkspaceConfig } from '../../domain/workspace/types'

const HEX = /^#[0-9a-fA-F]{6}$/
const colour = (value: string, fallback: string) => (HEX.test(value) ? value : fallback)

/** A tiny drawing of one widget type: shapes only, so the thumbnail never contains text or live widgets. */
function Glyph({ type, ink, accent }: { type: string; ink: string; accent: string }): ReactNode {
  const line = (width: string, color = ink, opacity = 0.35) => <span className="block h-[3px] rounded-full" style={{ width, backgroundColor: color, opacity }} />
  switch (type) {
    case 'welcome':
      return <>{line('70%', ink, 0.7)}{line('45%')}</>
    case 'tasks':
      return <>{[0, 1, 2].map((i) => <span key={i} className="flex items-center gap-[3px]"><span className="size-[4px] shrink-0 rounded-[1px]" style={{ backgroundColor: accent }} />{line(`${70 - i * 12}%`)}</span>)}</>
    case 'notes':
      return <>{line('90%')}{line('80%')}{line('55%')}</>
    case 'gallery':
      return <span className="grid grid-cols-2 gap-[2px]">{[0, 1, 2, 3].map((i) => <span key={i} className="h-[7px] rounded-[1px]" style={{ backgroundColor: accent, opacity: 0.35 + i * 0.12 }} />)}</span>
    case 'analytics':
      return <>{[85, 60, 40].map((w) => <span key={w} className="block h-[4px] rounded-full" style={{ width: `${w}%`, backgroundColor: accent }} />)}</>
    case 'calendar':
      return <span className="grid grid-cols-7 gap-[2px]">{Array.from({ length: 14 }, (_, i) => <span key={i} className="size-[3px] rounded-full" style={{ backgroundColor: i === 9 ? accent : ink, opacity: i === 9 ? 1 : 0.25 }} />)}</span>
    default:
      return line('60%')
  }
}

function Cell({ widget, surface, ink, accent }: { widget: Widget; surface: string; ink: string; accent: string }) {
  return (
    <span className="flex min-h-0 flex-col justify-center gap-[3px] overflow-hidden rounded-[3px] p-[4px]" style={{ backgroundColor: surface, boxShadow: `inset 0 0 0 1px ${ink}22` }}>
      <Glyph type={widget.type} ink={ink} accent={accent} />
    </span>
  )
}

function SectionBlock({ section, surface, ink, accent }: { section: Section; surface: string; ink: string; accent: string }) {
  const widgets = section.widgets.filter((widget) => !widget.hidden)
  const rects = new Map((section.layout ?? []).map((rect) => [rect.i, rect]))
  return (
    <div className="min-w-0">
      <span className="mb-[3px] block h-[3px] w-1/3 rounded-full" style={{ backgroundColor: ink, opacity: 0.6 }} />
      {section.kind === 'grid' ? (
        <div className="grid gap-[3px]" style={{ gridTemplateColumns: 'repeat(12, minmax(0, 1fr))', gridAutoRows: '5px' }}>
          {widgets.map((widget) => {
            const rect = rects.get(widget.id)
            return rect ? (
              <span key={widget.id} className="flex min-h-0 min-w-0" style={{ gridColumn: `${rect.x + 1} / span ${rect.w}`, gridRow: `${rect.y + 1} / span ${Math.min(rect.h, 8)}` }}>
                <span className="grid min-w-0 flex-1 [&>span]:min-h-0"><Cell widget={widget} surface={surface} ink={ink} accent={accent} /></span>
              </span>
            ) : null
          })}
        </div>
      ) : (
        <div className="grid gap-[3px]">
          {widgets.map((widget) => (
            <span key={widget.id} className="grid h-[16px]"><Cell widget={widget} surface={surface} ink={ink} accent={accent} /></span>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * A small picture of a template, drawn from its parsed configuration: its colours, where the
 * navigation sits and how the sections and widgets are laid out. Decorative (hidden from assistive
 * technology): the card beside it carries the real name and description.
 */
export default function TemplateThumbnail({ config, className = '' }: { config: WorkspaceConfig; className?: string }) {
  const { theme, navigation } = config
  const background = colour(theme.background, '#f8fafc')
  const surface = colour(theme.surface, '#ffffff')
  const ink = colour(theme.text, '#0f172a')
  const accent = colour(theme.primary, '#6366f1')
  const sections = config.sections.filter((section) => !section.hidden).slice(0, 3)
  const items = [...navigation.primaryItems, ...navigation.secondaryItems].slice(0, 4)
  const top = navigation.placement === 'top'
  const nav = (
    <span className={`flex gap-[3px] ${top ? 'flex-row items-center' : 'w-[22%] shrink-0 flex-col'}`}>
      {items.map((item) => <span key={item.id} className="block h-[4px] rounded-full" style={{ width: top ? '14%' : '100%', backgroundColor: accent, opacity: 0.8 }} />)}
    </span>
  )
  return (
    <span
      aria-hidden="true"
      data-testid="template-thumbnail"
      data-placement={navigation.placement}
      className={`block aspect-[16/10] w-full overflow-hidden rounded-[6px] p-[6px] ring-1 ring-ui-control ${className}`}
      style={{ backgroundColor: background }}
    >
      <span className={`flex h-full min-w-0 gap-[5px] ${top ? 'flex-col' : navigation.placement === 'left' ? 'flex-row' : 'flex-row-reverse'}`}>
        {nav}
        <span className="grid min-h-0 min-w-0 flex-1 content-start gap-[5px] overflow-hidden">
          {sections.map((section) => <SectionBlock key={section.id} section={section} surface={surface} ink={ink} accent={accent} />)}
        </span>
      </span>
    </span>
  )
}
