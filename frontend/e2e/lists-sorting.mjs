// Real-browser, real-backend check of sorting and transferring Tasks and Gallery content (FS-021).
// Not part of `npm test`. Same prerequisites as grid-gesture.mjs. Run: npm run test:browser
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'

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
const left = page.getByRole('complementary', { name: 'Components panel' })
const settings = page.getByRole('complementary', { name: 'Settings panel' })
const status = () => page.getByRole('status', { name: 'Save status' }).innerText()
const widgetCard = (title) => page.locator('[data-widget-id]').filter({ has: page.getByRole('heading', { level: 3, name: title, exact: true }) })
const taskTexts = async (title) => widgetCard(title).locator('input[aria-label^="Task text: "]').evaluateAll((els) => els.map((e) => e.value))
const imageCaptions = async (title) => widgetCard(title).locator('figcaption').allInnerTexts()
const center = async (locator) => {
  const box = await locator.boundingBox()
  assert.ok(box, 'element has a box')
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}
const taskGrip = (title, text) => widgetCard(title).getByRole('button', { name: `Reorder task ${text}` })
const tileGrip = (title, label) => widgetCard(title).getByRole('button', { name: `Reorder image ${label}` })

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

async function addWidget(label, title) {
  await outline.getByRole('button', { name: 'Today', exact: true }).click()
  await left.getByRole('tab', { name: 'Library' }).click()
  await left.getByRole('button', { name: `Add ${label}` }).click()
  await settings.getByLabel('Title').fill(title)
  await left.getByRole('tab', { name: 'Outline' }).click()
}

