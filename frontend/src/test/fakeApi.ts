import { vi } from 'vitest'

export interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
}

export function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

export const apiError = (status: number, code: string, message = code, details: Record<string, unknown> = {}) =>
  json(status, { error: { code, message, details } })

export const noContent = () => new Response(null, { status: 204 })

export interface RecordedCall {
  method: string
  path: string
  headers: Record<string, string>
  body: unknown
  init: RequestInit
}

type Handler = (call: RecordedCall) => Response | Promise<Response>

/** Replace global fetch with route handlers keyed "METHOD /path" (path without the /api prefix). */
export function installFetch(handlers: Record<string, Handler>) {
  const calls: RecordedCall[] = []
  const mock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input)
    const method = (init.method ?? 'GET').toUpperCase()
    const path = url.replace(/^\/api/, '')
    const call: RecordedCall = {
      method,
      path,
      headers: (init.headers ?? {}) as Record<string, string>,
      body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
      init,
    }
    calls.push(call)
    const handler = handlers[`${method} ${path}`]
    if (!handler) throw new Error(`Unhandled request: ${method} ${url}`)
    return handler(call)
  })
  vi.stubGlobal('fetch', mock)
  return { calls, mock }
}

export const user = (id: string, email = `${id}@example.com`) => ({ id, email })

export const workspaceEnvelope = (title: string, revision = 1, sections: object[] = []) => ({
  id: `ws-${title}`,
  revision,
  updatedAt: '2026-11-23T10:00:00Z',
  config: { schemaVersion: 1, title, sections },
})

export const authResponse = (id: string, csrfToken = `csrf-${id}`) => ({ user: user(id), csrfToken })
