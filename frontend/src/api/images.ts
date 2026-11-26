import { ApiError } from './client'

export interface UploadedImage { id: string; contentType: string; size: number }

/**
 * Upload one image as the raw request body (no multipart). The server decides the real type from the
 * file's own bytes, enforces the size and quota limits, and keeps the image private to this user.
 */
export async function uploadImage(file: Blob, csrf: string | null): Promise<UploadedImage> {
  const headers: Record<string, string> = { Accept: 'application/json', 'Content-Type': file.type || 'application/octet-stream' }
  if (csrf) headers['X-CSRF-Token'] = csrf
  let response: Response
  try {
    response = await fetch('/api/images', { method: 'POST', headers, body: file, credentials: 'same-origin', cache: 'no-store' })
  } catch {
    throw new ApiError(0, 'network_error', "Can't reach the server. Check your connection and try again.")
  }
  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    payload = undefined
  }
  if (!response.ok) {
    const error = (payload as { error?: { code?: string; message?: string } } | undefined)?.error
    throw new ApiError(response.status, error?.code ?? 'http_error', error?.message ?? `Upload failed (${response.status}).`)
  }
  return payload as UploadedImage
}
