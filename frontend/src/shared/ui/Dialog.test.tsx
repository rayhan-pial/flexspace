import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import ConfirmDialog from './ConfirmDialog'
import Dialog from './Dialog'

function Harness({ onClose = () => {} }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button onClick={() => setOpen(true)}>Open gallery</button>
      <button>Background action</button>
      {open && (
        <Dialog
          title="Gallery"
          description="Pick one"
          onClose={() => { setOpen(false); onClose() }}
          footer={<button onClick={() => setOpen(false)}>Done</button>}
        >
          <input aria-label="Search" />
          <input aria-label="Name" />
          <button>Apply</button>
        </Dialog>
      )}
    </div>
  )
}

describe('Dialog', () => {
  it('has an accessible name and description and moves focus to the first control', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Open gallery' }))
    const dialog = screen.getByRole('dialog', { name: 'Gallery' })
    expect(dialog).toHaveAccessibleDescription('Pick one')
    expect(screen.getByRole('textbox', { name: 'Search' })).toHaveFocus()
  })

  it('keeps Tab and Shift+Tab inside the dialog across many controls', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Open gallery' }))
    const order = ['Search', 'Name', 'Apply', 'Done']
    const focused = () => (document.activeElement as HTMLElement).getAttribute('aria-label') ?? document.activeElement?.textContent
    expect(focused()).toBe(order[0])
    for (const expected of [...order.slice(1), order[0]]) {
      await userEvent.tab()
      expect(focused()).toBe(expected)
    }
    await userEvent.tab({ shift: true })
    expect(focused()).toBe('Done')
  })

  it('makes the rest of the page inert while open and restores it after', async () => {
    const { container } = render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Open gallery' }))
    expect(container).toHaveAttribute('inert')
    expect(screen.getByRole('dialog').closest('[inert]')).toBeNull()
    expect(document.body.style.overflow).toBe('hidden')
    await userEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(container).not.toHaveAttribute('inert')
    expect(document.body.style.overflow).toBe('')
  })

  it('closes on Escape even while a text field is focused, and returns focus to the opener', async () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    const opener = screen.getByRole('button', { name: 'Open gallery' })
    await userEvent.click(opener)
    await userEvent.type(screen.getByRole('textbox', { name: 'Search' }), 'abc')
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(opener).toHaveFocus()
  })

  it('closes when the dimmed area outside it is clicked, and returns focus to the opener', async () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    const opener = screen.getByRole('button', { name: 'Open gallery' })
    await userEvent.click(opener)
    const backdrop = screen.getByRole('dialog').closest('[data-dialog-root]') as HTMLElement
    await userEvent.click(backdrop)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(opener).toHaveFocus()
  })

  it('does not close when the click is inside the dialog, on its text, or when a press inside ends outside', async () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: 'Open gallery' }))
    const dialog = screen.getByRole('dialog')
    const backdrop = dialog.closest('[data-dialog-root]') as HTMLElement
    await userEvent.click(screen.getByRole('heading', { name: 'Gallery' }))
    await userEvent.click(dialog)
    await userEvent.click(screen.getByRole('textbox', { name: 'Search' }))
    // A drag that starts inside (selecting text) and is released on the backdrop is not an outside click.
    await userEvent.pointer([{ keys: '[MouseLeft>]', target: screen.getByRole('textbox', { name: 'Name' }) }, { target: backdrop }, { keys: '[/MouseLeft]', target: backdrop }])
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('only the topmost of two stacked dialogs closes from a click outside', async () => {
    const outer = vi.fn()
    const inner = vi.fn()
    function Stacked() {
      const [second, setSecond] = useState(true)
      return (
        <Dialog title="Outer" onClose={outer}>
          {second && <Dialog title="Inner" onClose={() => { inner(); setSecond(false) }}><button>Inner button</button></Dialog>}
        </Dialog>
      )
    }
    render(<Stacked />)
    await userEvent.click(screen.getByRole('dialog', { name: 'Inner' }).closest('[data-dialog-root]') as HTMLElement)
    expect(inner).toHaveBeenCalledTimes(1)
    expect(outer).not.toHaveBeenCalled()
  })

  it('only the topmost of two dialogs reacts to Escape', async () => {
    const outer = vi.fn()
    const inner = vi.fn()
    function Stacked() {
      const [second, setSecond] = useState(false)
      return (
        <Dialog title="Outer" onClose={outer}>
          <button onClick={() => setSecond(true)}>Open inner</button>
          {second && <Dialog title="Inner" onClose={() => { inner(); setSecond(false) }}><button>Inner button</button></Dialog>}
        </Dialog>
      )
    }
    render(<Stacked />)
    await userEvent.click(screen.getByRole('button', { name: 'Open inner' }))
    expect(screen.getByRole('button', { name: 'Inner button' })).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    expect(inner).toHaveBeenCalledTimes(1)
    expect(outer).not.toHaveBeenCalled()
    await userEvent.keyboard('{Escape}')
    expect(outer).toHaveBeenCalledTimes(1)
  })
})

describe('ConfirmDialog', () => {
  it('starts on the safe button, fires each callback once and cancels on Escape', async () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(<ConfirmDialog destructive title="Discard?" message="Gone for good." confirmLabel="Discard" onConfirm={onConfirm} onCancel={onCancel} />)
    expect(screen.getByRole('alertdialog', { name: 'Discard?' })).toHaveAccessibleDescription('Gone for good.')
    expect(screen.getByRole('button', { name: 'Keep editing' })).toHaveFocus()
    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'Discard' })).toHaveFocus()
    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'Keep editing' })).toHaveFocus()
    await userEvent.click(screen.getByRole('button', { name: 'Discard' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    await userEvent.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
