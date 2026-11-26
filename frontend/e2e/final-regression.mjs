// Final regression checks for the UI redesign (UI-018) that no other script proves: the saved
// workspace JSON survives Save, logout and login byte for byte; hidden entries and unknown widget
// payloads survive an unrelated edit; a fresh workspace still has the shape recorded before the
// redesign; and, in a touch-emulated browser, the editor's own controls meet the 44 px target size.
// Not part of `npm test`. Same prerequisites as grid-gesture.mjs. Run: node e2e/final-regression.mjs
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { chromium } from 'playwright-core'
import { goTo, inspector, library } from './shell.mjs'

const executablePath = process.env.E2E_BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:5173'
const PASSWORD = 'correct horse battery staple'
const email = `e2e${Date.now()}${Math.floor(Math.random() * 1e6)}@example.com`

const browser = await chromium.launch({ executablePath })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
let step = 'start'
const log = (message) => {
  step = message
  console.log(`- ${message}`)
}

const status = () => page.getByRole('status', { name: 'Save status' }).innerText()
const settle = () => page.waitForTimeout(900)

/** The saved workspace as the API returns it (the page's own session cookie). */
const getWorkspace = () =>
  page.evaluate(async () => {
    const response = await fetch('/api/workspace')
    return response.json()
  })

const putWorkspace = (baseRevision, config) =>
  page.evaluate(async ([revision, body]) => {
    const me = await (await fetch('/api/auth/me')).json()
    const response = await fetch('/api/workspace', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': me.csrfToken },
      body: JSON.stringify({ baseRevision: revision, config: body }),
    })
    return response.status
  }, [baseRevision, config])

/** The same document with every generated id removed, to compare designs without comparing random ids. */
function withoutIds(value) {
  if (Array.isArray(value)) return value.map(withoutIds)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).filter(([key]) => !['id', 'i', 'targetSectionId'].includes(key)).map(([key, inner]) => [key, withoutIds(inner)]))
  }
  return value
}

async function signIn(target) {
  await target.goto(baseUrl)
  await target.getByLabel('Email').fill(email)
  await target.getByLabel('Password').fill(PASSWORD)
  await target.getByRole('button', { name: 'Sign in', exact: true }).click()
  await inspector(target).waitFor()
}

