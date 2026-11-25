// Real-browser, real-backend check of UI-024: a palette recolors the whole user-owned stage, navigation (top, left,
// right) and inherited cards in Edit and Preview, while the app rail, toolbar, inspector and dialogs keep their own
// colors; one Undo, Cancel and Save work and only theme fields change in the saved JSON. Measures computed colors and
// the stage's size at 1440/1024/390 and saves screenshots to artifacts/ui-review/after/ (git-untracked evidence).
// Not part of `npm test`. Same prerequisites as grid-gesture.mjs. Run: npm run test:browser
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright-core'
import { goTo, inspector, library } from './shell.mjs'

const executablePath = process.env.E2E_BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:5173'
const PASSWORD = 'correct horse battery staple'
const out = process.env.E2E_SHOTS ?? new URL('../../artifacts/ui-review/after/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
mkdirSync(out, { recursive: true })

const browser = await chromium.launch({ executablePath })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
let step = 'start'
const log = (message) => {
  step = message
  console.log(`- ${message}`)
}
const shot = (name) => page.screenshot({ path: `${out}ui024-${name}.png` })
const status = () => page.getByRole('status', { name: 'Save status' }).innerText()
const rgb = (hex) => {
  const n = parseInt(hex.slice(1), 16)
  return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`
}
const computed = (selector, prop) => page.evaluate(([s, p]) => getComputedStyle(document.querySelector(s))[p], [selector, prop])
const api = (path) => page.evaluate(async (p) => (await fetch(`/api${p}`)).json(), path)

const MIDNIGHT = { primary: '#818cf8', background: '#0f172a', surface: '#1e293b', text: '#e2e8f0' }

async function measureStage(label, { height }) {
  const stage = await page.locator('[data-workspace-stage]').boundingBox()
  const canvas = await page.locator('#workspace-canvas').boundingBox()
  assert.ok(stage && canvas)
  assert.ok(Math.abs(stage.x - canvas.x) < 1 && Math.abs(stage.width - canvas.width) < 1, `${label}: the stage spans the full canvas column width`)
  assert.ok(stage.height >= canvas.height - 1, `${label}: the stage spans the canvas height`)
  assert.ok(stage.height >= 0.7 * height - 1, `${label}: the stage is at least 70% of the viewport tall (${Math.round(stage.height)} of ${height})`)
  assert.equal(await computed('[data-workspace-stage]', 'backgroundColor'), rgb(MIDNIGHT.background), `${label}: stage uses the workspace background`)
  assert.equal(await computed('[data-workspace-stage]', 'color'), rgb(MIDNIGHT.text), `${label}: stage uses the text color`)
}

try {
  log('register: default workspace, indigo palette')
  await page.goto(baseUrl)
  await page.getByRole('button', { name: 'Create an account' }).click()
  await page.getByLabel('Email').fill(`e2e${Date.now()}${Math.floor(Math.random() * 1e6)}@example.com`)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await inspector(page).waitFor()
  const original = (await api('/workspace')).config
  const chromeBefore = {
    rail: await page.evaluate(() => getComputedStyle(document.querySelector('aside:not([aria-label])')).backgroundColor),
    toolbar: await computed('[data-toolbar]', 'backgroundColor'),
    inspector: await computed('aside[aria-label="Inspector"]', 'backgroundColor'),
  }
  await shot('before-edit-1440')

  log('apply Midnight from Appearance: one history step, nothing saved, and the stage, navigation and cards recolor')
  const puts = []
  page.on('request', (r) => r.method() === 'PUT' && puts.push(r.url()))
  await goTo(page, 'Appearance')
  await inspector(page).getByRole('button', { name: 'Use Midnight palette' }).click()
  assert.equal(puts.length, 0)
  assert.equal(await status(), 'Unsaved changes')
  await inspector(page).getByText('Applied: Midnight.').waitFor()
  await page.waitForTimeout(400)
  await measureStage('edit 1440 left nav', { width: 1440, height: 900 })
  const nav = page.getByRole('navigation', { name: 'Workspace' })
  const label = nav.getByRole('button').first()
  assert.equal(await label.evaluate((el) => getComputedStyle(el).color), rgb(MIDNIGHT.text), 'inactive navigation labels use the text color, not the primary color')
  assert.equal(await page.locator('[data-widget-id]').first().evaluate((el) => getComputedStyle(el).backgroundColor), rgb(MIDNIGHT.surface), 'cards use the surface color')
  assert.equal(await computed('aside[aria-label="Inspector"]', 'backgroundColor'), chromeBefore.inspector, 'the inspector keeps its own color')
  assert.equal(await computed('[data-toolbar]', 'backgroundColor'), chromeBefore.toolbar, 'the toolbar keeps its own color')
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('aside:not([aria-label])')).backgroundColor), chromeBefore.rail, 'the application rail keeps its own color')
  await shot('midnight-edit-1440')

  log('dialogs keep the editor colors while a dark palette is applied')
  await goTo(page, 'Components')
  const dialogBg = await library(page).evaluate((el) => getComputedStyle(el).backgroundColor)
  assert.notEqual(dialogBg, rgb(MIDNIGHT.surface), 'the Add dialog is not painted with the user palette')
  assert.equal(await library(page).evaluate((el) => !!el.closest('[data-workspace-stage]')), false)
  await shot('midnight-add-dialog-1440')
  await page.keyboard.press('Escape')

  log('every navigation placement, Edit and Preview, at 1440 and 1024: the whole stage is themed')
  for (const placement of ['top', 'left', 'right']) {
    await goTo(page, 'Outline')
    await inspector(page).getByLabel('Navigation placement').selectOption(placement)
    await page.waitForTimeout(300)
    await measureStage(`edit 1440 ${placement}`, { width: 1440, height: 900 })
    await shot(`midnight-edit-1440-nav-${placement}`)
  }
  await page.getByRole('button', { name: 'Preview', exact: true }).click()
  await page.waitForTimeout(300)
  await measureStage('preview 1440 right', { width: 1440, height: 900 })
  await shot('midnight-preview-1440')
  await page.setViewportSize({ width: 1024, height: 768 })
  await page.waitForTimeout(500)
  await measureStage('preview 1024', { width: 1024, height: 768 })
  await shot('midnight-preview-1024')
  await page.getByRole('button', { name: 'Edit workspace' }).click()
  await page.waitForTimeout(500)
  await measureStage('edit 1024', { width: 1024, height: 768 })
  await shot('midnight-edit-1024')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(500)
  await measureStage('preview 390', { width: 390, height: 844 })
  await shot('midnight-preview-390')
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0, 'no sideways scroll at 390')
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.waitForTimeout(500)

  log('a bright palette and a custom widget override: the override stays, and Undo returns the original in one step')
  await goTo(page, 'Appearance')
  await inspector(page).getByRole('button', { name: 'Use Sunset palette' }).click()
  assert.equal(await computed('[data-workspace-stage]', 'backgroundColor'), rgb('#fff7ed'))
  await page.getByRole('button', { name: 'Undo', exact: true }).click() // one Undo undoes the whole palette
  assert.equal(await computed('[data-workspace-stage]', 'backgroundColor'), rgb(MIDNIGHT.background))
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('button', { name: 'Discard changes' }).click()
  assert.equal(await status(), 'All changes saved')
  assert.equal(await computed('[data-workspace-stage]', 'backgroundColor'), rgb('#f8fafc'), 'Cancel returned the original palette')

  log('Save: only theme fields change in the stored JSON; reload shows the same palette')
  await inspector(page).getByRole('button', { name: 'Use Midnight palette' }).click()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByText('All changes saved').waitFor()
  const saved = (await api('/workspace')).config
  assert.deepEqual({ ...saved, theme: null }, { ...original, theme: null }, 'everything except the theme is unchanged')
  assert.deepEqual(saved.theme, { ...original.theme, ...MIDNIGHT })
  await page.reload()
  await inspector(page).waitFor()
  assert.equal(await computed('[data-workspace-stage]', 'backgroundColor'), rgb(MIDNIGHT.background))

  log('Cancel restores the saved palette')
  await goTo(page, 'Appearance')
  await inspector(page).getByRole('button', { name: 'Use Forest palette' }).click()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('button', { name: 'Discard changes' }).click()
  assert.equal(await computed('[data-workspace-stage]', 'backgroundColor'), rgb(MIDNIGHT.background))

  console.log(`OK: palettes recolor the whole stage, navigation and cards; editor chrome is unchanged (screenshots in ${out})`)
} catch (error) {
  console.error(`FAILED at: ${step}`)
  await page.screenshot({ path: 'e2e-failure.png' }).catch(() => {})
  console.error(error)
  process.exitCode = 1
} finally {
  await browser.close()
}
