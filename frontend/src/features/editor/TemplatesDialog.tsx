import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../../api/client'
import { createTemplate, deleteTemplate, getTemplate, listTemplates } from '../../api/templates'
import type { TemplateSummary as TemplateListItem } from '../../api/templates'
import { parseWorkspaceConfig } from '../../domain/workspace/parse'
import type { WorkspaceConfig } from '../../domain/workspace/types'
import Button from '../../shared/ui/Button'
import Dialog from '../../shared/ui/Dialog'
import Tabs from '../../shared/ui/Tabs'
import { useSessionStore } from '../auth/sessionStore'
import { applyTemplateConfig, replacementBlocker } from './applyTemplate'
import { selectIsDirty, useEditorStore } from './editorStore'
import TemplateThumbnail from './TemplateThumbnail'
import { describePlacement, summarizeTemplate } from './templateSummary'
import type { TemplateSummary } from './templateSummary'

/** Short descriptions of the curated designs, keyed by their fixed names. Anything else shows none. */
const DESCRIPTIONS: Record<string, string> = {
  Productivity: 'Tasks, notes and a calendar for your day, plus a reference shelf.',
  Analytics: 'Key metrics and engagement figures with follow-ups and reporting notes.',
  Creative: 'Image boards, a studio to-do list and an exhibition schedule.',
}

type ListState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; items: TemplateListItem[] }
type Preview = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; summary: TemplateSummary; parsed: WorkspaceConfig }
type Confirmation = { kind: 'replace'; templateId: string; label: string } | { kind: 'remove'; id: string; name: string }

function failureMessage(error: unknown, what: string): string {
  if (error instanceof ApiError) {
    if (error.status === 0) return `Couldn't reach the server, so ${what}. Check your connection and try again.`
    if (error.status === 404) return 'That template no longer exists.'
  }
  return `Something went wrong, so ${what}. Please try again.`
}

const errorBox = 'rounded-ui-control bg-red-50 px-3 py-2 text-sm text-red-900 ring-1 ring-red-200'

/**
 * The template gallery: a large dialog with Ready-made and My templates tabs and a 3 / 2 / 1 column card
 * grid. Choosing a card only previews it. Applying replaces the *draft* (nothing is saved until Save, and
 * Cancel brings back the last saved version), asks first, in the dialog itself, when that would discard
 * unsaved changes, and is unavailable while a save is in flight. Snapshots are private copies of the draft
 * and never change or save the workspace. Late responses are ignored once the dialog is closed.
 */
