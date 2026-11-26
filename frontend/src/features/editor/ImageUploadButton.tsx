import { useId, useRef, useState } from 'react'
import { ApiError } from '../../api/client'
import { uploadImage } from '../../api/images'
import { MAX_UPLOAD_BYTES, UPLOAD_TYPES } from '../../domain/workspace/constants'
import Button from '../../shared/ui/Button'
import { useSessionStore } from '../auth/sessionStore'

/**
 * Choose one or more pictures from the computer and upload them to the user's private storage. Each one
 * that succeeds is handed to `onUploaded` (the gallery then adds it to the draft). Nothing is saved to the
 * workspace here: the upload stores the file, and Save stores the gallery that uses it. Files are checked
 * for type and size before sending, and the server checks again from the real bytes.
 */
export default function ImageUploadButton({ reason, onUploaded }: { reason?: string | null; onUploaded: (imageId: string) => boolean }) {
  const csrf = useSessionStore((s) => s.csrfToken)
  const handleUnauthorized = useSessionStore((s) => s.handleUnauthorized)
  const inputId = useId()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  async function onChange(files: FileList | null) {
    const chosen = Array.from(files ?? [])
    if (input.current) input.current.value = '' // lets the same file be chosen again
    if (chosen.length === 0) return
    setBusy(true)
    setMessage(null)
    let added = 0
    let failed = false
    for (const file of chosen) {
      if (!(UPLOAD_TYPES as readonly string[]).includes(file.type)) {
        setMessage({ tone: 'error', text: `${file.name} is not a PNG, JPEG, GIF or WebP picture.` })
        failed = true
        continue
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        setMessage({ tone: 'error', text: `${file.name} is larger than 5 MB.` })
        failed = true
        continue
      }
      try {
        const image = await uploadImage(file, csrf)
        if (onUploaded(image.id)) added += 1
        else break // the gallery refused (for example it is full): stop here
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          handleUnauthorized()
          break
        }
        setMessage({ tone: 'error', text: error instanceof ApiError ? error.message : 'The upload failed. Please try again.' })
        failed = true
        break
      }
    }
    setBusy(false)
    if (added > 0 && !failed) setMessage({ tone: 'ok', text: added === 1 ? 'Picture added to this gallery.' : `${added} pictures added to this gallery.` })
  }

  return (
    <div className="space-y-1.5">
      <input ref={input} id={inputId} type="file" accept={UPLOAD_TYPES.join(',')} multiple hidden aria-label="Choose pictures to upload" onChange={(event) => void onChange(event.target.files)} />
      <Button disabled={busy} reason={reason ?? null} onClick={() => input.current?.click()}>
        {busy ? 'Uploading…' : 'Upload pictures'}
      </Button>
      <p className="text-xs text-ui-muted">PNG, JPEG, GIF or WebP, up to 5 MB each. Pictures are private to you.</p>
      {message && (
        <p role={message.tone === 'error' ? 'alert' : 'status'} className={`rounded-ui-control px-3 py-2 text-sm ring-1 ${message.tone === 'error' ? 'bg-red-50 text-red-900 ring-red-200' : 'bg-emerald-50 text-emerald-900 ring-emerald-200'}`}>
          {message.text}
        </p>
      )}
    </div>
  )
}
