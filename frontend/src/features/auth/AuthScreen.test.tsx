import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../app/App'
import { apiError, installFetch } from '../../test/fakeApi'
import { useSessionStore } from './sessionStore'

beforeEach(() => useSessionStore.setState(useSessionStore.getInitialState(), true))
afterEach(() => vi.unstubAllGlobals())

async function open() {
  installFetch({
    'GET /auth/me': () => apiError(401, 'unauthenticated'),
    'POST /auth/login': () => apiError(401, 'invalid_credentials'),
  })
  render(<App />)
  await screen.findByLabelText('Email')
  return userEvent.setup()
}

describe('password visibility', () => {
  it('starts hidden, toggles with an accessible pressed state, and does not touch the value', async () => {
    const user = await open()
    const field = screen.getByLabelText('Password')
    await user.type(field, 'a long secret phrase')
    expect(field).toHaveAttribute('type', 'password')

    const show = screen.getByRole('button', { name: 'Show characters' })
    expect(show).toHaveAttribute('aria-pressed', 'false')
    expect(show).toHaveAttribute('aria-controls', field.id)
    await user.click(show)
    expect(field).toHaveAttribute('type', 'text')
    expect(field).toHaveValue('a long secret phrase')
    expect(screen.getByRole('button', { name: 'Hide characters' })).toHaveAttribute('aria-pressed', 'true')

    await user.click(screen.getByRole('button', { name: 'Hide characters' }))
    expect(field).toHaveAttribute('type', 'password')
    expect(field).toHaveValue('a long secret phrase')
  })

  it('does not take part in the form: the Password label still names exactly one field', async () => {
    await open()
    expect(screen.getAllByLabelText('Password')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Show characters' })).toHaveAttribute('type', 'button')
  })

  it('hides the characters again after a failed attempt, which also clears the password', async () => {
    const user = await open()
    await user.type(screen.getByLabelText('Email'), 'a@example.com')
    await user.type(screen.getByLabelText('Password'), 'wrong password!!')
    await user.click(screen.getByRole('button', { name: 'Show characters' }))
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect.')
    expect(screen.getByLabelText('Password')).toHaveValue('')
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password')
    expect(screen.getByRole('button', { name: 'Show characters' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('starts hidden again when switching between sign in and create account', async () => {
    const user = await open()
    await user.click(screen.getByRole('button', { name: 'Show characters' }))
    await user.click(screen.getByRole('button', { name: 'Create an account' }))
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password')
  })
})

describe('the sign-in screen offers only the supported controls', () => {
  it('has no name, forgot-password, remember-me or social sign-in controls', async () => {
    await open()
    for (const unsupported of [/full name/i, /forgot/i, /remember/i, /google|github|facebook|apple/i]) {
      expect(screen.queryByText(unsupported)).not.toBeInTheDocument()
    }
    expect(screen.getByLabelText('Email')).toHaveAttribute('autocomplete', 'email')
  })

  it('lets long error text wrap instead of overflowing', async () => {
    const user = await open()
    await user.type(screen.getByLabelText('Email'), 'a@example.com')
    await user.type(screen.getByLabelText('Password'), 'wrong password!!')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveClass('break-words')
  })
})
