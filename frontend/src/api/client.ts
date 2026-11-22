export type Method = 'GET' | 'POST' | 'PUT' | 'DELETE'

/** A failed API call. `status` 0 means the server could not be reached at all. */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details: Record<string, unknown>

  constructor(status: number, code: string, message: string, details: Record<string, unknown> = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

export interface RequestOptions {
  body?: unknown
  /** CSRF token for authenticated POST/PUT/DELETE. Held in memory by the session store only. */
  csrf?: string | null
}

/**
 * Typed same-origin JSON request. Uses relative `/api` URLs (Vite proxies them in development)
 * and the session cookie; the browser supplies `Origin`. Never touches browser storage.
 */
export async function request<T>(method: Method, path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'
  if (method !== 'GET' && options.csrf) headers['X-CSRF-Token'] = options.csrf

  let response: Response
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      credentials: 'same-origin',
      cache: 'no-store',
    })
  } catch {
    throw new ApiError(0, 'network_error', "Can't reach the server. Check your connection and try again.")
  }

  if (response.status === 204) return undefined as T

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    payload = undefined // e.g. an HTML error page from a proxy
  }

  if (!response.ok) {
    const error = (payload as { error?: { code?: string; message?: string; details?: Record<string, unknown> } } | undefined)?.error
    throw new ApiError(
      response.status,
      error?.code ?? 'http_error',
      error?.message ?? `Request failed (${response.status}).`,
      error?.details ?? {},
    )
  }
  return payload as T
}
