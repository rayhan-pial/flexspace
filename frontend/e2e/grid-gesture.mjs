// Real-browser check of the React Grid Layout integration (FS-015). Not part of `npm test`.
//
// Needs the API and the Vite dev server running (see README) and a Chromium-family browser:
//   $env:E2E_BROWSER = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'   # default
//   $env:E2E_BASE_URL = 'http://localhost:5173'                                         # default
//   npm run test:browser
// It registers a throwaway account, so point the API at a scratch database.
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
import { goTo, inspector } from './shell.mjs'

const executablePath = process.env.E2E_BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:5173'

const browser = await chromium.launch({ executablePath })
const page = await browser.newPage({ viewport: { width: 1400, height: 1800 } })
let step = 'start'
const log = (message) => {
  step = message
  console.log(`- ${message}`)
}

const card = (id) => page.locator(`[data-widget-id="${id}"]`)
const box = async (id) => {
  const rect = await card(id).boundingBox()
  assert.ok(rect, `${id} has a box`)
  return rect
}
const status = () => page.getByRole('status').first().innerText()
const outlineOrder = async () => (await page.getByRole('list', { name: 'Components' }).locator('li li button').allInnerTexts()).map((t) => t.split('\n')[0])

async function drag(from, to, steps = 12) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + 5, from.y + 5, { steps: 2 }) // pass the 3px drag threshold
  await page.mouse.move(to.x, to.y, { steps })
  await page.mouse.up()
}

