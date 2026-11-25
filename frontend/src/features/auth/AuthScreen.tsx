import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import Button from '../../shared/ui/Button'
import ConfirmDialog from '../../shared/ui/ConfirmDialog'
import { BrandMark } from '../../shared/ui/icons'
import { useSessionStore } from './sessionStore'
import type { FieldErrors } from './sessionStore'

type Mode = 'login' | 'register'

const inputClass =
  'ui-focus mt-1 block w-full rounded-ui-control border border-ui-control bg-ui-surface px-3 py-2 text-ui-text focus:border-ui-primary ' +
  'aria-[invalid=true]:border-ui-danger aria-[invalid=true]:bg-red-50 [@media(pointer:coarse)]:min-h-11'
const linkButton = 'ui-focus rounded font-medium underline-offset-2 hover:underline'
const fieldError = 'mt-1 break-words text-sm font-medium text-ui-danger'

export default function AuthScreen() {
  const login = useSessionStore((s) => s.login)
  const register = useSessionStore((s) => s.register)
  const notice = useSessionStore((s) => s.notice)
  const reauth = useSessionStore((s) => s.status === 'reauth')
  const frozenEmail = useSessionStore((s) => s.user?.email ?? '')
  const discardFrozenDraft = useSessionStore((s) => s.discardFrozenDraft)

  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState(reauth ? frozenEmail : '')
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [password, setPassword] = useState('')
  // Display only: whether the typed characters are shown. Never stored, sent or kept across screens.
  const [reveal, setReveal] = useState(false)
  const [pending, setPending] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [fields, setFields] = useState<FieldErrors>({})
  const ids = { email: useId(), password: useId(), hint: useId(), emailError: useId(), passwordError: useId() }

  const isRegister = mode === 'register' && !reauth

  function switchMode() {
    setMode(isRegister ? 'login' : 'register')
    setFormError(null)
    setFields({})
    setPassword('')
    setReveal(false)
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (pending) return
    setPending(true)
    setFormError(null)
    setFields({})
    const result = await (isRegister ? register : login)(email, password)
    if (result.ok || result.superseded) return // success unmounts this screen
    setPending(false)
    setFormError(result.message)
    setFields(result.fields ?? {})
    setPassword('')
    setReveal(false)
  }

  return (
    <main className="grid min-h-screen place-items-center bg-ui-bg p-4 text-ui-text">
      <div className="w-full max-w-md min-w-0 rounded-ui-dialog bg-ui-surface p-6 shadow-ui-dialog ring-1 ring-ui-border sm:p-8">
        <p className="flex items-center gap-2 text-base font-semibold tracking-tight text-ui-text">
          <BrandMark />
          FlexSpace
        </p>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-ui-text">
          {reauth ? 'Sign in again' : isRegister ? 'Create your workspace' : 'Sign in to your workspace'}
        </h1>
        {reauth && (
          <p className="mt-2 break-words text-sm text-ui-text">
            Sign in as {frozenEmail} to keep your unsaved changes. Signing in as someone else discards them.
          </p>
        )}

        {notice && (
          <p role="status" className="mt-4 break-words rounded-ui-control bg-amber-50 px-3 py-2 text-sm text-ui-warning ring-1 ring-amber-200">
            {notice}
          </p>
        )}

        <form onSubmit={onSubmit} noValidate className="mt-6 space-y-4" aria-busy={pending}>
          <div>
            <label htmlFor={ids.email} className="block text-sm font-medium text-ui-text">Email</label>
            <input
              id={ids.email}
              type="email"
              name="email"
              autoComplete="email"
              required
              autoFocus={!reauth}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={fields.email ? true : undefined}
              aria-describedby={fields.email ? ids.emailError : undefined}
              className={inputClass}
            />
            {fields.email && <p id={ids.emailError} className={fieldError}>{fields.email}</p>}
          </div>

          <div>
            <label htmlFor={ids.password} className="block text-sm font-medium text-ui-text">Password</label>
            <div className="relative">
              <input
                id={ids.password}
                type={reveal ? 'text' : 'password'}
                name="password"
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                required
                autoFocus={reauth}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={fields.password ? true : undefined}
                aria-describedby={[isRegister ? ids.hint : '', fields.password ? ids.passwordError : ''].filter(Boolean).join(' ') || undefined}
                className={`${inputClass} pr-20`}
              />
              <button
                type="button"
                aria-pressed={reveal}
                aria-controls={ids.password}
                onClick={() => setReveal((shown) => !shown)}
                className="ui-focus absolute inset-y-0 right-1 my-auto h-8 rounded-ui-control px-2 text-xs font-medium text-ui-primary hover:bg-ui-subtle [@media(pointer:coarse)]:h-11"
              >
                {reveal ? 'Hide characters' : 'Show characters'}
              </button>
            </div>
            {isRegister && <p id={ids.hint} className="mt-1 text-sm text-ui-muted">Use 12 to 128 characters.</p>}
            {fields.password && <p id={ids.passwordError} className={fieldError}>{fields.password}</p>}
          </div>

          {formError && (
            <p role="alert" className="break-words rounded-ui-control bg-red-50 px-3 py-2 text-sm text-red-900 ring-1 ring-red-200">
              {formError}
            </p>
          )}

          <Button type="submit" variant="primary" disabled={pending} className="w-full py-2.5">
            {pending ? (isRegister ? 'Creating account…' : 'Signing in…') : isRegister ? 'Create account' : 'Sign in'}
          </Button>
        </form>

        {reauth ? (
          <p className="mt-6 text-center text-sm text-ui-text">
            <button type="button" onClick={() => setConfirmDiscard(true)} className={`${linkButton} text-ui-danger`}>
              Discard unsaved changes
            </button>
          </p>
        ) : (
          <p className="mt-6 text-center text-sm text-ui-text">
            {isRegister ? 'Already have an account?' : 'New to FlexSpace?'}{' '}
            <button type="button" onClick={switchMode} className={`${linkButton} text-ui-primary`}>
              {isRegister ? 'Sign in' : 'Create an account'}
            </button>
          </p>
        )}
      </div>
      {confirmDiscard && (
        <ConfirmDialog
          destructive
          title="Discard unsaved changes?"
          message="Your unsaved changes will be lost and you will return to the sign-in screen."
          confirmLabel="Discard changes"
          cancelLabel="Keep them"
          onCancel={() => setConfirmDiscard(false)}
          onConfirm={() => discardFrozenDraft()}
        />
      )}
    </main>
  )
}
