// Real-browser check of UI-029 at an actual 200% browser zoom (not a device-metrics emulation): the browser's own
// per-site zoom level is written into a throwaway profile (the same preference Ctrl+Plus changes), then the app is
// opened in that profile. A 1440 px window at 200% gives a 720 css px viewport and devicePixelRatio 2.
// Verifies: the zoom really applied, the editor degrades to the explained Preview without sideways scrolling, text
// is not clipped, controls keep visible focus and the reasons stay attached. Not part of `npm test`.
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright-core'

const executablePath = process.env.E2E_BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:5173'
const PASSWORD = 'correct horse battery staple'
const host = new URL(baseUrl).hostname
// Chromium zoom level n means a factor of 1.2^n; 3.8018 is 200%.
const ZOOM_LEVEL = Math.log(2) / Math.log(1.2)

const profile = mkdtempSync(join(tmpdir(), 'fs-zoom-'))
mkdirSync(join(profile, 'Default'), { recursive: true })
writeFileSync(
  join(profile, 'Default', 'Preferences'),
  JSON.stringify({ partition: { per_host_zoom_levels: { x: { [host]: { zoom_level: ZOOM_LEVEL, last_modified: '13300000000000000' } } } } }),
)

let step = 'start'
const log = (message) => {
  step = message
  console.log(`- ${message}`)
}
let context
try {
  context = await chromium.launchPersistentContext(profile, { executablePath, viewport: null, args: ['--window-size=1440,1000'], headless: process.env.E2E_HEADED !== '1' })
  const page = context.pages()[0] ?? (await context.newPage())

  log('the browser applies 200% zoom to the app (devicePixelRatio 2, half the css width)')
  await page.goto(baseUrl)
  await page.getByRole('button', { name: 'Create an account' }).waitFor()
  const metrics = await page.evaluate(() => ({ dpr: window.devicePixelRatio, inner: window.innerWidth, outer: window.outerWidth }))
  console.log(`  devicePixelRatio ${metrics.dpr}, innerWidth ${metrics.inner}, outerWidth ${metrics.outer}`)
  assert.ok(metrics.dpr >= 1.95 && metrics.dpr <= 2.05, `zoom is 200% (devicePixelRatio ${metrics.dpr})`)

  log('sign-in screen at 200%: no sideways scrolling, every control reachable')
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  assert.equal(await overflow(), 0)
  await page.getByRole('button', { name: 'Create an account' }).click()
  assert.equal(await overflow(), 0)
  await page.getByLabel('Email').fill(`e2e${Date.now()}${Math.floor(Math.random() * 1e6)}@example.com`)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.getByRole('heading', { level: 1 }).first().waitFor()
  await page.waitForTimeout(800)

  log('the workspace at 200%: Preview with the plain-words note, no sideways scrolling, no clipped text')
  assert.equal(await overflow(), 0, 'no horizontal page scroll at 200% zoom')
  assert.ok((await page.getByRole('note').innerText()).includes('1024 px wide'))
  const clipped = await page.evaluate(() =>
    [...document.querySelectorAll('h1, h2, h3, button, label, [role="status"], [role="alert"], [role="note"]')]
      .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.right > innerWidth + 1 })
      .map((el) => `${el.tagName} ${el.textContent?.trim().slice(0, 30)}`),
  )
  assert.deepEqual(clipped, [], 'nothing extends past the right edge of the 720 css px viewport')
  const tasks = page.getByRole('article', { name: 'Tasks' })
  await tasks.getByRole('checkbox').first().click() // tasks still work in Preview
  assert.equal(await page.getByRole('status', { name: 'Save status' }).innerText().then((t) => t.startsWith('Unsaved changes')), true)

  log('keyboard focus is visible on every tabbable control at 200%')
  const unfocused = []
  const stops = await page.evaluate(() => [...document.querySelectorAll('button, input, a[href], textarea, select, [tabindex="0"]')].filter((el) => !el.disabled && el.getBoundingClientRect().width > 0).length)
  for (let i = 0; i < Math.min(stops, 40); i += 1) {
    await page.keyboard.press('Tab')
    const visible = await page.evaluate(() => {
      const el = document.activeElement
      if (!el || el === document.body) return true
      const focused = getComputedStyle(el)
      const outline = focused.outlineStyle !== 'none' && parseFloat(focused.outlineWidth) > 0
      const shadow = focused.boxShadow !== 'none'
      const focusedBorder = focused.borderColor
      el.blur()
      const idleBorder = getComputedStyle(el).borderColor
      el.focus()
      return outline || shadow || focusedBorder !== idleBorder // a ring, or at least a changed border (form fields)
    })
    if (!visible) unfocused.push(i)
  }
  assert.deepEqual(unfocused, [], 'every focused control shows a focus indicator')

  console.log(`OK: real 200% browser zoom (devicePixelRatio ${metrics.dpr}, ${metrics.inner} css px wide) passes`)
} catch (error) {
  console.error(`FAILED at: ${step}`)
  console.error(error)
  process.exitCode = 1
} finally {
  await context?.close()
  rmSync(profile, { recursive: true, force: true })
}
