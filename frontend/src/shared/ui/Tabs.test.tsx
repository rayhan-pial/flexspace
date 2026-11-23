import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import Tabs from './Tabs'

const tabs = [
  { id: 'one', label: 'One', content: <p>First panel</p> },
  { id: 'two', label: 'Two', content: <p>Second panel</p> },
  { id: 'three', label: 'Three', content: <p>Third panel</p> },
]

describe('Tabs', () => {
  it('exposes tablist, tabs and the active tabpanel with correct associations', () => {
    render(<Tabs label="Demo" tabs={tabs} />)
    expect(screen.getByRole('tablist', { name: 'Demo' })).toBeInTheDocument()
    const first = screen.getByRole('tab', { name: 'One' })
    expect(first).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Two' })).toHaveAttribute('aria-selected', 'false')
    const panel = screen.getByRole('tabpanel', { name: 'One' })
    expect(panel).toHaveTextContent('First panel')
    expect(first.getAttribute('aria-controls')).toBe(panel.id)
  })

  it('renders only the active panel content', () => {
    render(<Tabs label="Demo" tabs={tabs} />)
    expect(screen.getByText('First panel')).toBeInTheDocument()
    expect(screen.queryByText('Second panel')).not.toBeInTheDocument()
  })

  it('switches on click', async () => {
    render(<Tabs label="Demo" tabs={tabs} />)
    await userEvent.setup().click(screen.getByRole('tab', { name: 'Two' }))
    expect(screen.getByRole('tab', { name: 'Two' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Second panel')).toBeInTheDocument()
    expect(screen.queryByText('First panel')).not.toBeInTheDocument()
  })

  it('uses a roving tabindex: only the selected tab is in the tab order', () => {
    render(<Tabs label="Demo" tabs={tabs} />)
    expect(screen.getByRole('tab', { name: 'One' })).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('tab', { name: 'Two' })).toHaveAttribute('tabindex', '-1')
  })

  it('supports arrow keys with wrap-around, Home and End, moving focus with the selection', async () => {
    render(<Tabs label="Demo" tabs={tabs} />)
    const user = userEvent.setup()
    screen.getByRole('tab', { name: 'One' }).focus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Two' })).toHaveFocus()
    expect(screen.getByRole('tab', { name: 'Two' })).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{End}')
    expect(screen.getByRole('tab', { name: 'Three' })).toHaveFocus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'One' })).toHaveFocus() // wraps
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('tab', { name: 'Three' })).toHaveFocus() // wraps back
    await user.keyboard('{Home}')
    expect(screen.getByRole('tab', { name: 'One' })).toHaveFocus()
  })
})
