// Real-browser, real-backend check of section and stack-card sorting (FS-020).
// Not part of `npm test`. Same prerequisites as grid-gesture.mjs. Run: npm run test:browser
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'

const executablePath = process.env.E2E_BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:5173'
const PASSWORD = 'correct horse battery staple'

const browser = await chromium.launch({ executablePath })
const page = await browser.newPage({ viewport: { width: 1400, height: 2200 } })
let step = 'start'
const log = (message) => {
  step = message
  console.log(`- ${message}`)
}

const status = () => page.getByRole('status', { name: 'Save status' }).innerText()
const sectionTitles = () => page.locator('[data-section-id] > div > h2').allInnerTexts()
const sectionIds = () => page.locator('[data-section-id]').evaluateAll((els) => els.map((e) => e.dataset.sectionId))
const cardsIn = (sectionId) => page.locator(`[data-section-id="${sectionId}"] [data-widget-id]`).evaluateAll((els) => els.map((e) => e.dataset.widgetId))
const sectionHandle = (title) => page.getByRole('button', { name: `Reorder section ${title}` })
const center = async (locator) => {
  const box = await locator.boundingBox()
  assert.ok(box, 'element has a box')
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

async function drag(from, to, { release = true, steps = 25 } = {}) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + 4, from.y + 4, { steps: 3 })
  await page.mouse.move(to.x, to.y, { steps })
  await page.waitForTimeout(200)
  if (release) {
    await page.mouse.up()
    await page.waitForTimeout(500)
  }
}

try {
  log('register; the starter has a grid section (Today) and a stack section (Reference)')
  const email = `e2e${Date.now()}@example.com`
  await page.goto(baseUrl)
  await page.getByRole('button', { name: 'Create an account' }).click()
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.getByRole('list', { name: 'Components' }).waitFor()
  assert.deepEqual(await sectionTitles(), ['Today', 'Reference'])
  const [todayId, referenceId] = await sectionIds()
  const todayCards = await cardsIn(todayId)
  assert.ok(todayCards.length >= 3, `Today has several widgets (${todayCards.length})`)
  const referenceCards = await cardsIn(referenceId)
  assert.equal(referenceCards.length, 1)

  log('add an empty stack section')
  await page.getByRole('complementary', { name: 'Components panel' }).getByRole('button', { name: 'Stack' }).click()
  await page.getByText(/This section is empty.*drag a card here/i).waitFor()
  const [, , newId] = await sectionIds()
  assert.deepEqual(await sectionTitles(), ['Today', 'Reference', 'New section'])
  assert.equal(await status(), 'Unsaved changes')

  log('drag the Reference section above Today: it carries its card, Today keeps all its widgets and geometry')
  const geometryBefore = await page.locator(`[data-section-id="${todayId}"] [data-widget-id]`).evaluateAll((els) => els.map((e) => [e.dataset.widgetId, Math.round(e.getBoundingClientRect().width), Math.round(e.getBoundingClientRect().height)]))
  const refHandle = await center(sectionHandle('Reference'))
  const todayHandle = await center(sectionHandle('Today'))
  await drag(refHandle, { x: todayHandle.x, y: todayHandle.y - 10 })
  assert.deepEqual(await sectionTitles(), ['Reference', 'Today', 'New section'])
  assert.deepEqual(await cardsIn(referenceId), referenceCards)
  assert.deepEqual(await cardsIn(todayId), todayCards)
  const geometryAfter = await page.locator(`[data-section-id="${todayId}"] [data-widget-id]`).evaluateAll((els) => els.map((e) => [e.dataset.widgetId, Math.round(e.getBoundingClientRect().width), Math.round(e.getBoundingClientRect().height)]))
  assert.deepEqual(geometryAfter, geometryBefore, 'widget sizes inside the moved section are unchanged')

  log('Escape during a section drag changes nothing')
  const before = await sectionIds()
  const a = await center(sectionHandle('Today'))
  const b = await center(sectionHandle('New section'))
  await drag(a, { x: b.x, y: b.y + 10 }, { release: false })
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await page.waitForTimeout(500)
  assert.deepEqual(await sectionIds(), before)

  log('a card gesture inside its own section does not move the section')
  const refCardHandle = page.locator(`[data-section-id="${referenceId}"]`).getByRole('button', { name: /^Reorder card / })
  const c = await center(refCardHandle)
  await drag(c, { x: c.x + 30, y: c.y + 12 })
  assert.deepEqual(await sectionIds(), before)
  assert.deepEqual(await cardsIn(referenceId), referenceCards)

  log('drag the Reference card into the empty section: moved once, id preserved, source now empty')
  const cardId = referenceCards[0]
  const dropTarget = page.locator(`[data-section-id="${newId}"]`).getByText(/drag a card here/i)
  await drag(await center(refCardHandle), await center(dropTarget))
  assert.deepEqual(await cardsIn(newId), [cardId])
  assert.deepEqual(await cardsIn(referenceId), [])
  assert.deepEqual(await sectionIds(), before, 'sections did not move')
  const all = [...(await cardsIn(todayId)), ...(await cardsIn(referenceId)), ...(await cardsIn(newId))]
  assert.equal(all.filter((id) => id === cardId).length, 1, 'the card exists exactly once')
  assert.equal(await page.locator(`[data-widget-id="${cardId}"]`).count(), 1)

  log('dropping a card outside every target changes nothing')
  const card2 = page.locator(`[data-section-id="${newId}"]`).getByRole('button', { name: /^Reorder card / })
  await drag(await center(card2), { x: 1300, y: 60 })
  assert.deepEqual(await cardsIn(newId), [cardId])

  log('the Move buttons move the card back through the same command')
  await page.locator(`[data-widget-id="${cardId}"]`).click()
  const settings = page.getByRole('complementary', { name: 'Settings panel' })
  await settings.getByRole('button', { name: 'Move to Reference' }).click()
  assert.deepEqual(await cardsIn(referenceId), [cardId])
  assert.deepEqual(await cardsIn(newId), [])

  log('Save, reload: the section order and the card placement persist exactly')
  const expectedSections = await sectionTitles()
  const expectedCards = { today: await cardsIn(todayId), reference: await cardsIn(referenceId), fresh: await cardsIn(newId) }
  await page.getByRole('button', { name: 'Save' }).click()
  await page.getByText('All changes saved').waitFor()
  await page.reload()
  await page.getByRole('list', { name: 'Components' }).waitFor()
  assert.deepEqual(await sectionTitles(), expectedSections)
  assert.deepEqual({ today: await cardsIn(todayId), reference: await cardsIn(referenceId), fresh: await cardsIn(newId) }, expectedCards)
  assert.equal(await status(), 'All changes saved')

  console.log('\nOK: real browser section and card sorting passes')
} catch (error) {
  await page.screenshot({ path: process.env.E2E_SHOT ?? 'e2e-failure.png', fullPage: true }).catch(() => {})
  console.error(`\nFAILED at step: ${step}\n`, error)
  process.exitCode = 1
} finally {
  await browser.close()
}
