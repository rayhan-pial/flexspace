import { useId, useState } from 'react'
import { HexColorPicker } from 'react-colorful'

/*
 * Small labelled form controls. Every control is a real <label> + input, and the controls that can
 * hold an invalid intermediate value (colour text, numbers) keep that text locally and apply a
 * change only when it is valid, so the draft never contains a value the schema would reject.
 */

const input =
  'ui-focus mt-1 block w-full rounded-ui-control border border-ui-control bg-ui-surface px-3 py-1.5 text-sm text-ui-text placeholder:text-ui-muted focus:border-ui-primary aria-[invalid=true]:border-ui-danger aria-[invalid=true]:bg-red-50 disabled:cursor-not-allowed disabled:bg-ui-subtle disabled:opacity-60 [@media(pointer:coarse)]:min-h-11'
const label = 'block text-sm font-medium text-ui-text'
const small =
  'ui-focus rounded-ui-control border border-ui-control bg-ui-surface px-2 py-1 text-xs font-medium text-ui-text hover:bg-ui-subtle [@media(pointer:coarse)]:min-h-11'
const errorText = 'mt-1 text-xs font-medium text-ui-danger'

export function TextField({ label: text, value, onChange, maxLength }: { label: string; value: string; onChange: (value: string) => void; maxLength?: number }) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className={label}>{text}</label>
      <input id={id} type="text" value={value} maxLength={maxLength} onChange={(e) => onChange(e.target.value)} className={input} />
    </div>
  )
}

export function TextAreaField({ label: text, value, onChange, maxLength }: { label: string; value: string; onChange: (value: string) => void; maxLength?: number }) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className={label}>{text}</label>
      <textarea id={id} rows={4} value={value} maxLength={maxLength} onChange={(e) => onChange(e.target.value)} className={input} />
    </div>
  )
}

export function SelectField({
  label: text, value, onChange, options,
}: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className={label}>{text}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={input}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </div>
  )
}

