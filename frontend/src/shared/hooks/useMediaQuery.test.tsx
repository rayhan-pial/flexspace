import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { stubViewport } from '../../test/viewport'
import { useMediaQuery } from './useMediaQuery'

function Probe({ fallback = true }: { fallback?: boolean }) {
  return <p>{useMediaQuery('(min-width: 1024px)', fallback) ? 'wide' : 'narrow'}</p>
}

let restore: (() => void) | undefined
afterEach(() => restore?.())

describe('useMediaQuery', () => {
  it('reads the current match and follows changes', () => {
    const viewport = stubViewport(true)
    restore = viewport.restore
    render(<Probe />)
    expect(screen.getByText('wide')).toBeInTheDocument()
    act(() => viewport.set(false))
    expect(screen.getByText('narrow')).toBeInTheDocument()
    act(() => viewport.set(true))
    expect(screen.getByText('wide')).toBeInTheDocument()
  })

  it('unsubscribes on unmount', () => {
    const viewport = stubViewport(true)
    restore = viewport.restore
    const { unmount } = render(<Probe />)
    expect(viewport.listenerCount()).toBe(1)
    unmount()
    expect(viewport.listenerCount()).toBe(0)
  })

  it('uses the fallback where matchMedia does not exist', () => {
    expect(typeof window.matchMedia).not.toBe('function')
    render(<Probe fallback={false} />)
    expect(screen.getByText('narrow')).toBeInTheDocument()
  })
})
