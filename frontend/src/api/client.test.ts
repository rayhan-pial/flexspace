import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, request } from './client'
import { apiError, installFetch, json, noContent } from '../test/fakeApi'

afterEach(() => vi.unstubAllGlobals())

describe('request', () => {
  it('uses a relative /api URL with same-origin credentials and no caching', async () => {
    const { mock } = installFetch({ 'GET /workspace': () => json(200, { ok: true }) })
    await request('GET', '/workspace')
    const [url, init] = mock.mock.calls[0]
    expect(url).toBe('/api/workspace')
    expect(init).toMatchObject({ credentials: 'same-origin', cache: 'no-store' })
  })

  it('sends the CSRF token on mutations only', async () => {
    const { calls } = installFetch({
      'GET /workspace': () => json(200, {}),
      'POST /auth/logout': () => noContent(),
      'PUT /workspace': () => json(200, {}),
    })
    await request('GET', '/workspace', { csrf: 'tok' })
    await request('POST', '/auth/logout', { csrf: 'tok' })
    await request('PUT', '/workspace', { csrf: 'tok', body: { a: 1 } })
    expect(calls[0].headers['X-CSRF-Token']).toBeUndefined()
    expect(calls[1].headers['X-CSRF-Token']).toBe('tok')
    expect(calls[2].headers['X-CSRF-Token']).toBe('tok')
    expect(calls[2].headers['Content-Type']).toBe('application/json')
    expect(calls[2].body).toEqual({ a: 1 })
  })

  it('omits the CSRF header when no token is held', async () => {
    const { calls } = installFetch({ 'POST /auth/login': () => json(200, {}) })
    await request('POST', '/auth/login', { body: {} })
    expect(calls[0].headers['X-CSRF-Token']).toBeUndefined()
  })

  it('returns undefined for 204', async () => {
    installFetch({ 'POST /auth/logout': () => noContent() })
    await expect(request('POST', '/auth/logout')).resolves.toBeUndefined()
  })

  it('turns the error envelope into an ApiError', async () => {
    installFetch({ 'GET /x': () => apiError(409, 'revision_conflict', 'Changed elsewhere.', { currentRevision: 4 }) })
    const error = await request('GET', '/x').catch((e) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 409, code: 'revision_conflict', message: 'Changed elsewhere.', details: { currentRevision: 4 } })
  })

  it('survives a non-JSON error body such as a proxy HTML page', async () => {
    installFetch({ 'GET /x': () => new Response('<html>Bad gateway</html>', { status: 502 }) })
    const error = await request('GET', '/x').catch((e) => e)
    expect(error).toMatchObject({ status: 502, code: 'http_error' })
  })

  it('reports an unreachable server as status 0', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const error = await request('GET', '/x').catch((e) => e)
    expect(error).toMatchObject({ status: 0, code: 'network_error' })
  })
})