try {
  log('register a new account and open the editor')
  await page.goto(baseUrl)
  await page.getByRole('button', { name: 'Create an account' }).click()
  const email = `e2e${Date.now()}@example.com`
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('correct horse battery staple')
  await page.getByRole('button', { name: 'Create account' }).click()
  await inspector(page).waitFor()
  await goTo(page, 'Outline')
  assert.equal(await page.locator('.react-grid-item:not(.react-grid-placeholder)').count(), 4, 'the real library renders the four grid widgets')
  assert.equal(await status(), 'All changes saved')

  log('mount, panel/tab changes, navigation placement and window resize do not dirty the workspace')
  await goTo(page, 'Appearance')
  await goTo(page, 'My workspace')
  await goTo(page, 'Outline')
  await page.getByLabel('Navigation placement').selectOption('top')
  await page.getByLabel('Navigation placement').selectOption('left')
  await page.setViewportSize({ width: 1180, height: 1800 })
  await page.waitForTimeout(400)
  await page.setViewportSize({ width: 1400, height: 1800 })
  await page.waitForTimeout(400)
  assert.equal(await status(), 'All changes saved')

  // One grid column is (grid width + gap) / 12 wide, measured from the full-width Welcome card.
  const pitch = ((await box('w-welcome')).width + 16) / 12

  log('resize Notes narrower with its corner handle (6 -> 3 columns)')
  const notes = await box('w-notes')
  const grip = await page.locator('.react-grid-item:has([data-widget-id="w-notes"]) > .react-resizable-handle').boundingBox()
  const gripAt = { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 }
  await drag(gripAt, { x: gripAt.x - 3 * pitch, y: gripAt.y })
  await page.waitForTimeout(500)
  const narrow = await box('w-notes')
  assert.ok(Math.abs(narrow.width - (notes.width - 3 * pitch)) < 2, `Notes is 3 columns narrower (${notes.width} -> ${narrow.width})`)
  assert.equal(await status(), 'Unsaved changes')

  log('drag Notes right by its handle, into free columns')
  const handle = await card('w-notes').getByRole('heading', { level: 3 }).boundingBox() // a card is grabbed by its title, not a grip
  const handleAt = { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 }
  await drag(handleAt, { x: handleAt.x + 3 * pitch, y: handleAt.y })
  await page.waitForTimeout(500)
  const moved = await box('w-notes')
  assert.ok(Math.abs(moved.x - (narrow.x + 3 * pitch)) < 2, `Notes moved three columns right (${narrow.x} -> ${moved.x})`)
  assert.equal(moved.y, narrow.y)

  // Notes now has free columns on its left, so a drag that leaked from anywhere but the handle would visibly move it.
  log('selecting text inside a widget never drags it')
  const area = await card('w-notes').locator('textarea').boundingBox()
  await drag({ x: area.x + area.width - 10, y: area.y + 20 }, { x: area.x + area.width - 10 - 3 * pitch, y: area.y + 20 })
  assert.deepEqual(await box('w-notes'), moved, 'dragging inside the text area did not move the widget')

  const allBoxes = async () => {
    const ids = await page.evaluate(() => [...document.querySelectorAll('.react-grid-item:not(.react-grid-placeholder) [data-widget-id]')].map((e) => e.getAttribute('data-widget-id')))
    return Object.fromEntries(await Promise.all(ids.map(async (id) => [id, await box(id)])))
  }
  const noOverlaps = (boxes) => {
    const entries = Object.entries(boxes)
    for (const [a, p] of entries) for (const [b, q] of entries) {
      if (a < b) assert.ok(p.x + p.width <= q.x + 1 || q.x + q.width <= p.x + 1 || p.y + p.height <= q.y + 1 || q.y + q.height <= p.y + 1, `${a} and ${b} overlap`)
    }
  }
  const visualOrder = (boxes) => Object.entries(boxes).sort(([, p], [, q]) => Math.round(p.y) - Math.round(q.y) || Math.round(p.x) - Math.round(q.x)).map(([id]) => id)

  log('Escape during a drag abandons it: nothing changes, no dirty write, and dragging still works afterwards')
  const preEscape = await allBoxes()
  const statusBefore = await status()
  const hEsc = await card('w-notes').getByRole('heading', { level: 3 }).boundingBox() // a card is grabbed by its title, not a grip
  const escAt = { x: hEsc.x + hEsc.width / 2, y: hEsc.y + hEsc.height / 2 }
  await page.mouse.move(escAt.x, escAt.y)
  await page.mouse.down()
  await page.mouse.move(escAt.x + 5, escAt.y + 5, { steps: 2 })
  await page.mouse.move(escAt.x - 2 * pitch, escAt.y + 80, { steps: 8 })
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await page.waitForTimeout(500)
  assert.deepEqual(await allBoxes(), preEscape, 'Escape restored every widget')
  assert.equal(await status(), statusBefore, 'Escape did not change the save status')

  log('releasing outside the canvas (over the inspector) cancels instead of dropping')
  const insp = await inspector(page).boundingBox()
  await drag(escAt, { x: insp.x + insp.width / 2, y: insp.y + 200 }, 16)
  await page.waitForTimeout(500)
  assert.deepEqual(await allBoxes(), preEscape, 'an outside drop restored every widget')

  log('dragging into another widget pushes it out of the way: no overlap, and one Undo restores the whole layout')
  const handle2 = await card('w-notes').getByRole('heading', { level: 3 }).boundingBox() // a card is grabbed by its title, not a grip
  const at2 = { x: handle2.x + handle2.width / 2, y: handle2.y + handle2.height / 2 }
  const before = await allBoxes()
  const tasks = before['w-tasks']
  await drag(at2, { x: tasks.x + 60, y: tasks.y + 20 }, 20)
  await page.waitForTimeout(700)
  const after = await allBoxes()
  assert.notDeepEqual(after['w-tasks'], tasks, 'Tasks was pushed to make room')
  noOverlaps(after)
  for (const id of Object.keys(before)) assert.equal(Math.round(after[id].width), Math.round(before[id].width), `${id} kept its width`)
  const dropped = after['w-notes']
  assert.ok(Math.abs(dropped.x - tasks.x) < 2 * pitch, `Notes landed where it was dropped (${dropped.x} near ${tasks.x})`)
  await goTo(page, 'Outline')
  const outline = await outlineOrder()
  const titles = await Promise.all(visualOrder(after).map(async (id) => (await card(id).getByRole('heading').first().innerText()).trim()))
  assert.deepEqual(outline.filter((t) => titles.includes(t)), titles, 'the outline order matches what is drawn on the canvas')
  assert.equal(await status(), 'Unsaved changes')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await page.waitForTimeout(700)
  assert.deepEqual(await allBoxes(), before, 'one Undo restored the geometry of every widget')
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await page.waitForTimeout(700)
  assert.deepEqual(await allBoxes(), after, 'Redo returned the reflowed layout')

  log('Save, reload, and the geometry persists')
  await goTo(page, 'Outline')
  const beforeSave = { tasks: await box('w-tasks'), notes: await box('w-notes'), order: await outlineOrder() }
  await page.getByRole('button', { name: 'Save' }).click()
  await page.getByText('All changes saved').waitFor()
  await page.reload()
  await inspector(page).waitFor()
  await goTo(page, 'Outline')
  await page.waitForTimeout(500)
  const afterReload = { tasks: await box('w-tasks'), notes: await box('w-notes'), order: await outlineOrder() }
  assert.deepEqual(afterReload.order, beforeSave.order)
  assert.deepEqual(afterReload.tasks, beforeSave.tasks)
  assert.deepEqual(afterReload.notes, beforeSave.notes)
  assert.equal(await status(), 'All changes saved', 'a reloaded saved layout is not dirty')

  log('keyboard: focus a handle and press arrow keys')
  const keyHandle = card('w-notes').getByRole('button', { name: /Move or resize/ })
  const beforeKey = await box('w-notes')
  await keyHandle.focus()
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(400)
  assert.ok((await box('w-notes')).x > beforeKey.x, 'ArrowRight moved the widget one column')
  assert.equal(await status(), 'Unsaved changes')

  console.log('\nOK: real browser grid gestures pass')
} catch (error) {
  await page.screenshot({ path: process.env.E2E_SHOT ?? 'e2e-failure.png', fullPage: true }).catch(() => {})
  console.error(`\nFAILED at step: ${step}\n`, error)
  process.exitCode = 1
} finally {
  await browser.close()
}
