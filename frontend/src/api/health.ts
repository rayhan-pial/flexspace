export type HealthResponse = { status: string }

/** Calls the backend through the relative /api URL (Vite proxy in development). */
export async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch('/api/health', { credentials: 'same-origin' })
  if (!response.ok) throw new Error(`Health check failed (${response.status})`)
  return (await response.json()) as HealthResponse
}