try {
  log('register; the starter Tasks widget has three tasks')
  const email = `e2e${Date.now()}@example.com`
  await page.goto(baseUrl)
  await page.getByRole('button', { name: 'Create an account' }).click()
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await outline.waitFor()
  const starter = await taskTexts('Tasks')
  assert.equal(starter.length, 3, `starter tasks (${starter.join(' | ')})`)

  log('add an empty Tasks widget, a Gallery with two images, and an empty Gallery')
  await addWidget('Tasks', 'Later')
  await addWidget('Gallery', 'Photos')
  for (const [n, caption] of [[1, 'sunrise'], [2, 'harbour']]) {
    await settings.getByRole('button', { name: 'Add image' }).click()
    await settings.getByLabel(`Caption for image ${n}`).fill(caption)
    await settings.getByLabel(`Caption for image ${n}`).press('Enter')
    await settings.getByLabel(`Alt text for image ${n}`).fill(`alt ${caption}`)
    await settings.getByLabel(`Alt text for image ${n}`).press('Enter')
  }
  await addWidget('Gallery', 'More photos')
  assert.deepEqual(await imageCaptions('Photos'), ['sunrise', 'harbour'])
  assert.deepEqual(await taskTexts('Later'), [])

  log('typing in a task field and ticking a checkbox never start a drag')
  const startBox = await widgetCard('Tasks').boundingBox()
  const field = widgetCard('Tasks').locator('input[aria-label^="Task text: "]').first()
  await field.click()
  await page.keyboard.press('End')
  await page.keyboard.type(' (edited)')
  await page.keyboard.press('Enter')
  const box = await field.boundingBox()
  await page.mouse.move(box.x + 20, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + 120, box.y + box.height / 2 + 60, { steps: 10 }) // a text-selection drag, not a grip drag
  await page.mouse.up()
  assert.deepEqual(await taskTexts('Tasks'), [`${starter[0]} (edited)`, starter[1], starter[2]])
  assert.deepEqual(await widgetCard('Tasks').boundingBox(), startBox, 'the widget did not move')

  log('drag the last task above the first (reorder inside one widget)')
  const tasksNow = await taskTexts('Tasks')
  await drag(await center(taskGrip('Tasks', tasksNow[2])), await center(taskGrip('Tasks', tasksNow[0])))
  assert.deepEqual(await taskTexts('Tasks'), [tasksNow[2], tasksNow[0], tasksNow[1]])

  log('Escape during a drag restores the initial order')
  const beforeEscape = await taskTexts('Tasks')
  const firstGrip = await center(taskGrip('Tasks', beforeEscape[0]))
  const lastGrip = await center(taskGrip('Tasks', beforeEscape[2]))
  await drag(firstGrip, { x: lastGrip.x, y: lastGrip.y + 6 }, { release: false })
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await page.waitForTimeout(500)
  assert.deepEqual(await taskTexts('Tasks'), beforeEscape)

  log('drag a task into the empty Later list: it moves once and keeps its text')
  const moving = (await taskTexts('Tasks'))[1]
  const dropZone = widgetCard('Later').getByText(/drag a task here/i)
  await drag(await center(taskGrip('Tasks', moving)), await center(dropZone))
  assert.deepEqual(await taskTexts('Later'), [moving])
  assert.equal((await taskTexts('Tasks')).length, 2)
  const allTasks = [...(await taskTexts('Tasks')), ...(await taskTexts('Later'))]
  assert.equal(allTasks.filter((text) => text === moving).length, 1, 'the task exists exactly once')

  log('dragging a task onto a gallery changes nothing')
  const tasksBefore = { tasks: await taskTexts('Tasks'), later: await taskTexts('Later') }
  const photosBefore = await imageCaptions('Photos')
  const target = widgetCard('Photos').locator('img').first()
  await drag(await center(taskGrip('Tasks', tasksBefore.tasks[0])), await center(target))
  assert.deepEqual({ tasks: await taskTexts('Tasks'), later: await taskTexts('Later') }, tasksBefore)
  assert.deepEqual(await imageCaptions('Photos'), photosBefore)
  assert.equal(await widgetCard('Photos').locator('img').count(), 2)

  log('reorder gallery tiles by dragging, then drag a tile into the empty gallery')
  await drag(await center(tileGrip('Photos', 'alt harbour')), await center(widgetCard('Photos').locator('img').first()))
  assert.deepEqual(await imageCaptions('Photos'), ['harbour', 'sunrise'])
  await drag(await center(tileGrip('Photos', 'alt sunrise')), await center(widgetCard('More photos').getByText(/drag one here/i)))
  assert.deepEqual(await imageCaptions('More photos'), ['sunrise'])
  assert.deepEqual(await imageCaptions('Photos'), ['harbour'])
  const moved = widgetCard('More photos').locator('img').first()
  assert.ok(await moved.evaluate((img) => img.complete && img.naturalWidth > 0), 'the moved image still renders')

  log('dragging a tile onto a Tasks widget changes nothing')
  const beforeTile = { photos: await imageCaptions('Photos'), later: await taskTexts('Later') }
  await drag(await center(tileGrip('Photos', 'alt harbour')), await center(widgetCard('Later').locator('input[aria-label^="Task text: "]').first()))
  assert.deepEqual({ photos: await imageCaptions('Photos'), later: await taskTexts('Later') }, beforeTile)

  log('the Move buttons do the same through the same command')
  await outline.getByRole('button', { name: 'Tasks', exact: true }).click()
  const toMove = (await taskTexts('Tasks'))[0]
  await settings.getByLabel('Task to move').selectOption({ index: 0 })
  await settings.getByRole('button', { name: 'Move to Later task' }).click()
  assert.ok((await taskTexts('Later')).includes(toMove))
  assert.ok(!(await taskTexts('Tasks')).includes(toMove))

  log('Save, reload: order, completion and unique ownership persist')
  const doneBefore = await page.locator('[data-widget-id] input[type="checkbox"]').evaluateAll((els) => els.map((e) => e.checked))
  const expected = { tasks: await taskTexts('Tasks'), later: await taskTexts('Later'), photos: await imageCaptions('Photos'), more: await imageCaptions('More photos') }
  await page.getByRole('button', { name: 'Save' }).click()
  await page.getByText('All changes saved').waitFor()
  await page.reload()
  await outline.waitFor()
  assert.deepEqual({ tasks: await taskTexts('Tasks'), later: await taskTexts('Later'), photos: await imageCaptions('Photos'), more: await imageCaptions('More photos') }, expected)
  assert.deepEqual(await page.locator('[data-widget-id] input[type="checkbox"]').evaluateAll((els) => els.map((e) => e.checked)), doneBefore)
  const owned = [...expected.tasks, ...expected.later]
  assert.equal(new Set(owned).size, owned.length, 'no task is owned twice')
  assert.equal(await status(), 'All changes saved')

  console.log('\nOK: real browser Tasks and Gallery sorting passes')
} catch (error) {
  await page.screenshot({ path: process.env.E2E_SHOT ?? 'e2e-failure.png', fullPage: true }).catch(() => {})
  console.error(`\nFAILED at step: ${step}\n`, error)
  process.exitCode = 1
} finally {
  await browser.close()
}
