import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import Button from './Button'
import StatusBadge from './StatusBadge'

describe('Button', () => {
  it('is a non-submitting button by default and keeps its accessible name and handler', async () => {
    const onClick = vi.fn()
    render(<form onSubmit={(e) => e.preventDefault()}><Button onClick={onClick}>Save</Button></form>)
    const button = screen.getByRole('button', { name: 'Save' })
    expect(button).toHaveAttribute('type', 'button')
    await userEvent.click(button)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('does not fire when disabled, and the variants use editor tokens only', async () => {
    const onClick = vi.fn()
    render(<><Button disabled onClick={onClick}>Off</Button><Button variant="destructive">Remove</Button><Button variant="primary">Go</Button></>)
    await userEvent.click(screen.getByRole('button', { name: 'Off' }))
    expect(onClick).not.toHaveBeenCalled()
    for (const name of ['Off', 'Remove', 'Go']) expect(screen.getByRole('button', { name }).className).not.toMatch(/\b(?:bg|text|border)-(?:indigo|slate|rose)-/)
  })
})

describe('StatusBadge', () => {
  it('carries its meaning in text and hides the decorative dot', () => {
    const { container } = render(<StatusBadge tone="warning">Unsaved changes</StatusBadge>)
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull()
  })
})
