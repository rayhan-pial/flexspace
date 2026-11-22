import { useEffect } from 'react'
import AuthScreen from '../features/auth/AuthScreen'
import { useSessionStore } from '../features/auth/sessionStore'
import WorkspaceGate from '../features/workspace/WorkspaceGate'

export default function App() {
  const status = useSessionStore((s) => s.status)
  const bootstrap = useSessionStore((s) => s.bootstrap)

  useEffect(() => {
    void bootstrap()
  }, [bootstrap])

  if (status === 'bootstrapping') {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50">
        <p role="status" className="text-slate-600">Loading…</p>
      </main>
    )
  }

  if (status === 'unavailable') {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50 p-4">
        <div role="alert" className="max-w-sm rounded-xl bg-white p-6 text-center shadow ring-1 ring-slate-200">
          <p className="font-medium text-slate-900">Can't reach the server</p>
          <p className="mt-1 text-sm text-slate-600">Check that the backend is running, then try again.</p>
          <button
            type="button"
            onClick={() => void bootstrap()}
            className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            Try again
          </button>
        </div>
      </main>
    )
  }

  return status === 'authenticated' ? <WorkspaceGate /> : <AuthScreen />
}
