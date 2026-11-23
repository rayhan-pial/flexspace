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
  it('puts both panels in one column that scrolls on its own below 1280px, and dissolves it above', () => {
    render(<EditorShell />)
    const left = screen.getByRole('complementary', { name: 'Components panel' })
    const right = screen.getByRole('complementary', { name: 'Settings panel' })
    expect(left.parentElement).toBe(right.parentElement)
    const column = left.parentElement as HTMLElement
    for (const cls of ['lg:sticky', 'lg:overflow-y-auto', 'lg:max-h-[calc(100vh-2rem)]', 'xl:contents']) expect(column.className).toContain(cls)
    // from xl each panel keeps in view and scrolls by itself
    for (const panel of [left, right]) for (const cls of ['xl:sticky', 'xl:overflow-y-auto', 'xl:max-h-[calc(100vh-2rem)]', 'min-w-0']) expect(panel.className).toContain(cls)
  })

  it('has no panels in Preview', () => {
    useEditorStore.getState().setMode('preview')
    render(<EditorShell />)
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
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
