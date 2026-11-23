import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../../api/client'
import { createTemplate, deleteTemplate, getTemplate, listTemplates } from '../../api/templates'
import type { TemplateSummary as TemplateListItem } from '../../api/templates'
import { parseWorkspaceConfig } from '../../domain/workspace/parse'
import ConfirmDialog from '../../shared/ui/ConfirmDialog'
import { useSessionStore } from '../auth/sessionStore'
import { applyTemplateConfig, replacementBlocker } from './applyTemplate'
import { selectIsDirty, useEditorStore } from './editorStore'
import { describePlacement, summarizeTemplate } from './templateSummary'
import type { TemplateSummary } from './templateSummary'

/** Short descriptions of the curated designs, keyed by their fixed names. Anything else shows none. */
const DESCRIPTIONS: Record<string, string> = {
  Productivity: 'Tasks, notes and a calendar for your day, plus a reference shelf.',
  Analytics: 'Key metrics and engagement figures with follow-ups and reporting notes.',
  Creative: 'Image boards, a studio to-do list and an exhibition schedule.',
}

const button =
  'rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50'
const primaryButton =
  'rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50'

type ListState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; items: TemplateListItem[] }
type Preview = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; summary: TemplateSummary; config: unknown }

function failureMessage(error: unknown, what: string): string {
  if (error instanceof ApiError) {
    if (error.status === 0) return `Couldn't reach the server, so ${what}. Check your connection and try again.`
    if (error.status === 404) return 'That template no longer exists.'
  }
  return `Something went wrong, so ${what}. Please try again.`
}

/**
 * Templates: choose a ready-made design, see what it contains, and apply it to the draft, or
 * restore the default. Applying only changes the draft (nothing is saved until Save, and Cancel
 * returns to the last saved version). It asks first when there are unsaved changes, and it is
 * unavailable while a save is in flight.
 */
