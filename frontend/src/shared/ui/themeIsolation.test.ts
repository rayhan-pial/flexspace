import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(__dirname, '..', '..')

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sources(path)
    return /\.(tsx?|css)$/.test(name) && !/\.test\./.test(name) ? [path] : []
  })
}

describe('editor chrome is independent of the workspace theme', () => {
  it('never reads --fs-* variables from editor, shared, auth or shell code', () => {
    const chrome = sources(SRC).filter((file) => {
      const path = relative(SRC, file).replaceAll('\\', '/')
      return path.startsWith('shared/') || path.startsWith('features/editor/') || path.startsWith('features/auth/') || path === 'features/workspace/WorkspaceGate.tsx' || path === 'features/workspace/EditorShell.tsx'
    })
    expect(chrome.length).toBeGreaterThan(10)
    const offenders = chrome.filter((file) => readFileSync(file, 'utf8').includes('--fs-')).map((file) => relative(SRC, file))
    expect(offenders).toEqual([])
  })

  it('scopes the workspace theme to .fs-themed and defines the editor tokens on :root', () => {
    const css = readFileSync(join(SRC, 'index.css'), 'utf8')
    const outsideThemed = css.replace(/\.fs-themed\s*\{[^}]*\}/, '')
    expect(outsideThemed).not.toContain('var(--fs-')
    for (const token of ['--ui-bg', '--ui-surface', '--ui-primary', '--ui-text', '--ui-border', '--ui-danger', '--ui-radius-control']) {
      expect(css).toContain(`${token}:`)
    }
  })
})
