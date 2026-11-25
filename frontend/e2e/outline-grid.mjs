// Real-browser, real-backend check of outline and grid ordering, and of the two drag engines staying
// out of each other's way (FS-023). Not part of `npm test`. Same prerequisites as grid-gesture.mjs.
// Run: npm run test:browser
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
import { goTo, inspector } from './shell.mjs'

const executablePath = process.env.E2E_BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:5173'
const PASSWORD = 'correct horse battery staple'

const browser = await chromium.launch({ executablePath })
const page = await browser.newPage({ viewport: { width: 2000, height: 2600 } })
let step = 'start'
const log = (message) => {
  step = message
  console.log(`- ${message}`)
}

const outline = page.getByRole('list', { name: 'Components' })
const status = () => page.getByRole('status', { name: 'Save status' }).innerText()
const outlineOrder = async () =>
  (await page.getByRole('list', { name: 'Today widgets' }).getByRole('button', { name: /in outline$/ }).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label').replace(/^Reorder /, '').replace(/ in outline$/, ''))))
const widgetCard = (title) => page.locator('[data-widget-id]').filter({ has: page.getByRole('heading', { level: 3, name: title, exact: true }) })
const boxOf = async (title) => {
  const box = await widgetCard(title).boundingBox()
  assert.ok(box, `${title} has a box`)
  return { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) }
}
const allBoxes = async () => Object.fromEntries(await Promise.all(['Welcome', 'Tasks', 'Notes', 'Calendar'].map(async (t) => [t, await boxOf(t)])))
const domOrder = () => page.locator('[data-section-id] [data-widget-id]').evaluateAll((els) => els.map((e) => e.querySelector('h3')?.textContent))
const sectionTitles = () => page.locator('[data-section-id] > div > h2').allInnerTexts()
const taskTexts = () => widgetCard('Tasks').locator('input[aria-label^="Task text: "]').evaluateAll((els) => els.map((e) => e.value))
const center = async (locator) => {
  const box = await locator.boundingBox()
  assert.ok(box, 'element has a box')
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}
const outlineGrip = (label) => page.getByRole('button', { name: `Reorder ${label} in outline` })
const clean = async (what) => assert.equal(await status(), 'All changes saved', `${what} left the workspace clean`)

async function drag(from, to, { release = true, steps = 25 } = {}) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + 4, from.y + 4, { steps: 3 })
  await page.mouse.move(to.x, to.y, { steps })
  await page.waitForTimeout(250)
  if (release) {
    await page.mouse.up()
    await page.waitForTimeout(500)
  }
}