export default function TemplatesPanel() {
  const dirty = useEditorStore(selectIsDirty)
  const blocker = useEditorStore((s) => replacementBlocker(s))
  const handleUnauthorized = useSessionStore((s) => s.handleUnauthorized)
  const csrf = useSessionStore((s) => s.csrfToken)
  const hasDraft = useEditorStore((s) => s.draftConfig !== null && !s.frozen)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [removal, setRemoval] = useState<{ id: string; name: string } | null>(null)
  const [list, setList] = useState<ListState>({ status: 'loading' })
  const [selected, setSelected] = useState<string | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [confirm, setConfirm] = useState<{ templateId: string; label: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const alive = useRef(true)
  const previewRequest = useRef(0)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const expired = useCallback(
    (error: unknown) => {
      if (error instanceof ApiError && error.status === 401) {
        handleUnauthorized()
        return true
      }
      return false
    },
    [handleUnauthorized],
  )

  const load = useCallback(() => {
    listTemplates().then(
      (items) => alive.current && setList({ status: 'ready', items }),
      (error) => {
        if (!alive.current || expired(error)) return
        setList({ status: 'error', message: failureMessage(error, "the templates couldn't be loaded") })
      },
    )
  }, [expired])

  // The state starts as "loading", so the first request needs no extra state change here.
  useEffect(() => {
    load()
  }, [load])

  function select(id: string) {
    setSelected(id)
    setNotice(null)
    setPreview({ status: 'loading' })
    const request = ++previewRequest.current
    getTemplate(id).then(
      (detail) => {
        if (!alive.current || request !== previewRequest.current) return // a newer choice replaced this one
        const parsed = parseWorkspaceConfig(detail.config)
        setPreview(
          parsed.ok
            ? { status: 'ready', summary: summarizeTemplate(parsed.config), config: detail.config }
            : { status: 'error', message: 'This template could not be read by this version of FlexSpace.' },
        )
      },
      (error) => {
        if (!alive.current || request !== previewRequest.current || expired(error)) return
        setPreview({ status: 'error', message: failureMessage(error, "the template couldn't be loaded") })
      },
    )
  }

  async function apply(templateId: string, label: string) {
    setBusy(true)
    setNotice(null)
    try {
      const detail = await getTemplate(templateId)
      if (!alive.current) return
      const result = applyTemplateConfig(detail.config)
      setNotice(
        result.ok
          ? { tone: 'ok', text: `${label} is now in your draft. Save to keep it, or Cancel to go back to your last saved version.` }
          : { tone: 'error', text: result.message },
      )
    } catch (error) {
      if (alive.current && !expired(error)) setNotice({ tone: 'error', text: failureMessage(error, "the template wasn't applied") })
    } finally {
      if (alive.current) setBusy(false)
    }
  }

  /** Snapshot the current draft as a private template. Touches neither the draft, the baseline nor the revision. */
  async function saveSnapshot(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    const draft = useEditorStore.getState().draftConfig
    if (!trimmed || !draft || saving) return
    setSaving(true)
    setNotice(null)
    try {
      const created = await createTemplate(trimmed, draft, csrf)
      if (!alive.current) return
      setList((current) => (current.status === 'ready' ? { status: 'ready', items: [...current.items, { id: created.id, name: created.name, kind: created.kind, updatedAt: created.updatedAt }] } : current))
      setName('')
      setNotice({ tone: 'ok', text: `Saved "${created.name}" to your templates. Your workspace was not changed.` })
    } catch (error) {
      if (alive.current && !expired(error)) setNotice({ tone: 'error', text: failureMessage(error, "the template wasn't saved") })
    } finally {
      if (alive.current) setSaving(false)
    }
  }

  async function remove(id: string, label: string) {
    setBusy(true)
    setNotice(null)
    try {
      await deleteTemplate(id, csrf)
      if (!alive.current) return
      setList((current) => (current.status === 'ready' ? { status: 'ready', items: current.items.filter((item) => item.id !== id) } : current))
      if (selected === id) {
        previewRequest.current += 1 // ignore a preview still on its way
        setSelected(null)
        setPreview(null)
      }
      setNotice({ tone: 'ok', text: `Deleted "${label}". Your workspace was not changed.` })
    } catch (error) {
      if (alive.current && !expired(error)) setNotice({ tone: 'error', text: failureMessage(error, "the template wasn't deleted") })
    } finally {
      if (alive.current) setBusy(false)
    }
  }

  /** Ask first when that would discard unsaved changes. */
  function request(templateId: string, label: string) {
    if (dirty) setConfirm({ templateId, label })
    else void apply(templateId, label)
  }

  if (list.status === 'loading') return <p className="text-sm text-slate-500">Loading templates…</p>
  if (list.status === 'error') {
    return (
      <div className="space-y-2">
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-900 ring-1 ring-rose-200">{list.message}</p>
        <button
          type="button"
          onClick={() => {
            setList({ status: 'loading' })
            load()
          }}
          className={button}
        >
          Try again
        </button>
      </div>
    )
  }

  const system = list.items.filter((item) => item.kind === 'system')
  const custom = list.items.filter((item) => item.kind === 'custom')
  if (list.items.length === 0) return <p className="text-sm text-slate-500">There are no templates to choose from yet.</p>

  const chosen = list.items.find((item) => item.id === selected)
  // The first system template is the default design (the API lists them in a fixed order).
  const defaultTemplate = system[0]

  const group = (label: string, items: TemplateListItem[]) =>
    items.length === 0 ? null : (
      <fieldset className="space-y-1.5">
        <legend className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</legend>
        {items.map((item) => (
          <div key={item.id} className="flex items-start gap-1.5">
            <label className={`flex min-w-0 flex-1 cursor-pointer items-start gap-2 rounded-lg p-2 ring-1 ${selected === item.id ? 'bg-indigo-50 ring-indigo-300' : 'ring-slate-200 hover:bg-slate-50'}`}>
              <input type="radio" name="template" value={item.id} checked={selected === item.id} onChange={() => select(item.id)} className="mt-1" />
              <span className="min-w-0">
                <span className="block break-words text-sm font-medium text-slate-900">{item.name}</span>
                {DESCRIPTIONS[item.name] && item.kind === 'system' && <span className="block text-xs text-slate-600">{DESCRIPTIONS[item.name]}</span>}
              </span>
            </label>
            {item.kind === 'custom' && (
              <button type="button" disabled={busy} onClick={() => setRemoval({ id: item.id, name: item.name })} aria-label={`Delete template ${item.name}`} className={button}>
                Delete
              </button>
            )}
          </div>
        ))}
      </fieldset>
    )

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Start from a ready-made design. Applying one replaces your draft; nothing is saved until you press Save, and Cancel brings back your last saved version.
      </p>

      {group('Ready-made', system)}
      {group('Your templates', custom)}
      {custom.length === 0 && <p className="text-xs text-slate-500">You have no saved templates yet. Save your current design below to reuse it later.</p>}

      <form onSubmit={saveSnapshot} className="space-y-1.5 rounded-xl p-3 ring-1 ring-slate-200">
        <label className="block text-xs font-medium uppercase tracking-wide text-slate-500" htmlFor="template-name">
          Template name
        </label>
        <input
          id="template-name"
          value={name}
          maxLength={80}
          onChange={(event) => setName(event.target.value)}
          className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        />
        <button type="submit" disabled={saving || !hasDraft || name.trim() === ''} className={button}>
          Save current design as template
        </button>
        <p className="text-xs text-slate-500">Keeps a private copy of your draft as it is now, including unsaved changes. It does not change or save your workspace.</p>
      </form>

      {chosen && preview?.status === 'loading' && <p className="text-sm text-slate-500">Loading {chosen.name}…</p>}
      {chosen && preview?.status === 'error' && (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-900 ring-1 ring-rose-200">{preview.message}</p>
      )}
      {chosen && preview?.status === 'ready' && (
        <section aria-label={`${chosen.name} preview`} className="space-y-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
          <h3 className="text-sm font-semibold text-slate-900">{chosen.name}</h3>
          <div className="flex items-center gap-1.5" aria-label="Theme colors">
            {(['primary', 'background', 'surface', 'text'] as const).map((name) => (
              <span key={name} title={`${name} ${preview.summary.theme[name]}`} className="size-5 rounded-full ring-1 ring-slate-300" style={{ backgroundColor: preview.summary.theme[name] }} />
            ))}
            <span className="ml-1 text-xs text-slate-600">{preview.summary.theme.fontFamily} font</span>
          </div>
          <p className="text-xs text-slate-600">
            {preview.summary.sections.length} sections, {preview.summary.widgetCount} widgets, navigation in the {describePlacement(preview.summary.placement)}: {preview.summary.navigation.join(', ') || 'none'}.
          </p>
          <ul className="space-y-1.5 text-xs text-slate-700">
            {preview.summary.sections.map((section, index) => (
              <li key={index}>
                <span className="font-medium">{section.title}</span> <span className="text-slate-500">({section.kind === 'grid' ? 'dashboard grid' : 'stack'})</span>
                <span className="block text-slate-600">{section.widgets.join(', ')}</span>
              </li>
            ))}
          </ul>
          <button type="button" disabled={busy || blocker !== null} onClick={() => request(chosen.id, chosen.name)} className={primaryButton}>
            Apply {chosen.name}
          </button>
        </section>
      )}

      <div className="space-y-1.5 border-t border-slate-200 pt-3">
        <button type="button" disabled={busy || blocker !== null || !defaultTemplate} onClick={() => defaultTemplate && request(defaultTemplate.id, `The default ${defaultTemplate.name} design`)} className={button}>
          Restore default
        </button>
        <p className="text-xs text-slate-500">Replaces your draft with the default {defaultTemplate?.name ?? ''} design, with new ids. Nothing is saved until you press Save.</p>
      </div>

      {blocker && <p className="text-xs text-amber-800">{blocker}</p>}
      {notice && (
        <p aria-live="polite" role={notice.tone === 'error' ? 'alert' : undefined} className={`rounded-lg px-3 py-2 text-sm ring-1 ${notice.tone === 'error' ? 'bg-rose-50 text-rose-900 ring-rose-200' : 'bg-emerald-50 text-emerald-900 ring-emerald-200'}`}>
          {notice.text}
        </p>
      )}

      {removal && (
        <ConfirmDialog
          destructive
          title="Delete this template?"
          message={`"${removal.name}" will be removed from your templates. Your workspace is not affected.`}
          confirmLabel="Delete template"
          cancelLabel="Keep template"
          onCancel={() => setRemoval(null)}
          onConfirm={() => {
            const { id, name: label } = removal
            setRemoval(null)
            void remove(id, label)
          }}
        />
      )}

      {confirm && (
        <ConfirmDialog
          destructive
          title="Replace your unsaved changes?"
          message={`${confirm.label} will replace everything in your draft, including your unsaved changes. Your last saved version stays safe, and Cancel brings it back.`}
          confirmLabel="Replace my draft"
          cancelLabel="Keep my changes"
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            const { templateId, label } = confirm
            setConfirm(null)
            void apply(templateId, label)
          }}
        />
      )}
    </div>
  )
}