try {
  log('register: a fresh workspace has the same structure as the one recorded before the redesign')
  await page.goto(baseUrl)
  await page.getByRole('button', { name: 'Create an account' }).click()
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await inspector(page).waitFor()
  await settle()
  const fresh = await getWorkspace()
  const baselinePath = new URL('../../artifacts/ui-review/before/baseline-workspace.json', import.meta.url)
  if (existsSync(baselinePath)) {
    const baseline = JSON.parse(JSON.parse(readFileSync(baselinePath, 'utf8')))
    assert.deepEqual(withoutIds(fresh.config), withoutIds(baseline.config), 'the default workspace changed shape since the baseline')
    assert.deepEqual(Object.keys(fresh).sort(), Object.keys(baseline).sort(), 'the API envelope changed shape')
    console.log('  (compared with artifacts/ui-review/before/baseline-workspace.json)')
  } else {
    console.log('  (baseline file not present in this clone; structure comparison skipped)')
  }
  assert.equal(fresh.config.schemaVersion, 1)

  log('edit (title, component, palette, hidden widget), Save, log out and in: the JSON is identical')
  await page.getByLabel('Workspace title').fill('Round trip')
  await goTo(page, 'Components')
  await library(page).getByRole('button', { name: 'Add Tasks', exact: true }).click()
  await goTo(page, 'Appearance')
  await inspector(page).getByRole('button', { name: 'Use Forest palette' }).click()
  await page.getByRole('article', { name: 'Welcome' }).click({ position: { x: 60, y: 12 } })
  await goTo(page, 'My workspace')
  await inspector(page).getByRole('button', { name: 'Hide widget' }).click()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByText('All changes saved').waitFor()
  const saved = await getWorkspace()
  assert.equal(saved.config.title, 'Round trip')
  assert.equal(saved.config.theme.primary, '#15803d')
  assert.ok(saved.config.sections.some((section) => section.widgets.some((widget) => widget.hidden)), 'a hidden widget is part of the saved document')
  await page.getByRole('button', { name: 'Log out' }).click()
  await page.getByLabel('Email').waitFor()
  await signIn(page)
  await settle()
  const restored = await getWorkspace()
  assert.deepEqual(restored.config, saved.config, 'the document after login is not the document that was saved')
  assert.equal(restored.revision, saved.revision)
  assert.equal(await status(), 'All changes saved')

  log('an unknown widget payload and the hidden entry survive an unrelated edit and Save')
  const stack = restored.config.sections.find((section) => section.kind === 'stack')
  assert.ok(stack, 'the Productivity workspace has a stack section')
  const unknown = { id: 'w-final-unknown', type: 'kanban', title: 'From a newer version', hidden: false, appearance: {}, props: { columns: [{ name: 'Todo', cards: [1, 2, 3] }], nested: { ok: true } } }
  const withUnknown = structuredClone(restored.config)
  withUnknown.sections.find((section) => section.id === stack.id).widgets.push(unknown)
  assert.equal(await putWorkspace(restored.revision, withUnknown), 200)
  await page.reload()
  await inspector(page).waitFor()
  await settle()
  await page.getByLabel('Workspace title').fill('Round trip, renamed')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByText('All changes saved').waitFor()
  const after = await getWorkspace()
  const keptWidget = after.config.sections.flatMap((section) => section.widgets).find((widget) => widget.id === 'w-final-unknown')
  assert.deepEqual(keptWidget, unknown, 'the unknown widget was altered')
  assert.deepEqual(
    after.config.sections.map((section) => section.widgets.map((widget) => [widget.id, widget.hidden === true])),
    withUnknown.sections.map((section) => section.widgets.map((widget) => [widget.id, widget.hidden === true])),
    'widget order or hidden state changed on an unrelated edit',
  )
  assert.equal(after.config.title, 'Round trip, renamed')

  log('touch-emulated Edit at 1100 px: the editor\'s own controls are at least 44 px tall and wide')
  const touch = await browser.newContext({ viewport: { width: 1100, height: 900 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 })
  const tablet = await touch.newPage()
  await signIn(tablet)
  await tablet.waitForTimeout(1200)
  assert.equal(await tablet.evaluate(() => matchMedia('(pointer: coarse)').matches), true, 'the touch context reports a coarse pointer')
  const small = []
  await goTo(tablet, 'My workspace')
  small.push(
    ...(await tablet.evaluate(() =>
      [...document.querySelectorAll('.fs-themed button, .fs-themed [role="button"]')]
        .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 2 && r.height > 2 && (r.height < 43.5 || r.width < 43.5) })
        .map((el) => `canvas: ${el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 24)} ${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`),
    )),
  )
  for (const view of ['My workspace', 'Outline', 'Components', 'Templates', 'Appearance']) {
    await goTo(tablet, view)
    await tablet.waitForTimeout(300)
    small.push(
      ...(await tablet.evaluate((where) => {
        const scopes = ['aside', '[data-toolbar]', '[role="dialog"]']
        const found = []
        for (const selector of scopes) {
          for (const scope of document.querySelectorAll(selector)) {
            for (const el of scope.querySelectorAll('button, [role="button"], select, input:not([type="checkbox"]):not([type="radio"]):not([type="color"]), textarea')) {
              const r = el.getBoundingClientRect()
              if (r.width === 0 || r.height === 0 || getComputedStyle(el).visibility === 'hidden' || el.closest('[hidden], [inert]')) continue
              if (r.height < 43.5 || r.width < 43.5) {
                const name = el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 24) || el.tagName
                found.push(`${where}: ${name} ${Math.round(r.width)}x${Math.round(r.height)}`)
              }
            }
          }
        }
        return found
      }, view)),
    )
    if (view === 'Components' || view === 'Templates') await tablet.keyboard.press('Escape')
  }
  console.log(`  (${small.length} controls under 44 px)${small.length ? ': ' + small.slice(0, 12).join('; ') : ''}`)
  assert.deepEqual(small, [], 'controls smaller than 44 px with a coarse pointer')
  await touch.close()

  console.log('\nOK: real browser final regression checks pass')
} catch (error) {
  await page.screenshot({ path: process.env.E2E_SHOT ?? 'e2e-failure.png', fullPage: true }).catch(() => {})
  console.error(`\nFAILED at step: ${step}\n`, error)
  process.exitCode = 1
} finally {
  await browser.close()
}
