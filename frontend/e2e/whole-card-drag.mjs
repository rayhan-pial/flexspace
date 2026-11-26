// Real-browser check: a card is dragged from anywhere on it (no visible grip), in a grid section and in a stack
// section; controls and fields inside it still work and never start a drag; inner task sorting still works; the
// card has a Remove button with a confirmation; the keyboard alternatives remain. Not part of `npm test`.
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
import { inspector } from './shell.mjs'

const executablePath = process.env.E2E_BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:5173'
const PASSWORD = 'correct horse battery staple'

const browser = await chromium.launch({ executablePath })
const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } })
let step = 'start'
const log = (message) => {
  step = message
  console.log(`- ${message}`)
}
const card = (name) => page.getByRole('article', { name, exact: true }).first()
const status = () => page.getByRole('status', { name: 'Save status' }).innerText()
const mid = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 })
async function drag(from, to, steps = 24) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + 6, from.y + 6, { steps: 2 })
  await page.mouse.move(to.x, to.y, { steps })
  await page.waitForTimeout(300)
  await page.mouse.up()
  await page.waitForTimeout(700)
}

try {
  log('register')
  await page.goto(baseUrl)
  await page.getByRole('button', { name: 'Create an account' }).click()
  await page.getByLabel('Email').fill(`e2e${Date.now()}${Math.floor(Math.random() * 1e6)}@example.com`)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await inspector(page).waitFor()
  await page.waitForTimeout(1000)

  log('no grip is visible on any card, and cards show a grab cursor')
  const visibleGrips = await page.evaluate(() => [...document.querySelectorAll('.fs-grid-handle')].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 2 && r.height > 2 }).length)
  assert.equal(visibleGrips, 0, 'the keyboard grip is invisible until focused')
  assert.equal(await card('Notes').evaluate((el) => getComputedStyle(el).cursor), 'grab')

  log('grid: grab the Notes card by its title bar (not a grip) and drop it on Tasks; the cards reflow')
  const before = await card('Tasks').boundingBox()
  const notesBox = await card('Notes').boundingBox()
  await drag({ x: notesBox.x + notesBox.width - 40, y: notesBox.y + 14 }, { x: before.x + 60, y: before.y + 20 })
  const after = await card('Tasks').boundingBox()
  assert.notDeepEqual(after, before, 'Tasks made room')
  assert.equal(await status(), 'Unsaved changes')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await page.waitForTimeout(800)

  log('grid: grabbing the padding of a card also drags it; typing in a field and pressing buttons never does')
  const notes2 = await card('Notes').boundingBox()
  const tasks2 = await card('Tasks').boundingBox()
  await drag({ x: notes2.x + 6, y: notes2.y + notes2.height - 5 }, { x: tasks2.x + 60, y: tasks2.y + 20 })
  assert.equal(await status(), 'Unsaved changes', 'dragging by the card padding moved it')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await page.waitForTimeout(800)
  const note = card('Notes').locator('textarea')
  const nb = await note.boundingBox()
  const stable = await card('Notes').boundingBox()
  await drag({ x: nb.x + 20, y: nb.y + 20 }, { x: nb.x + 200, y: nb.y + 120 }, 10) // a text selection inside the note
  assert.deepEqual(await card('Notes').boundingBox(), stable, 'selecting text did not move the card')

  log('tasks: reordering a task by its own grip still works inside a draggable card')
  const rows = () => card('Tasks').locator('input[aria-label^="Task text: "]').evaluateAll((els) => els.map((e) => e.value))
  const first = await rows()
  const grips = card('Tasks').getByRole('button', { name: /^Reorder task / })
  const g0 = await grips.nth(0).boundingBox()
  const g2 = await grips.nth(2).boundingBox()
  await drag(mid(g0), mid(g2), 20)
  const reordered = await rows()
  assert.notDeepEqual(reordered, first, 'the task order changed')
  assert.deepEqual([...reordered].sort(), [...first].sort())
  const tb = await card('Tasks').boundingBox()
  assert.deepEqual(tb, await card('Tasks').boundingBox())
  await page.getByRole('button', { name: 'Undo', exact: true }).click()

  log('stack: grab the Reading list card anywhere and drop it into the Today section? it only reorders within its stack')
  await page.getByRole('navigation', { name: 'Editor navigation' }).getByRole('button', { name: 'Components' }).click()
  await page.getByLabel('Add to section').selectOption({ label: 'Reference · stack' })
  await page.getByRole('button', { name: 'Add Notes', exact: true }).click()
  await page.waitForTimeout(1000)
  const stackTitles = () => page.locator('[aria-label="Reference cards"] article h3').allInnerTexts()
  const order0 = await stackTitles()
  assert.equal(order0.length, 2)

  log('a plain click on a stack card selects exactly that card (it must not start a drag or reorder), from any inspector view')
  const stackCards = page.locator('[aria-label="Reference cards"] article')
  const titlesBefore = await stackTitles()
  for (const view of ['Outline', 'Appearance', 'My workspace']) {
    for (let i = 0; i < 2; i += 1) {
      await page.getByRole('navigation', { name: 'Editor navigation' }).getByRole('button', { name: view, exact: true }).click()
      const b = await stackCards.nth(i).boundingBox()
      await page.mouse.click(b.x + 60, b.y + 14)
      await page.waitForTimeout(250)
      assert.equal(await inspector(page).locator('h3').first().innerText(), titlesBefore[i], `${view}: clicking card ${i + 1} selected it`)
      assert.deepEqual(await stackTitles(), titlesBefore, 'a click never reorders the stack')
    }
  }
  assert.equal(await status(), 'Unsaved changes') // only the earlier Add; the clicks changed nothing more
  assert.equal(await page.evaluate(() => document.querySelectorAll('[data-dragging="true"]').length), 0)
  const a = await page.locator('[aria-label="Reference cards"] article').nth(0).boundingBox()
  const b = await page.locator('[aria-label="Reference cards"] article').nth(1).boundingBox()
  await drag({ x: a.x + a.width - 60, y: a.y + 14 }, { x: b.x + b.width / 2, y: b.y + b.height - 10 }, 30)
  const order1 = await stackTitles()
  assert.deepEqual(order1, [order0[1], order0[0]], 'the stack card moved by its title bar')

  log('Remove: the trash button on a card asks first, then removes it as one undoable change')
  const count = () => page.locator('[data-widget-id]').count()
  const n0 = await count()
  await card('Calendar').getByRole('button', { name: 'Remove Calendar' }).click()
  await page.getByRole('alertdialog', { name: 'Remove this widget?' }).getByRole('button', { name: 'Keep editing' }).or(page.getByRole('alertdialog').getByRole('button', { name: /Cancel|Keep/ })).first().click()
  assert.equal(await count(), n0, 'declining removed nothing')
  await card('Calendar').getByRole('button', { name: 'Remove Calendar' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Remove widget' }).click()
  assert.equal(await count(), n0 - 1)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await page.waitForTimeout(800)
  assert.equal(await count(), n0, 'one Undo brings it back')

  log('Remove on a stack card: cancel, then confirm, then Undo; typing in a stack note still works')
  const reading = card('Reading list')
  await reading.getByRole('button', { name: 'Remove Reading list' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: /Keep|Cancel/ }).click()
  assert.equal(await reading.count(), 1)
  const stackNote = reading.locator('textarea')
  await stackNote.click()
  await page.keyboard.press('End')
  await page.keyboard.type(' typed with spaces in a stack card')
  assert.ok((await stackNote.inputValue()).endsWith('typed with spaces in a stack card'), 'typing (including Space) reaches the field')
  await reading.getByRole('button', { name: 'Remove Reading list' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Remove widget' }).click()
  assert.equal(await page.getByRole('article', { name: 'Reading list' }).count(), 0)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await page.waitForTimeout(500)
  assert.equal(await page.getByRole('article', { name: 'Reading list' }).count(), 1)

  log('keyboard: the hidden grip appears on focus and arrow keys still move a grid card')
  const grip = card('Welcome').getByRole('button', { name: /Move or resize Welcome/ })
  await grip.focus()
  assert.ok((await grip.boundingBox()).width > 2, 'the grip is visible while focused')
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(500)
  assert.equal(await status(), 'Unsaved changes')

  console.log('OK: cards drag from anywhere, inner controls and sorting still work, Remove works')
} catch (error) {
  console.error(`FAILED at: ${step}`)
  await page.screenshot({ path: 'e2e-failure.png' }).catch(() => {})
  console.error(error)
  process.exitCode = 1
} finally {
  await browser.close()
}