try {
  log('register; a clean starter workspace')
  const email = `e2e${Date.now()}@example.com`
  await page.goto(baseUrl)
  await page.getByRole('button', { name: 'Create an account' }).click()
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await inspector(page).waitFor()
  await goTo(page, 'Outline')
  await outline.waitFor()
  assert.deepEqual(await outlineOrder(), ['Welcome', 'Tasks', 'Notes', 'Calendar'])
  const original = await allBoxes()
  const originalTasks = await taskTexts()
  await clean('opening the workspace')

  log('cancelled gestures never dirty a clean workspace (outline, task row, section)')
  const a = await center(outlineGrip('Calendar'))
  const b = await center(outlineGrip('Welcome'))
  await drag(a, { x: b.x, y: b.y - 6 }, { release: false })
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await page.waitForTimeout(500)
  assert.deepEqual(await outlineOrder(), ['Welcome', 'Tasks', 'Notes', 'Calendar'])
  await clean('an Escaped outline drag')

  const g1 = await center(widgetCard('Tasks').getByRole('button', { name: `Reorder task ${originalTasks[2]}` }))
  const g2 = await center(widgetCard('Tasks').getByRole('button', { name: `Reorder task ${originalTasks[0]}` }))
  await drag(g1, { x: g2.x, y: g2.y - 4 }, { release: false })
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await page.waitForTimeout(500)
  assert.deepEqual(await taskTexts(), originalTasks)
  await clean('an Escaped task drag')

  const s1 = await center(page.getByRole('button', { name: 'Reorder section Today' }))
  const s2 = await center(page.getByRole('button', { name: 'Reorder section Reference' }))
  await drag(s1, { x: s2.x, y: s2.y + 10 }, { release: false })
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await page.waitForTimeout(500)
  assert.deepEqual(await sectionTitles(), ['Today', 'Reference'])
  await clean('an Escaped section drag')

  log('grid gestures that end where they began do not dirty it either (move and resize)')
  const welcomeHandle = widgetCard('Welcome').getByRole('button', { name: /^Move or resize Welcome/ })
  const w = await center(welcomeHandle)
  await drag(w, { x: w.x + 2, y: w.y + 2 }) // far less than one grid cell
  assert.deepEqual(await allBoxes(), original)
  await clean('a grid drag that moved nothing')
  const grip = page.locator('.react-grid-item:has([data-widget-id]) > .react-resizable-handle').nth(2)
  const gp = await center(grip)
  await drag(gp, { x: gp.x + 2, y: gp.y + 2 })
  assert.deepEqual(await allBoxes(), original)
  await clean('a resize that changed nothing')

  log('outline reorder: drag Calendar above Welcome; the canvas repacks to match')
  await goTo(page, 'Outline') // pressing a card's handle on the canvas switched the inspector to Properties
  const cal = await center(outlineGrip('Calendar'))
  const wel = await center(outlineGrip('Welcome'))
  await drag(cal, { x: wel.x, y: wel.y - 6 })
  assert.deepEqual(await outlineOrder(), ['Calendar', 'Welcome', 'Tasks', 'Notes'])
  const afterOutline = await allBoxes()
  assert.ok(afterOutline.Calendar.y < afterOutline.Welcome.y, 'Calendar is now above Welcome on the canvas')
  assert.ok(afterOutline.Welcome.y < afterOutline.Tasks.y, 'Welcome is above Tasks')
  assert.equal(afterOutline.Calendar.x, afterOutline.Welcome.x)
  assert.equal(await status(), 'Unsaved changes')
  assert.deepEqual((await domOrder()).slice(0, 4), ['Calendar', 'Welcome', 'Tasks', 'Notes'])

  log('below desktop width the same order is shown (the array order), without writing anything')
  await page.setViewportSize({ width: 900, height: 2600 })
  await page.waitForTimeout(500)
  assert.deepEqual((await domOrder()).slice(0, 4), ['Calendar', 'Welcome', 'Tasks', 'Notes'])
  await page.setViewportSize({ width: 2000, height: 2600 })
  await page.waitForTimeout(500)
  assert.equal(await status(), 'Unsaved changes') // still exactly the one unsaved change

  log('grid movement updates the semantic order: drag Welcome by its grid handle to the bottom')
  const handle = widgetCard('Welcome').getByRole('button', { name: /^Move or resize Welcome/ })
  const notesBox = await boxOf('Notes')
  await drag(await center(handle), { x: notesBox.x + 40, y: notesBox.y + notesBox.height + 160 }, { steps: 35 })
  const afterGrid = await outlineOrder()
  assert.equal(afterGrid.at(-1), 'Welcome', `Welcome is now last in the outline (${afterGrid.join(', ')})`)
  assert.deepEqual(afterGrid.slice(0, 3), ['Calendar', 'Tasks', 'Notes'])

  log('event isolation: a task row drag does not move the grid widget or reorder the outline')
  const before = { boxes: await allBoxes(), outline: await outlineOrder(), tasks: await taskTexts() }
  const t1 = await center(widgetCard('Tasks').getByRole('button', { name: `Reorder task ${before.tasks[2]}` }))
  const t2 = await center(widgetCard('Tasks').getByRole('button', { name: `Reorder task ${before.tasks[0]}` }))
  await drag(t1, { x: t2.x, y: t2.y - 4 })
  assert.deepEqual(await taskTexts(), [before.tasks[2], before.tasks[0], before.tasks[1]])
  assert.deepEqual(await allBoxes(), before.boxes, 'no widget moved')
  assert.deepEqual(await outlineOrder(), before.outline, 'the outline order did not change')

  log('event isolation: a grid move and a resize do not reorder task rows, the outline (beyond the sync) or sections')
  const rowsBefore = await taskTexts()
  const sectionsBefore = await sectionTitles()
  const resizeGrip = page.locator('.react-grid-item:has([data-widget-id]) > .react-resizable-handle').nth(2)
  const rg = await center(resizeGrip)
  const notesBefore = await boxOf('Notes')
  await drag(rg, { x: rg.x - 100, y: rg.y + 40 })
  assert.deepEqual(await taskTexts(), rowsBefore)
  assert.deepEqual(await sectionTitles(), sectionsBefore)
  assert.equal(await page.locator('[data-container-id].ring-2').count(), 0, 'no drop highlight left behind')
  const notesAfter = await boxOf('Notes')
  assert.ok(notesAfter.width < notesBefore.width, `the resize itself worked (Notes ${notesBefore.width} -> ${notesAfter.width} px wide)`)

  log('event isolation: dragging a section does not move or resize any widget inside it')
  const insideBefore = await allBoxes()
  const sec1 = await center(page.getByRole('button', { name: 'Reorder section Today' }))
  const sec2 = await center(page.getByRole('button', { name: 'Reorder section Reference' }))
  await drag(sec1, { x: sec2.x, y: sec2.y + 10 })
  assert.deepEqual(await sectionTitles(), ['Reference', 'Today'])
  const insideAfter = await allBoxes()
  for (const name of Object.keys(insideBefore)) {
    assert.equal(insideAfter[name].width, insideBefore[name].width, `${name} keeps its width`)
    assert.equal(insideAfter[name].height, insideBefore[name].height, `${name} keeps its height`)
  }

  log('Save, reload: positions and both orders are reproduced exactly')
  const expected = { boxes: await allBoxes(), outline: await outlineOrder(), sections: await sectionTitles(), tasks: await taskTexts(), dom: await domOrder() }
  await page.getByRole('button', { name: 'Save' }).click()
  await page.getByText('All changes saved').waitFor()
  await page.reload()
  await inspector(page).waitFor()
  await goTo(page, 'Outline')
  await outline.waitFor()
  assert.deepEqual({ boxes: await allBoxes(), outline: await outlineOrder(), sections: await sectionTitles(), tasks: await taskTexts(), dom: await domOrder() }, expected)
  await clean('reloading the saved workspace')

  console.log('\nOK: real browser outline and grid ordering passes')
} catch (error) {
  await page.screenshot({ path: process.env.E2E_SHOT ?? 'e2e-failure.png', fullPage: true }).catch(() => {})
  console.error(`\nFAILED at step: ${step}\n`, error)
  process.exitCode = 1
} finally {
  await browser.close()
}
