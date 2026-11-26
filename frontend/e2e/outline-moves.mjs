// Real-browser check of the Outline's drag and drop: whole sections can be reordered (each moves with all of its
// widgets), widgets can be reordered inside any section (grid or stack), and a widget can be dragged into any other
// section at a chosen place. Uses the Creative template (Studio, Ideas, Archive) so there are several sections with
// several widgets. Undo, Save and reload keep the result. Not part of `npm test`. Run: npm run test:browser
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
import { goTo, inspector, templates } from './shell.mjs'

const executablePath = process.env.E2E_BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:5173'
const PASSWORD = 'correct horse battery staple'

const browser = await chromium.launch({ executablePath })
const page = await browser.newPage({ viewport: { width: 1440, height: 2400 } })
let step = 'start'
const log = (message) => {
  step = message
  console.log(`- ${message}`)
}
const outline = () => page.getByRole('list', { name: 'Components', exact: true })
const status = () => page.getByRole('status', { name: 'Save status' }).innerText()

/** The sections as the outline lists them, each with its widget titles, read from the outline itself. */
const outlineTree = () =>
  outline().evaluate((root) =>
    [...root.querySelectorAll(':scope > li')].map((li) => ({
      section: li.querySelector(':scope > div > div > button, :scope > div > button')?.textContent?.trim().replace(/hidden$/, '') ?? '',
      widgets: [...li.querySelectorAll('ul[aria-label$=" widgets"] > li button:not([aria-label])')].map((b) => b.textContent.trim().replace(/hidden$/, '')),
    })),
  )
/** The sections on the canvas, in order, each with the widget titles it draws. */
const canvasTree = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-section-id]')].map((s) => ({
      section: s.querySelector('h2')?.textContent?.trim() ?? '',
      widgets: [...s.querySelectorAll('[data-widget-id] h3')].map((h) => h.textContent.trim()),
    })),
  )
const grip = (label) => page.getByRole('button', { name: label, exact: true })
const mid = (box) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 })
async function drag(from, to, steps = 30) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + 4, from.y + 4, { steps: 3 })
  await page.mouse.move(to.x, to.y, { steps })
  await page.waitForTimeout(300)
  await page.mouse.up()
  await page.waitForTimeout(900)
}
const sameSet = (a, b) => assert.deepEqual([...a].sort(), [...b].sort())

