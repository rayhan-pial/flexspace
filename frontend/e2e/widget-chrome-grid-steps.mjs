// Real-browser, real-backend check of the refined widget chrome, the grid click controls and the
// minimum-size layout of Tasks and Calendar (UI-011 to UI-014). Not part of `npm test`.
// Same prerequisites as grid-gesture.mjs. Run: node e2e/widget-chrome-grid-steps.mjs
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
import { inspector } from './shell.mjs'

const executablePath = process.env.E2E_BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:5173'
const PASSWORD = 'correct horse battery staple'

const browser = await chromium.launch({ executablePath })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
let step = 'start'
const log = (message) => {
  step = message
  console.log(`- ${message}`)
}

const panel = inspector(page)
const status = () => page.getByRole('status', { name: 'Save status' }).innerText()
const card = (name) => page.getByRole('article', { name }).first()
const size = (name) => card(name).evaluate((el) => [Math.round(el.getBoundingClientRect().width), Math.round(el.getBoundingClientRect().height)])
const settle = () => page.waitForTimeout(900)

try {
  log('register: the default workspace shows type icons and no selection label')
  await page.goto(baseUrl)
  await page.getByRole('button', { name: 'Create an account' }).click()
  await page.getByLabel('Email').fill(`e2e${Date.now()}${Math.floor(Math.random() * 1e6)}@example.com`)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await panel.waitFor()
  await settle()
  assert.equal(await page.getByText('Selected', { exact: true }).count(), 0)
  assert.ok((await card('Tasks').locator('svg[aria-hidden="true"]').count()) > 0, 'the header carries a decorative type icon')

  log('selecting a widget labels it in words and opens its Properties without dirtying the draft')
  await card('Tasks').click({ position: { x: 60, y: 12 } })
  await card('Tasks').getByText('Selected', { exact: true }).waitFor()
  await panel.getByRole('heading', { name: 'Properties' }).waitFor()
  assert.equal(await status(), 'All changes saved')

  log('step buttons: Narrower is one column, a refused step explains itself and changes nothing')
  const [w0, h0] = await size('Tasks')
  await panel.getByRole('button', { name: 'Make Tasks narrower' }).click()
  await settle()
  const [w1, h1] = await size('Tasks')
  assert.ok(w1 < w0 && h1 === h0, `expected a narrower Tasks (${w0} to ${w1})`)
  assert.equal(await status(), 'Unsaved changes')
  const left = panel.getByRole('button', { name: 'Move Tasks left' })
  assert.equal(await left.isDisabled(), true, 'Left is natively disabled at column 0 before any click')
  assert.equal(await left.getAttribute('aria-describedby') !== null, true, 'the reason is attached to the button')
  await panel.getByText(/Unavailable now: .*Left \(already at the left edge of the grid\)/).waitFor()
  assert.equal(await panel.getByRole('alert').count(), 0, 'no error was needed')
  assert.deepEqual(await size('Tasks'), [w1, h1], 'nothing changed')
  assert.equal(await status(), 'Unsaved changes')
  assert.equal(await panel.getByRole('button', { name: 'Move Tasks right' }).isDisabled(), false, 'a valid step stays enabled')

  log('step buttons: Undo reverses a step, and widening onto a neighbour pushes it instead of refusing (UI-021)')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await settle()
  assert.deepEqual(await size('Tasks'), [w0, h0])
  assert.equal(await status(), 'All changes saved')
  await panel.getByRole('button', { name: 'Make Tasks wider' }).click()
  await settle()
  assert.equal(await panel.getByRole('alert').count(), 0, 'a step onto a neighbour is not an error')
  assert.ok((await size('Tasks'))[0] > w0, 'Tasks became wider')
  assert.equal(await status(), 'Unsaved changes')
  const rects = await page.evaluate(() => [...document.querySelectorAll('.react-grid-item:not(.react-grid-placeholder)')].map((e) => e.getBoundingClientRect()))
  for (const [i, p] of rects.entries()) for (const q of rects.slice(i + 1)) {
    assert.ok(p.right <= q.left + 1 || q.right <= p.left + 1 || p.bottom <= q.top + 1 || q.bottom <= p.top + 1, 'no two widgets overlap after the push')
  }
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await settle()
  assert.deepEqual(await size('Tasks'), [w0, h0])

  log('a real pointer drag of the resize corner still commits a change')
  await panel.getByRole('button', { name: 'Make Tasks narrower' }).click()
  await settle()
  const before = await size('Tasks')
  const grip = page.locator('.react-grid-item', { has: card('Tasks') }).locator('.react-resizable-handle')
  const gb = await grip.boundingBox()
  await page.mouse.move(gb.x + 12, gb.y + 12)
  await page.mouse.down()
  await page.mouse.move(gb.x - 90, gb.y + 12, { steps: 10 })
  await page.mouse.up()
  await settle()
  const after = await size('Tasks')
  assert.ok(after[0] < before[0], `the resize corner should narrow Tasks (${before[0]} to ${after[0]})`)

  log('Save then reload keeps the new geometry')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByText('All changes saved').waitFor()
  await page.reload()
  await panel.waitFor()
  await settle()
  assert.deepEqual(await size('Tasks'), after)

  log('minimum size: Tasks and Calendar neither overflow sideways nor lose their controls')
  for (const name of ['Tasks', 'Calendar']) {
    await card(name).click({ position: { x: 60, y: 12 } })
    for (const word of ['narrower', 'shorter']) {
      const button = panel.getByRole('button', { name: new RegExp(`^Make .* ${word}$`) })
      for (let i = 0; i < 14 && (await button.isEnabled()); i += 1) await button.click()
      assert.equal(await button.isDisabled(), true, `${name} ${word} is disabled at its minimum`)
    }
    await settle()
    const overflow = await card(name).evaluate((el) => {
      const scroller = el.querySelector('.fs-scroll')
      return scroller ? scroller.scrollWidth - scroller.clientWidth : 0
    })
    assert.equal(overflow, 0, `${name} scrolls sideways at its minimum size`)
  }
  await card('Tasks').getByRole('button', { name: /Reorder task/ }).first().waitFor()
  await card('Calendar').getByRole('button', { name: 'Next month' }).waitFor()

  console.log('\nOK: real browser widget chrome and grid click controls pass')
} catch (error) {
  await page.screenshot({ path: process.env.E2E_SHOT ?? 'e2e-failure.png', fullPage: true }).catch(() => {})
  console.error(`\nFAILED at step: ${step}\n`, error)
  process.exitCode = 1
} finally {
  await browser.close()
}
