import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { parseWorkspaceConfig } from '../../domain/workspace/parse'
import { stubViewport } from '../../test/viewport'
import { useEditorStore } from '../editor/editorStore'
import EditorShell from './EditorShell'

function load() {
  const parsed = parseWorkspaceConfig({ schemaVersion: 1, title: 'Responsive', sections: [{ id: 's1', kind: 'stack', title: 'One' }] })
  if (!parsed.ok) throw new Error(parsed.message)
  useEditorStore.getState().load({ ownerId: 'u', workspaceId: 'w', revision: 1, config: parsed.config })
}

beforeEach(() => {
  useEditorStore.setState(useEditorStore.getInitialState(), true)
  stubViewport(true)
  load()
})

describe('editor shell layout', () => {
  it('has one inspector column that scrolls on its own beside the canvas', () => {
    render(<EditorShell />)
    const inspector = screen.getByRole('complementary', { name: 'Inspector' })
    for (const cls of ['lg:sticky', 'lg:overflow-y-auto', 'lg:max-h-[calc(100vh-2rem)]', 'min-w-0']) expect(inspector.className).toContain(cls)
    const grid = inspector.parentElement?.parentElement as HTMLElement
    for (const cls of ['lg:grid-cols-[minmax(0,1fr)_17.5rem]', 'xl:grid-cols-[minmax(0,1fr)_19rem]']) expect(grid.className).toContain(cls)
    expect(screen.queryByRole('complementary', { name: 'Components panel' })).not.toBeInTheDocument()
    expect(screen.queryByRole('complementary', { name: 'Settings panel' })).not.toBeInTheDocument()
  })

  it('has a 64px icon rail that becomes 192px from 1440px', () => {
    render(<EditorShell />)
    const rail = screen.getByRole('navigation', { name: 'Editor navigation' }).closest('aside') as HTMLElement
    for (const cls of ['w-16', 'min-[1440px]:w-48', 'sticky']) expect(rail.className).toContain(cls)
  })

  it('has no rail or inspector in Preview', () => {
    useEditorStore.getState().setMode('preview')
    render(<EditorShell />)
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Editor navigation' })).not.toBeInTheDocument()
  })
})

describe('reduced motion', () => {
  it('the stylesheet switches transitions, animations and smooth scrolling off', () => {
    const css = readFileSync(join(__dirname, '../../index.css'), 'utf-8')
    const block = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(block).toContain('animation-duration: 0.01ms !important')
    expect(block).toContain('transition-duration: 0.01ms !important')
    expect(block).toContain('scroll-behavior: auto !important')
  })
})
