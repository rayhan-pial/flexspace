import { useId, useState } from 'react'
import { HexColorPicker } from 'react-colorful'

/*
 * Small labelled form controls. Every control is a real <label> + input, and the controls that can
 * hold an invalid intermediate value (colour text, numbers) keep that text locally and apply a
 * change only when it is valid, so the draft never contains a value the schema would reject.
 */

const input =
  'mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 aria-[invalid=true]:border-rose-500'
const label = 'block text-sm font-medium text-slate-700'
const small =
  'rounded-lg border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500'

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
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-4 rounded border-slate-300" />
      <label htmlFor={id} className="text-sm text-slate-700">{text}</label>
    </div>
  )
}

const HEX = /^#[0-9a-fA-F]{6}$/

/**
 * A #rrggbb colour: a text box plus a react-colorful picker. `value` is `undefined` when the
 * colour is not set (per-widget overrides); `onReset` then offers to return to the theme colour.
 */
export function ColorField({
  label: text, value, onChange, onReset,
}: { label: string; value: string | undefined; onChange: (value: string) => void; onReset?: () => void }) {
  const id = useId()
  const errorId = useId()
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
        <span aria-hidden="true" className="size-8 shrink-0 rounded-lg ring-1 ring-slate-300" style={{ backgroundColor: HEX.test(value ?? '') ? value : 'transparent' }} />
        <input
          id={id}
          type="text"
          value={shown}
          maxLength={7}
          placeholder={value === undefined ? 'Theme default' : '#rrggbb'}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={invalid ? errorId : undefined}
          onChange={(e) => onType(e.target.value)}
          onBlur={() => setTyped(null)}
          className={`${input} mt-0 font-mono`}
        />
      </div>
      {invalid && <p id={errorId} role="alert" className="mt-1 text-xs text-rose-700">Use a colour like #1a2b3c (six hex digits).</p>}
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
      {invalid && <p id={errorId} role="alert" className="mt-1 text-xs text-rose-700">Enter a whole number from {min} to {max}.</p>}
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
  const [typed, setTyped] = useState<string | null>(null)
  const invalid = typed !== null

  function onType(next: string) {
    const number = Number(next)
    if (next.trim() !== '' && Number.isFinite(number)) {
      setTyped(null)
      onChange(number)
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
        inputMode="decimal"
        value={typed ?? String(value)}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={invalid ? errorId : undefined}
        onChange={(e) => onType(e.target.value)}
        onBlur={() => setTyped(null)}
        className={input}
      />
      {invalid && <p id={errorId} role="alert" className="mt-1 text-xs text-rose-700">Enter a number.</p>}
    </div>
  )
}
