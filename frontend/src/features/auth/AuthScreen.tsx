import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import ConfirmDialog from '../../shared/ui/ConfirmDialog'
import { useSessionStore } from './sessionStore'
import type { FieldErrors } from './sessionStore'

type Mode = 'login' | 'register'

const inputClass =
  'mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm ' +
  'focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 aria-[invalid=true]:border-rose-500'

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
  }

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg ring-1 ring-slate-200">
        <p className="text-sm font-semibold tracking-wide text-indigo-600">FlexSpace</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
          {reauth ? 'Sign in again' : isRegister ? 'Create your workspace' : 'Sign in to your workspace'}
        </h1>
        {reauth && (
          <p className="mt-2 text-sm text-slate-600">
            Sign in as {frozenEmail} to keep your unsaved changes. Signing in as someone else discards them.
          </p>
        )}

        {notice && (
          <p role="status" className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
            {notice}
          </p>
        )}

        <form onSubmit={onSubmit} noValidate className="mt-6 space-y-4" aria-busy={pending}>
          <div>
            <label htmlFor={ids.email} className="block text-sm font-medium text-slate-700">Email</label>
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
            {fields.email && <p id={ids.emailError} className="mt-1 text-sm text-rose-700">{fields.email}</p>}
          </div>

          <div>
            <label htmlFor={ids.password} className="block text-sm font-medium text-slate-700">Password</label>
            <input
              id={ids.password}
              type="password"
              name="password"
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              required
              autoFocus={reauth}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={fields.password ? true : undefined}
              aria-describedby={[isRegister ? ids.hint : '', fields.password ? ids.passwordError : ''].filter(Boolean).join(' ') || undefined}
              className={inputClass}
            />
            {isRegister && <p id={ids.hint} className="mt-1 text-sm text-slate-500">Use 12 to 128 characters.</p>}
            {fields.password && <p id={ids.passwordError} className="mt-1 text-sm text-rose-700">{fields.password}</p>}
          </div>

          {formError && (
            <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800 ring-1 ring-rose-200">
              {formError}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 font-medium text-white shadow-sm hover:bg-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? (isRegister ? 'Creating account…' : 'Signing in…') : isRegister ? 'Create account' : 'Sign in'}
          </button>
        </form>

        {reauth ? (
          <p className="mt-6 text-center text-sm text-slate-600">
            <button type="button" onClick={() => setConfirmDiscard(true)} className="font-medium text-rose-700 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">
              Discard unsaved changes
            </button>
          </p>
        ) : (
          <p className="mt-6 text-center text-sm text-slate-600">
            {isRegister ? 'Already have an account?' : 'New to FlexSpace?'}{' '}
            <button type="button" onClick={switchMode} className="font-medium text-indigo-600 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
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
