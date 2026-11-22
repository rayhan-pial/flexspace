import { render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import App from './App'

afterEach(() => vi.unstubAllGlobals())

it('shows healthy status when the backend responds ok', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'ok' }) }))
  render(<App />)
  expect(await screen.findByText('Backend healthy')).toBeInTheDocument()
})

it('shows an error when the backend is unreachable', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')))
  render(<App />)
  expect(await screen.findByText('Backend unreachable')).toBeInTheDocument()
})
