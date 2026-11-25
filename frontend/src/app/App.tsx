import { useEffect } from 'react'
import AuthScreen from '../features/auth/AuthScreen'
import { useSessionStore } from '../features/auth/sessionStore'
import Button from '../shared/ui/Button'
import WorkspaceGate from '../features/workspace/WorkspaceGate'

/** The server session could not be confirmed as ended. Nothing private is shown; Retry tries again. */
function SignOutFailed() {
  const message = useSessionStore((s) => s.signOutError)
  const retry = useSessionStore((s) => s.retryLogout)
  return (
    <main className="grid min-h-screen place-items-center bg-ui-bg p-4">
      <div role="alert" className="max-w-sm rounded-ui-card bg-ui-surface p-6 text-center shadow-ui-surface ring-1 ring-ui-border">
        <p className="font-medium text-ui-text">Sign-out could not be confirmed</p>
        <p className="mt-1 text-sm text-ui-muted">
          {message} Your account may still be signed in on the server. Your workspace is hidden. Try again, and do not leave this
          computer until it succeeds if others can use it.
        </p>
        <Button variant="primary" className="mt-4" onClick={() => void retry()}>
          Retry sign-out
        </Button>
      </div>
    </main>
  )
}

export default function App() {
  const status = useSessionStore((s) => s.status)
  const bootstrap = useSessionStore((s) => s.bootstrap)

  useEffect(() => {
    void bootstrap()
  }, [bootstrap])

  if (status === 'bootstrapping') {
    return (
      <main className="grid min-h-screen place-items-center bg-ui-bg">
        <p role="status" className="text-ui-muted">Loading…</p>
      </main>
    )
  }

  if (status === 'signing_out') {
    return (
      <main className="grid min-h-screen place-items-center bg-ui-bg">
        <p role="status" className="text-ui-muted">Signing out…</p>
      </main>
    )
  }

  if (status === 'signout_failed') return <SignOutFailed />

  if (status === 'unavailable') {
    return (
      <main className="grid min-h-screen place-items-center bg-ui-bg p-4">
        <div role="alert" className="max-w-sm rounded-ui-card bg-ui-surface p-6 text-center shadow-ui-surface ring-1 ring-ui-border">
          <p className="font-medium text-ui-text">Can't reach the server</p>
          <p className="mt-1 text-sm text-ui-muted">Check that the backend is running, then try again.</p>
          <Button variant="primary" className="mt-4" onClick={() => void bootstrap()}>
            Try again
          </Button>
        </div>
      </main>
    )
  }

  // `key` remounts the sign-in form when moving between "sign in again" and a clean sign-in,
  // so a discarded session's email never lingers in the form.
  return status === 'authenticated' ? <WorkspaceGate /> : <AuthScreen key={status} />
}
