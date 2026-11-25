// Evidence tool, not a test (UI-018): saves the screenshot matrix of the acceptance checklist, which
// is all three ready-made designs (top, left and right navigation) at 1920, 1440, 1280, 1024, 768 and
// 390 px in Edit (from 1024) and Preview, plus a selected widget, an empty workspace, open inspector
// views, modal states and a 200%-zoom-sized window. Same prerequisites as grid-gesture.mjs.
// Run: node e2e/screenshot-matrix.mjs     Output: E2E_SHOT_DIR (default ../artifacts/ui-review/final)
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { goTo, inspector } from './shell.mjs'

const executablePath = process.env.E2E_BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:5173'
const out = process.env.E2E_SHOT_DIR ?? fileURLToPath(new URL('../../artifacts/ui-review/final', import.meta.url))
mkdirSync(out, { recursive: true })
const PASSWORD = 'correct horse battery staple'
const email = `e2e${Date.now()}${Math.floor(Math.random() * 1e6)}@example.com`
const WIDTHS = [1920, 1440, 1280, 1024, 768, 390]

const browser = await chromium.launch({ executablePath })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const shot = async (name) => {
  await page.waitForTimeout(1300) // the grid re-measures asynchronously after a resize
  await page.screenshot({ path: join(out, `${name}.png`) })
  console.log(`  ${name}.png`)
}

try {
  await page.goto(baseUrl)
  await page.getByRole('button', { name: 'Create an account' }).click()
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await inspector(page).waitFor()

  for (const design of ['Productivity', 'Analytics', 'Creative']) {
    await page.setViewportSize({ width: 1440, height: 1000 })
    await goTo(page, 'Templates')
    await inspector(page).getByRole('radio', { name: new RegExp(design) }).check()
    await inspector(page).getByRole('button', { name: `Apply ${design}` }).click()
    const confirm = page.getByRole('alertdialog')
    if (await confirm.isVisible().catch(() => false)) {
      if (design === 'Analytics') await shot('final-modal-replace-draft')
      await confirm.getByRole('button', { name: 'Replace my draft' }).click()
    }
    await inspector(page).getByText(new RegExp(`${design} is now in your draft`)).waitFor()
    await goTo(page, 'My workspace')
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 1000 })
      await page.waitForTimeout(400)
      const modes = width >= 1024 ? ['edit', 'preview'] : ['preview']
      for (const mode of modes) {
        if (width >= 1024) {
          const toggle = mode === 'preview' ? page.getByRole('button', { name: 'Preview', exact: true }) : page.getByRole('button', { name: 'Edit workspace' })
          if (await toggle.isVisible().catch(() => false)) await toggle.click()
        }
        await shot(`final-${design.toLowerCase()}-${width}-${mode}`)
      }
      if (width >= 1024) {
        const edit = page.getByRole('button', { name: 'Edit workspace' })
        if (await edit.isVisible().catch(() => false)) await edit.click()
      }
    }
  }

  // Selected widget, and each inspector view, on the Productivity design at 1440.
  await page.setViewportSize({ width: 1440, height: 1000 })
  await goTo(page, 'Templates')
  await inspector(page).getByRole('radio', { name: /Productivity/ }).check()
  await inspector(page).getByRole('button', { name: 'Apply Productivity' }).click()
  const again = page.getByRole('alertdialog')
  if (await again.isVisible().catch(() => false)) await again.getByRole('button', { name: 'Replace my draft' }).click()
  await page.getByRole('article', { name: 'Tasks' }).click({ position: { x: 60, y: 12 } })
  await shot('final-selected-widget-1440')
  for (const view of ['Outline', 'Components', 'Templates', 'Appearance']) {
    await goTo(page, view)
    await shot(`final-inspector-${view.toLowerCase()}-1440`)
  }

  // Modal states: delete a custom template, and log out with unsaved changes.
  await goTo(page, 'Templates')
  await inspector(page).getByLabel('Template name').fill('Matrix snapshot')
  await inspector(page).getByRole('button', { name: 'Save current design as template' }).click()
  await inspector(page).getByText(/Your workspace was not changed/).waitFor()
  await inspector(page).getByRole('button', { name: 'Delete template Matrix snapshot' }).click()
  await page.getByRole('alertdialog').waitFor()
  await shot('final-modal-delete-template')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Log out' }).click()
  await page.getByRole('alertdialog').waitFor()
  await shot('final-modal-logout-discard')
  await page.getByRole('button', { name: 'Keep editing' }).click()

  // 200% zoom: a 1440 px window at 200% is 720 css px wide at twice the pixel density.
  const zoom = await browser.newContext({ viewport: { width: 720, height: 500 }, deviceScaleFactor: 2 })
  const zoomed = await zoom.newPage()
  await zoomed.goto(baseUrl)
  await zoomed.getByLabel('Email').fill(email)
  await zoomed.getByLabel('Password').fill(PASSWORD)
  await zoomed.getByRole('button', { name: 'Sign in', exact: true }).click()
  await zoomed.getByRole('heading', { level: 1 }).waitFor()
  await zoomed.waitForTimeout(1300)
  await zoomed.screenshot({ path: join(out, 'final-zoom200-preview.png') })
  console.log('  final-zoom200-preview.png')
  await zoom.close()

  // Empty workspace (no sections, no navigation): written through the API, then opened in Edit.
  const me = await page.evaluate(async () => (await fetch('/api/auth/me')).json())
  const current = await page.evaluate(async () => (await fetch('/api/workspace')).json())
  const empty = { ...current.config, sections: [], navigation: { ...current.config.navigation, primaryItems: [], secondaryItems: [] } }
  await page.evaluate(async ([revision, config, csrf]) => {
    await fetch('/api/workspace', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ baseRevision: revision, config }) })
  }, [current.revision, empty, me.csrfToken])
  await page.reload()
  await inspector(page).waitFor()
  await shot('final-empty-workspace-1440')
  await goTo(page, 'Components')
  await shot('final-empty-components-1440')
  console.log('\nOK: screenshot matrix saved to', out)
} catch (error) {
  await page.screenshot({ path: process.env.E2E_SHOT ?? 'e2e-failure.png', fullPage: true }).catch(() => {})
  console.error('FAILED', error)
  process.exitCode = 1
} finally {
  await browser.close()
}