export function CheckboxField({ label: text, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  const id = useId()
  return (
    <div className="flex items-center gap-2">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="ui-focus size-4 rounded border-ui-control accent-ui-primary" />
      <label htmlFor={id} className="text-sm text-ui-text">{text}</label>
    </div>
  )
}

const HEX = /^#[0-9a-fA-F]{6}$/

/**
 * A #rrggbb colour: a text box plus a react-colorful picker. `value` is `undefined` when the
 * colour is not set (per-widget overrides); `onReset` then offers to return to the theme colour.
 */
export function ColorField({
  label: text, value, onChange, onReset, hint,
}: { label: string; value: string | undefined; onChange: (value: string) => void; onReset?: () => void; hint?: string }) {
  const id = useId()
  const errorId = useId()
  const hintId = useId()
  const [typed, setTyped] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const shown = typed ?? value ?? ''
  const invalid = typed !== null && !HEX.test(typed)

  function onType(next: string) {
    if (HEX.test(next)) {
      setTyped(null)
      onChange(next.toLowerCase())
    } else {
      setTyped(next)
    }
  }

  return (
    <div>
      <label htmlFor={id} className={label}>{text}</label>
      <div className="mt-1 flex items-center gap-2">
        <span aria-hidden="true" className="size-8 shrink-0 rounded-ui-control ring-1 ring-ui-control" style={{ backgroundColor: HEX.test(value ?? '') ? value : 'transparent' }} />
        <input
          id={id}
          type="text"
          value={shown}
          maxLength={7}
          placeholder={value === undefined ? 'Theme default' : '#rrggbb'}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={[invalid ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined}
          onChange={(e) => onType(e.target.value)}
          onBlur={() => setTyped(null)}
          className={`${input} mt-0 font-mono`}
        />
      </div>
      {hint && <p id={hintId} className="mt-1 text-xs text-ui-muted">{hint}</p>}
      {invalid && <p id={errorId} role="alert" className={errorText}>Use a colour like #1a2b3c (six hex digits).</p>}
      <div className="mt-1 flex gap-2">
        <button type="button" aria-expanded={picking} onClick={() => setPicking((open) => !open)} className={small}>
          {picking ? `Close ${text.toLowerCase()} picker` : `Pick ${text.toLowerCase()}`}
        </button>
        {onReset && value !== undefined && (
          <button type="button" onClick={onReset} className={small}>Use theme default</button>
        )}
      </div>
      {picking && (
        <div className="mt-2">
          <HexColorPicker color={value ?? '#000000'} onChange={onChange} />
        </div>
      )}
    </div>
  )
}

/** A whole-number field with a range. Out-of-range or non-numeric text is shown as an error and not applied. */
export function IntegerField({
  label: text, value, min, max, onChange, onReset,
}: { label: string; value: number | undefined; min: number; max: number; onChange: (value: number) => void; onReset?: () => void }) {
  const id = useId()
  const errorId = useId()
  const [typed, setTyped] = useState<string | null>(null)
  const parsed = typed === null ? null : /^\d+$/.test(typed) ? Number(typed) : NaN
  const invalid = typed !== null && !(parsed !== null && Number.isInteger(parsed) && parsed >= min && parsed <= max)

  function onType(next: string) {
    if (/^\d+$/.test(next) && Number(next) >= min && Number(next) <= max) {
      setTyped(null)
      onChange(Number(next))
    } else {
      setTyped(next)
    }
  }

  return (
    <div>
      <label htmlFor={id} className={label}>{text}</label>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        value={typed ?? (value === undefined ? '' : String(value))}
        placeholder={value === undefined ? 'Theme default' : undefined}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={invalid ? errorId : undefined}
        onChange={(e) => onType(e.target.value)}
        onBlur={() => setTyped(null)}
        className={input}
      />
      {invalid && <p id={errorId} role="alert" className={errorText}>Enter a whole number from {min} to {max}.</p>}
      {onReset && value !== undefined && (
        <button type="button" onClick={onReset} className={`${small} mt-1`}>Use theme default</button>
      )}
    </div>
  )
}

/** Any finite number (for descriptor-driven numeric props). Non-numeric text is flagged and not applied. */
export function NumberField({ label: text, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  const id = useId()
  const errorId = useId()
  // The text being typed is kept while the field is focused (so "12." can become "12.5"); every
  // valid number is applied immediately, and leaving the field shows the saved value again.
  const [typed, setTyped] = useState<string | null>(null)
  const parsed = typed === null ? null : typed.trim() === '' ? Number.NaN : Number(typed)
  const invalid = typed !== null && !Number.isFinite(parsed)

  function onType(next: string) {
    setTyped(next)
    const number = next.trim() === '' ? Number.NaN : Number(next)
    if (Number.isFinite(number)) onChange(number)
  }

  return (
    <div>
      <label htmlFor={id} className={label}>{text}</label>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        value={typed ?? String(value)}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={invalid ? errorId : undefined}
        onChange={(e) => onType(e.target.value)}
        onBlur={() => setTyped(null)}
        className={input}
      />
      {invalid && <p id={errorId} role="alert" className={errorText}>Enter a number.</p>}
    </div>
  )
}

/**
 * A text field that keeps what you type locally and commits it on Enter or blur (Escape discards).
 * Use it where a half-edited value must never reach the draft, for example a label that may not be
 * empty. `onCommit` returns false when the value was refused; the field then shows the saved value.
 */
export function CommitTextField({
  label: text, value, onCommit, maxLength,
}: { label: string; value: string; onCommit: (value: string) => boolean | void; maxLength?: number }) {
  const id = useId()
  const [typed, setTyped] = useState<string | null>(null)

  function commit() {
    if (typed === null) return
    onCommit(typed)
    setTyped(null) // a refused value simply shows the saved one again
  }

  return (
    <div>
      <label htmlFor={id} className={label}>{text}</label>
      <input
        id={id}
        type="text"
        value={typed ?? value}
        maxLength={maxLength}
        onChange={(e) => setTyped(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') setTyped(null)
        }}
        className={input}
      />
    </div>
  )
}