try {
  log('register and apply the Creative template: sections Studio, Ideas, Archive, each with several widgets')
  await page.goto(baseUrl)
  await page.getByRole('button', { name: 'Create an account' }).click()
  await page.getByLabel('Email').fill(`e2e${Date.now()}${Math.floor(Math.random() * 1e6)}@example.com`)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await inspector(page).waitFor()
  await goTo(page, 'Templates')
  await templates(page).getByRole('radio', { name: /Creative/ }).check()
  await templates(page).getByRole('button', { name: 'Apply Creative' }).click()
  await templates(page).getByText(/is now in your draft/).waitFor()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByText('All changes saved').waitFor()
  await goTo(page, 'Outline')
  await page.waitForTimeout(800)
  const start = await outlineTree()
  console.log('  outline:', JSON.stringify(start))
  assert.deepEqual(start.map((s) => s.section), ['Studio', 'Ideas', 'Archive'])
  assert.ok(start.every((s) => s.widgets.length >= 2), 'every section has at least two widgets')
  assert.deepEqual(await canvasTree(), start, 'the canvas shows the same sections and widgets')
  await inspector(page).screenshot({ path: new URL('../../artifacts/ui-review/after/outline-draggable-sections.png', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') })

  log('every section has a grip, and every widget in every section has one (not only the first section)')
  for (const s of start) {
    assert.equal(await grip(`Reorder section ${s.section} in outline`).count(), 1)
    for (const w of s.widgets) assert.equal(await grip(`Reorder ${w} in outline`).count() >= 1, true, `${w} has a grip`)
  }

  log('drag the Studio section below Ideas: the whole section with its widgets takes second place')
  const sectionGrip = await grip('Reorder section Studio in outline').boundingBox()
  const ideasRow = await outline().locator(':scope > li').nth(1).boundingBox()
  await drag(mid(sectionGrip), { x: mid(sectionGrip).x, y: ideasRow.y + ideasRow.height - 6 })
  const afterSections = await outlineTree()
  assert.deepEqual(afterSections.map((s) => s.section), ['Ideas', 'Studio', 'Archive'])
  assert.deepEqual(afterSections.find((s) => s.section === 'Studio').widgets, start[0].widgets, 'Studio kept all its widgets in order')
  assert.deepEqual(afterSections.find((s) => s.section === 'Ideas').widgets, start[1].widgets)
  assert.deepEqual(await canvasTree(), afterSections, 'the canvas follows the outline')
  assert.equal(await status(), 'Unsaved changes')

  log('Undo puts the sections back in one step')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await page.waitForTimeout(700)
  assert.deepEqual((await outlineTree()).map((s) => s.section), ['Studio', 'Ideas', 'Archive'])

  log('reorder widgets inside the first section (a grid): drag the first widget to the third place')
  const studio = (await outlineTree())[0].widgets
  const g1 = await grip(`Reorder ${studio[0]} in outline`).boundingBox()
  const g3 = await grip(`Reorder ${studio[2] ?? studio[1]} in outline`).boundingBox()
  await drag(mid(g1), { x: mid(g3).x, y: g3.y + g3.height + 4 })
  const studioAfter = (await outlineTree())[0].widgets
  assert.notDeepEqual(studioAfter, studio, 'the order of the Studio widgets changed')
  sameSet(studioAfter, studio)
  assert.deepEqual((await canvasTree())[0].widgets, studioAfter, 'the canvas order follows')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await page.waitForTimeout(700)

  log('reorder widgets inside another section (the Ideas stack) - this used to be impossible')
  const ideas = (await outlineTree())[1].widgets
  const i1 = await grip(`Reorder ${ideas[0]} in outline`).boundingBox()
  const i2 = await grip(`Reorder ${ideas[1]} in outline`).boundingBox()
  await drag(mid(i1), { x: mid(i2).x, y: i2.y + i2.height + 4 })
  const ideasAfter = (await outlineTree())[1].widgets
  assert.notDeepEqual(ideasAfter, ideas, 'the order of the Ideas widgets changed')
  sameSet(ideasAfter, ideas)
  assert.deepEqual((await canvasTree())[1].widgets, ideasAfter)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await page.waitForTimeout(700)

  log('drag a widget from Studio into the Archive section, between its widgets')
  const before = await outlineTree()
  const moving = before[0].widgets[0]
  const archiveFirst = before[2].widgets[0]
  const mg = await grip(`Reorder ${moving} in outline`).boundingBox()
  const ag = await grip(`Reorder ${archiveFirst} in outline`).boundingBox()
  await drag(mid(mg), { x: mid(ag).x, y: ag.y + ag.height + 4 })
  const moved = await outlineTree()
  assert.equal(moved[0].widgets.includes(moving), false, 'it left Studio')
  assert.equal(moved[2].widgets.includes(moving), true, 'it is now in Archive')
  assert.equal(moved.flatMap((s) => s.widgets).filter((w) => w === moving).length, 1, 'it exists exactly once')
  assert.equal(moved[2].widgets.length, before[2].widgets.length + 1)
  assert.equal(moved[0].widgets.length, before[0].widgets.length - 1)
  assert.deepEqual(await canvasTree(), moved, 'the canvas shows the widget in Archive')
  const overlap = await page.evaluate(() => {
    const items = [...document.querySelectorAll('.react-grid-item:not(.react-grid-placeholder)')].map((e) => e.getBoundingClientRect())
    return items.some((p, i) => items.slice(i + 1).some((q) => p.x < q.right - 1 && q.x < p.right - 1 && p.y < q.bottom - 1 && q.y < p.bottom - 1 && p.top < q.bottom && q.top < p.bottom && Math.abs(p.top - q.top) < 1 && Math.abs(p.left - q.left) < 1))
  })
  assert.equal(overlap, false, 'no two cards sit on top of each other')

  log('Undo returns it, Redo moves it again, and Save and reload keep the final arrangement')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await page.waitForTimeout(700)
  assert.deepEqual(await outlineTree(), before)
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await page.waitForTimeout(700)
  assert.deepEqual(await outlineTree(), moved)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByText('All changes saved').waitFor()
  await page.reload()
  await inspector(page).waitFor()
  await goTo(page, 'Outline')
  await page.waitForTimeout(800)
  assert.deepEqual(await outlineTree(), moved)
  assert.deepEqual(await canvasTree(), moved)

  console.log('OK: sections and widgets can be reordered in the outline, and widgets can move between sections')
} catch (error) {
  console.error(`FAILED at: ${step}`)
  await page.screenshot({ path: 'e2e-failure.png', fullPage: true }).catch(() => {})
  console.error(error)
  process.exitCode = 1
} finally {
  await browser.close()
}