export default function TemplatesDialog({ onClose }: { onClose: () => void }) {
  const dirty = useEditorStore(selectIsDirty)
  const blocker = useEditorStore((s) => replacementBlocker(s))
  const handleUnauthorized = useSessionStore((s) => s.handleUnauthorized)
  const csrf = useSessionStore((s) => s.csrfToken)
  const hasDraft = useEditorStore((s) => s.draftConfig !== null && !s.frozen)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [list, setList] = useState<ListState>({ status: 'loading' })
  const [selected, setSelected] = useState<string | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [confirm, setConfirm] = useState<Confirmation | null>(null)
  const [busy, setBusy] = useState(false)
  // Parsed configs for drawing thumbnails: ready-made ones load up front, custom ones when chosen.
  const [configs, setConfigs] = useState<Record<string, WorkspaceConfig>>({})
  const alive = useRef(true)
  const previewRequest = useRef(0)
  const noticeRef = useRef<HTMLParagraphElement>(null)
  const keepRef = useRef<HTMLButtonElement>(null)
  const opener = useRef<HTMLElement | null>(null)
  const restoreFocus = useRef<HTMLElement | null>(null)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  // A finished action moves focus to its result; leaving a confirmation puts focus back where it began.
  useEffect(() => {
    if (confirm) keepRef.current?.focus()
    else if (restoreFocus.current) {
      restoreFocus.current.focus()
      restoreFocus.current = null
    }
  }, [confirm])
  useEffect(() => {
    if (notice) noticeRef.current?.focus()
  }, [notice])

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
      (items) => {
        if (!alive.current) return
        setList({ status: 'ready', items })
        for (const item of items) {
          if (item.kind !== 'system') continue
          // Thumbnails are a nicety: a failed or unreadable one simply leaves the card without a picture.
          getTemplate(item.id).then(
            (detail) => {
              const parsed = parseWorkspaceConfig(detail.config)
              if (alive.current && parsed.ok) setConfigs((current) => ({ ...current, [item.id]: parsed.config }))
            },
            () => undefined,
          )
        }
      },
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
    const request = ++previewRequest.current
    const known = configs[id]
    if (known) {
      setPreview({ status: 'ready', summary: summarizeTemplate(known), parsed: known })
      return
    }
    setPreview({ status: 'loading' })
    getTemplate(id).then(
      (detail) => {
        if (!alive.current || request !== previewRequest.current) return // a newer choice replaced this one
        const parsed = parseWorkspaceConfig(detail.config)
        if (parsed.ok) setConfigs((current) => ({ ...current, [id]: parsed.config }))
        setPreview(
          parsed.ok
            ? { status: 'ready', summary: summarizeTemplate(parsed.config), parsed: parsed.config }
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

  /** Remember what to give focus back to, then show the in-dialog confirmation. */
  function ask(next: Confirmation) {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setConfirm(next)
  }
  function cancelConfirm() {
    restoreFocus.current = opener.current?.isConnected ? opener.current : null
    setConfirm(null)
  }
  /** Ask first when applying would discard unsaved changes. */
  function request(templateId: string, label: string) {
    if (dirty) ask({ kind: 'replace', templateId, label })
    else void apply(templateId, label)
  }
  function proceed() {
    if (!confirm) return
    const current = confirm
    setConfirm(null)
    if (current.kind === 'replace') void apply(current.templateId, current.label)
    else void remove(current.id, current.name)
  }

  const system = list.status === 'ready' ? list.items.filter((item) => item.kind === 'system') : []
  const custom = list.status === 'ready' ? list.items.filter((item) => item.kind === 'custom') : []
  const chosen = list.status === 'ready' ? list.items.find((item) => item.id === selected) : undefined
  // The first system template is the default design (the API lists them in a fixed order).
  const defaultTemplate = system[0]

  const cards = (label: string, items: TemplateListItem[]) => (
    <fieldset>
      <legend className="sr-only">{label}</legend>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-template-grid>
        {items.map((item) => (
          <div key={item.id} className="flex min-w-0 flex-col gap-1.5">
            <label className={`flex min-w-0 flex-1 cursor-pointer flex-col gap-2 rounded-ui-control p-2 ring-1 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ui-primary ${selected === item.id ? 'bg-ui-selected ring-2 ring-ui-primary' : 'bg-ui-surface ring-ui-border hover:bg-ui-subtle'}`}>
              {configs[item.id] ? <TemplateThumbnail config={configs[item.id]} /> : <span aria-hidden="true" className="block aspect-[16/10] rounded-ui-control bg-ui-subtle" />}
              <span className="flex items-start gap-2">
                <input type="radio" name="template" value={item.id} checked={selected === item.id} onChange={() => select(item.id)} className="mt-1 accent-ui-primary" />
                <span className="min-w-0">
                  <span className="block break-words text-sm font-medium text-ui-text">{item.name}</span>
                  {DESCRIPTIONS[item.name] && item.kind === 'system' && <span className="block text-xs text-ui-muted">{DESCRIPTIONS[item.name]}</span>}
                </span>
              </span>
            </label>
            {item.kind === 'custom' && (
              <Button disabled={busy} onClick={() => ask({ kind: 'remove', id: item.id, name: item.name })} aria-label={`Delete template ${item.name}`}>
                Delete
              </Button>
            )}
          </div>
        ))}
      </div>
    </fieldset>
  )

  const details = (items: TemplateListItem[]) =>
    chosen && items.some((item) => item.id === chosen.id) ? (
      <>
        {preview?.status === 'loading' && <p role="status" className="mt-4 text-sm text-ui-muted">Loading {chosen.name}…</p>}
        {preview?.status === 'error' && <p role="alert" className={`mt-4 ${errorBox}`}>{preview.message}</p>}
        {preview?.status === 'ready' && (
          <section aria-label={`${chosen.name} preview`} className="mt-4 grid gap-4 rounded-ui-card bg-ui-subtle p-4 ring-1 ring-ui-border md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
            <TemplateThumbnail config={preview.parsed} />
            <div className="min-w-0 space-y-3">
              <h3 className="text-base font-semibold text-ui-text">{chosen.name}</h3>
              <div className="flex items-center gap-1.5" aria-label="Theme colors">
                {(['primary', 'background', 'surface', 'text'] as const).map((colorName) => (
                  <span key={colorName} title={`${colorName} ${preview.summary.theme[colorName]}`} className="size-5 rounded-full ring-1 ring-ui-control" style={{ backgroundColor: preview.summary.theme[colorName] }} />
                ))}
                <span className="ml-1 text-xs text-ui-text">{preview.summary.theme.fontFamily} font</span>
              </div>
              <p className="text-xs text-ui-text">
                {preview.summary.sections.length} sections, {preview.summary.widgetCount} widgets, navigation in the {describePlacement(preview.summary.placement)}: {preview.summary.navigation.join(', ') || 'none'}.
              </p>
              <ul className="space-y-1.5 text-xs text-ui-text">
                {preview.summary.sections.map((section, index) => (
                  <li key={index}>
                    <span className="font-medium">{section.title}</span> ({section.kind === 'grid' ? 'dashboard grid' : 'stack'})
                    <span className="block">{section.widgets.join(', ')}</span>
                  </li>
                ))}
              </ul>
              <Button variant="primary" disabled={busy} reason={blocker} onClick={() => request(chosen.id, chosen.name)}>
                Apply {chosen.name}
              </Button>
            </div>
          </section>
        )}
      </>
    ) : null

  let body
  if (list.status === 'loading') body = <p role="status" className="text-sm text-ui-muted">Loading templates…</p>
  else if (list.status === 'error') {
    body = (
      <div className="space-y-2">
        <p role="alert" className={errorBox}>{list.message}</p>
        <Button
          onClick={() => {
            setList({ status: 'loading' })
            load()
          }}
        >
          Try again
        </Button>
      </div>
    )
  } else if (list.items.length === 0) body = <p className="text-sm text-ui-muted">There are no templates to choose from yet.</p>
  else {
    body = (
      <Tabs
        label="Template groups"
        tabs={[
          {
            id: 'ready-made',
            label: 'Ready-made',
            content: (
              <div className="space-y-4 pt-4">
                {system.length > 0 ? cards('Ready-made', system) : <p className="text-sm text-ui-muted">There are no ready-made templates.</p>}
                {details(system)}
                <section aria-label="Restore default" className="space-y-1 border-t border-ui-border pt-4">
                  <h3 className="text-sm font-semibold text-ui-text">Restore default</h3>
                  <Button disabled={busy || !defaultTemplate} reason={blocker} onClick={() => defaultTemplate && request(defaultTemplate.id, `The default ${defaultTemplate.name} design`)}>
                    Restore default
                  </Button>
                  <p className="text-xs text-ui-muted">Replaces your draft with the default {defaultTemplate?.name ?? ''} design, with new ids. Nothing is saved until you press Save.</p>
                </section>
              </div>
            ),
          },
          {
            id: 'mine',
            label: 'My templates',
            content: (
              <div className="space-y-4 pt-4">
                <section aria-label="Save current design" className="space-y-2 rounded-ui-card bg-ui-subtle p-4 ring-1 ring-ui-border">
                  <h3 className="text-sm font-semibold text-ui-text">Save current design</h3>
                  <form onSubmit={saveSnapshot} className="space-y-2">
                    <div>
                      <label className="block text-sm font-medium text-ui-text" htmlFor="template-name">
                        Template name
                      </label>
                      <input
                        id="template-name"
                        value={name}
                        maxLength={80}
                        onChange={(event) => setName(event.target.value)}
                        className="ui-focus mt-1 block w-full max-w-md rounded-ui-control border border-ui-control bg-ui-surface px-3 py-1.5 text-sm text-ui-text focus:border-ui-primary [@media(pointer:coarse)]:min-h-11"
                      />
                    </div>
                    <Button type="submit" disabled={saving || !hasDraft || name.trim() === ''}>
                      Save current design as template
                    </Button>
                    <p className="text-xs text-ui-muted">Keeps a private copy of your draft as it is now, including unsaved changes. It does not change or save your workspace.</p>
                  </form>
                </section>
                {custom.length > 0 ? cards('My templates', custom) : <p className="text-sm text-ui-muted">You have no saved templates yet. Save your current design above to reuse it later.</p>}
                {details(custom)}
              </div>
            ),
          },
        ]}
      />
    )
  }

  return (
    <Dialog
      title="Templates"
      description="Start from a ready-made design. Applying one replaces your draft; nothing is saved until you press Save, and Cancel brings back your last saved version."
      size="xl"
      onClose={() => (confirm ? cancelConfirm() : onClose())}
      footer={<Button onClick={onClose}>Close</Button>}
    >
      {notice && (
        <p
          ref={noticeRef}
          tabIndex={-1}
          aria-live="polite"
          role={notice.tone === 'error' ? 'alert' : 'status'}
          className={`mb-4 rounded-ui-control px-3 py-2 text-sm outline-none ring-1 ${notice.tone === 'error' ? 'bg-red-50 text-red-900 ring-red-200' : 'bg-emerald-50 text-emerald-900 ring-emerald-200'}`}
        >
          {notice.text}
        </p>
      )}
      {blocker && <p className="mb-4 text-xs text-ui-warning">{blocker}</p>}

      {confirm && (
        <section
          role="region"
          aria-label={confirm.kind === 'replace' ? 'Replace your unsaved changes?' : 'Delete this template?'}
          className="mb-4 space-y-3 rounded-ui-card bg-amber-50 p-4 ring-1 ring-amber-200"
        >
          <h3 className="text-base font-semibold text-ui-text">{confirm.kind === 'replace' ? 'Replace your unsaved changes?' : 'Delete this template?'}</h3>
          <p className="text-sm text-ui-text">
            {confirm.kind === 'replace'
              ? `${confirm.label} will replace everything in your draft, including your unsaved changes. Your last saved version stays safe, and Cancel brings it back.`
              : `"${confirm.name}" will be removed from your templates. Your workspace is not affected.`}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button ref={keepRef} onClick={cancelConfirm}>{confirm.kind === 'replace' ? 'Keep my changes' : 'Keep template'}</Button>
            <Button variant="destructive" onClick={proceed}>{confirm.kind === 'replace' ? 'Replace my draft' : 'Delete template'}</Button>
          </div>
        </section>
      )}

      {/* The gallery stays mounted while a confirmation is open so focus can return to the control that asked. */}
      <div hidden={confirm !== null} inert={confirm !== null}>
        {body}
      </div>
    </Dialog>
  )
}
