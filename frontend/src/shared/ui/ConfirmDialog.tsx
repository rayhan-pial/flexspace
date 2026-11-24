import { useRef } from 'react'
import Button from './Button'
import Dialog from './Dialog'

interface Props {
  title: string
  message: string
  confirmLabel: string
  cancelLabel?: string
  /** Style the confirm button as destructive (discarding work). */
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/** Modal confirmation. Focus starts on the safe (cancel) button; Escape cancels; Tab stays inside. */
export default function ConfirmDialog({ title, message, confirmLabel, cancelLabel = 'Keep editing', destructive, onConfirm, onCancel }: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  return (
    <Dialog
      role="alertdialog"
      size="sm"
      title={title}
      description={message}
      onClose={onCancel}
      initialFocusRef={cancelRef}
      footer={
        <>
          <Button ref={cancelRef} onClick={onCancel}>{cancelLabel}</Button>
          <Button variant={destructive ? 'destructive' : 'primary'} onClick={onConfirm}>{confirmLabel}</Button>
        </>
      }
    >
      {null}
    </Dialog>
  )
}
