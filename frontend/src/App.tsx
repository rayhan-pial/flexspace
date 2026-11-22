import { useEffect, useState } from 'react'
import { fetchHealth } from './api/health'

type Status = 'checking' | 'ok' | 'error'

export default function App() {
  const [status, setStatus] = useState<Status>('checking')

  useEffect(() => {
    let active = true
    fetchHealth()
      .then((h) => active && setStatus(h.status === 'ok' ? 'ok' : 'error'))
      .catch(() => active && setStatus('error'))
    return () => {
      active = false
    }
  }, [])

  const label = {
    checking: 'Checking backend…',
    ok: 'Backend healthy',
    error: 'Backend unreachable',
  }[status]

  return (
    <main className="min-h-screen grid place-items-center p-6">
      <section className="max-w-md w-full rounded-2xl bg-white p-8 shadow-lg ring-1 ring-slate-200">
        <h1 className="text-3xl font-semibold tracking-tight">FlexSpace</h1>
        <p className="mt-1 text-slate-600">Personal Workspace Builder</p>
        <p
          role="status"
          data-status={status}
          className={`mt-6 inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${
            status === 'ok'
              ? 'bg-emerald-100 text-emerald-800'
              : status === 'error'
                ? 'bg-rose-100 text-rose-800'
                : 'bg-slate-100 text-slate-700'
          }`}
        >
          {label}
        </p>
      </section>
    </main>
  )
}
