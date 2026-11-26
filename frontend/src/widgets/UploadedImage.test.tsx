import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseWorkspaceConfig } from '../domain/workspace/parse'
import { useSessionStore } from '../features/auth/sessionStore'
import ImageUploadButton from '../features/editor/ImageUploadButton'
import { galleryAsset } from './gallery/assets'

const ID = '123e4567-e89b-42d3-a456-426614174000'

beforeEach(() => useSessionStore.setState({ ...useSessionStore.getInitialState(), csrfToken: 'csrf-a' }, true))
afterEach(() => vi.unstubAllGlobals())

const png = (name = 'a.png', size = 10, type = 'image/png') => new File([new Uint8Array(size)], name, { type })
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('uploaded image keys', () => {
  it('map to the private image URL, never to anything else', () => {
    expect(galleryAsset(`upload:${ID}`)).toEqual({ url: `/api/images/${ID}`, label: 'Uploaded image' })
    expect(galleryAsset('upload:../../etc/passwd')).toBeUndefined()
    expect(galleryAsset(`UPLOAD:${ID}`)).toBeUndefined()
  })

  it('parse as a gallery key and stay exactly as written; a malformed one is rejected', () => {
    const doc = (key: string) => ({ schemaVersion: 1, title: 'x', sections: [{ id: 's', kind: 'stack', title: 'p', widgets: [{ id: 'w', type: 'gallery', props: { items: [{ id: 'i', assetKey: key }] } }] }] })
    const ok = parseWorkspaceConfig(doc(`upload:${ID}`))
    expect(ok.ok && ok.config.sections[0].widgets[0].props).toEqual({ items: [{ id: 'i', assetKey: `upload:${ID}`, alt: '', caption: '' }] })
    expect(parseWorkspaceConfig(doc('upload:nope')).ok).toBe(false)
    expect(parseWorkspaceConfig(doc('https://x.test/a.png')).ok).toBe(false)
  })
})

describe('ImageUploadButton', () => {
  it('sends the raw file with the CSRF token and hands the new image id on', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(201, { id: ID, contentType: 'image/png', size: 10 }))
    vi.stubGlobal('fetch', fetchMock)
    const onUploaded = vi.fn().mockReturnValue(true)
    render(<ImageUploadButton onUploaded={onUploaded} />)
    await userEvent.setup().upload(screen.getByLabelText('Choose pictures to upload'), png())
    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith(ID))
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/images')
    expect(init.method).toBe('POST')
    expect(init.headers['X-CSRF-Token']).toBe('csrf-a')
    expect(init.headers['Content-Type']).toBe('image/png')
    expect(init.body).toBeInstanceOf(File)
    expect(await screen.findByRole('status')).toHaveTextContent('Picture added to this gallery.')
  })

  it('refuses a wrong type or an oversized file before sending anything', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const onUploaded = vi.fn()
    render(<ImageUploadButton onUploaded={onUploaded} />)
    const input = screen.getByLabelText('Choose pictures to upload')
    const user = userEvent.setup({ applyAccept: false })
    await user.upload(input, new File(['<svg/>'], 'x.svg', { type: 'image/svg+xml' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('x.svg is not a PNG, JPEG, GIF or WebP picture.')
    await user.upload(input, png('big.png', 5 * 1024 * 1024 + 1))
    expect(await screen.findByRole('alert')).toHaveTextContent('big.png is larger than 5 MB.')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(onUploaded).not.toHaveBeenCalled()
  })

  it('shows the server message when the upload is refused and adds nothing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(409, { error: { code: 'image_quota_exceeded', message: 'You have reached your image storage limit.' } })))
    const onUploaded = vi.fn()
    render(<ImageUploadButton onUploaded={onUploaded} />)
    await userEvent.setup().upload(screen.getByLabelText('Choose pictures to upload'), png())
    expect(await screen.findByRole('alert')).toHaveTextContent('You have reached your image storage limit.')
    expect(onUploaded).not.toHaveBeenCalled()
  })

  it('says so when the server cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('down')))
    render(<ImageUploadButton onUploaded={() => true} />)
    await userEvent.setup().upload(screen.getByLabelText('Choose pictures to upload'), png())
    expect(await screen.findByRole('alert')).toHaveTextContent("Can't reach the server")
  })

  it('is disabled with an attached reason when the gallery is full', () => {
    render(<ImageUploadButton reason="This widget has reached the limit of 100 entries." onUploaded={() => true} />)
    const button = screen.getByRole('button', { name: 'Upload pictures' })
    expect(button).toBeDisabled()
    expect(button).toHaveAccessibleDescription('This widget has reached the limit of 100 entries.')
  })
})
