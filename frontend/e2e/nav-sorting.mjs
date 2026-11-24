// Real-browser, real-backend check of the shared sortable abstraction on navigation (FS-019).
// Not part of `npm test`. Same prerequisites as grid-gesture.mjs. Run: npm run test:browser
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
import { goTo, inspector } from './shell.mjs'

const executablePath = process.env.E2E_BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:5173'
const PASSWORD = 'correct horse battery staple'

const browser = await chromium.launch({ executablePath })
const page = await browser.newPage({ viewport: { width: 1400, height: 1400 } })
let step = 'start'
const log = (message) => {
  step = message
  console.log(`- ${message}`)
}

const nav = page.getByRole('navigation', { name: 'Workspace' })
const group = (name) => nav.getByRole('list', { name: `${name} navigation` })
const status = () => page.getByRole('status', { name: 'Save status' }).innerText()
const labels = async (name) => (await group(name).getByRole('button', { name: /^Reorder / }).allInnerTexts(), (await group(name).getByRole('button', { name: /^Reorder / }).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label').replace('Reorder ', '')))))
const order = async () => ({ primary: await labels('Primary'), secondary: await labels('Secondary') })
const handle = (label) => nav.getByRole('button', { name: `Reorder ${label}` })
const center = async (locator) => {
  const box = await locator.boundingBox()
  assert.ok(box, 'element has a box')
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

async function drag(from, to, { release = true, steps = 20 } = {}) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + 4, from.y + 4, { steps: 3 }) // pass the activation distance
  await page.mouse.move(to.x, to.y, { steps })
  await page.waitForTimeout(150)
  if (release) {
    await page.mouse.up()
    await page.waitForTimeout(400)
  }
}

try {
  log('register; the starter navigation has two primary items and an empty secondary group')
  const email = `e2e${Date.now()}@example.com`
  await page.goto(baseUrl)
  await page.getByRole('button', { name: 'Create an account' }).click()
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await inspector(page).waitFor()
  await goTo(page, 'Outline')
  const start = await order()
  assert.deepEqual(start, { primary: ['Today', 'Reference'], secondary: [] })
  assert.equal(await status(), 'All changes saved')
  await nav.getByText('Drop an item here to add it to secondary').waitFor()

  log('drag Reference above Today (left sidebar)')
  const refHandle = await center(handle('Reference'))
  const todayHandle = await center(handle('Today'))
  await drag(refHandle, { x: todayHandle.x, y: todayHandle.y - 6 })
  assert.deepEqual(await order(), { primary: ['Reference', 'Today'], secondary: [] })
  assert.equal(await status(), 'Unsaved changes')

  log('Escape during a drag changes nothing')
  const before = await order()
  const a = await center(handle('Reference'))
  const b = await center(handle('Today'))
  await drag(a, { x: b.x, y: b.y + 8 }, { release: false })
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await page.waitForTimeout(400)
  assert.deepEqual(await order(), before)

  log('dropping outside every target changes nothing and leaves no duplicate')
  const c = await center(handle('Today'))
  await drag(c, { x: 900, y: 140 }) // over the workspace title card
  assert.deepEqual(await order(), before)
  assert.equal(await nav.getByRole('button', { name: 'Reorder Today' }).count(), 1)

  log('drag Today into the empty Secondary group')
  const dropZone = nav.getByText('Drop an item here to add it to secondary')
  const from = await center(handle('Today'))
  await drag(from, await center(dropZone))
  assert.deepEqual(await order(), { primary: ['Reference'], secondary: ['Today'] })
  const all = [...(await order()).primary, ...(await order()).secondary]
  assert.equal(new Set(all).size, 2, 'no duplicates')

  log('keyboard: lift Today, move it to the Primary group and drop it')
  await handle('Today').focus()
  await page.keyboard.press('Space')
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('Space')
  await page.waitForTimeout(400)
  const afterKeys = await order()
  assert.equal([...afterKeys.primary, ...afterKeys.secondary].length, 2, 'still exactly two items after a keyboard drag')
  assert.ok(afterKeys.primary.includes('Today'), 'the keyboard moved Today from Secondary up into Primary')
  assert.deepEqual(afterKeys.secondary, [])

  log('keyboard: Space, Arrow keys past the last item, Space moves it back into the (empty) Secondary group')
  await handle('Today').focus()
  await page.keyboard.press('Space')
  for (let n = 0; n < 6; n += 1) {
    await page.keyboard.press('ArrowDown')
    await page.waitForTimeout(200)
    if ((await labels('Secondary')).includes('Today')) break // the live preview shows it there
  }
  assert.deepEqual(await labels('Secondary'), ['Today'], 'the preview shows the item in the empty group before the drop')
  await page.keyboard.press('Space')
  await page.waitForTimeout(400)
  assert.deepEqual((await order()).secondary, ['Today'])
  assert.deepEqual((await order()).primary, ['Reference'])

  log('keyboard Escape cancels a lifted item')
  const beforeEscape = await order()
  await handle('Today').focus()
  await page.keyboard.press('Space')
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  assert.deepEqual(await order(), beforeEscape)

  log('the Move buttons do the same thing through the same command')
  await nav.getByRole('button', { name: /^Today$/ }).click()
  const settings = inspector(page)
  const onPrimary = (await order()).primary.includes('Today')
  if (onPrimary) await settings.getByRole('button', { name: 'Move to Secondary' }).click()
  else await settings.getByRole('button', { name: 'Move to Primary' }).click()
  const moved = await order()
  assert.equal(moved.primary.includes('Today'), !onPrimary)
  await settings.getByRole('button', { name: /^Move (up|down)$/ }).first().isVisible()

  log('top placement: the groups lay out horizontally and drag reorders there too')
  await goTo(page, 'Outline')
  await inspector(page).getByLabel('Navigation placement').selectOption('top')
  await page.waitForTimeout(300)
  // put both items in Primary for a clean horizontal reorder
  if (!(await order()).primary.includes('Today')) {
    await nav.getByRole('button', { name: /^Today$/ }).click()
    await settings.getByRole('button', { name: 'Move to Primary' }).click()
  }
  const ordered = (await order()).primary
  assert.equal(ordered.length, 2)
  const [first, second] = ordered
  const h1 = await center(handle(first))
  const h2 = await center(handle(second))
  assert.ok(Math.abs(h1.y - h2.y) < 6 && h2.x > h1.x, 'items are side by side in the top bar')
  await drag(h2, { x: h1.x - 8, y: h1.y })
  assert.deepEqual((await order()).primary, [second, first])

  log('Save, reload: the saved order and groups are exactly what was left')
  const expected = await order()
  await page.getByRole('button', { name: 'Save' }).click()
  await page.getByText('All changes saved').waitFor()
  await page.reload()
  await inspector(page).waitFor()
  await goTo(page, 'Outline')
  assert.deepEqual(await order(), expected)
  assert.equal(await status(), 'All changes saved')

  console.log('\nOK: real browser navigation sorting passes')
} catch (error) {
  await page.screenshot({ path: process.env.E2E_SHOT ?? 'e2e-failure.png', fullPage: true }).catch(() => {})
  console.error(`\nFAILED at step: ${step}\n`, error)
  process.exitCode = 1
} finally {
  await browser.close()
}
