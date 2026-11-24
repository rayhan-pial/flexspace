// Real-browser, real-backend check of sorting Analytics metrics and Calendar agenda entries (FS-022).
// Not part of `npm test`. Same prerequisites as grid-gesture.mjs. Run: npm run test:browser
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
const left = inspector(page)
const settings = inspector(page)
const status = () => page.getByRole('status', { name: 'Save status' }).innerText()
const widgetCard = (title) => page.locator('[data-widget-id]').filter({ has: page.getByRole('heading', { level: 3, name: title, exact: true }) })
const metricLabels = (title) => widgetCard(title).locator('li [title]').evaluateAll((els) => els.map((e) => e.textContent))
const barWidths = (title) => widgetCard(title).locator('[data-bar]').evaluateAll((els) => els.map((e) => e.style.width))
const barPixels = (title) => widgetCard(title).locator('[data-bar]').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().width)))
const agenda = (title) => widgetCard(title).locator('time').allInnerTexts()
const agendaTitles = (title) => widgetCard(title).getByRole('button', { name: /^Reorder event / }).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label').replace('Reorder event ', '')))
const dayCells = (title) => widgetCard(title).locator('table td').allInnerTexts()
const center = async (locator) => {
  const box = await locator.boundingBox()
  assert.ok(box, 'element has a box')
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}
const metricGrip = (title, label) => widgetCard(title).getByRole('button', { name: `Reorder metric ${label}` })
const eventGrip = (title, label) => widgetCard(title).getByRole('button', { name: `Reorder event ${label}` })

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
  await goTo(page, 'Outline')
  await outline.getByRole('button', { name: 'Today', exact: true }).click()
  await goTo(page, 'Components')
  await left.getByRole('button', { name: `Add ${label}` }).click()
  await goTo(page, 'My workspace')
  await settings.getByLabel('Title').fill(title)
}

try {
  log('register; the starter Calendar has an agenda')
  const email = `e2e${Date.now()}@example.com`
  await page.goto(baseUrl)
  await page.getByRole('button', { name: 'Create an account' }).click()
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await inspector(page).waitFor()
  await goTo(page, 'Outline')
  await outline.waitFor()
  const starterAgenda = await agendaTitles('Calendar')
  assert.ok(starterAgenda.length >= 2, `starter agenda (${starterAgenda.join(' | ')})`)

  log('add an Analytics widget with three metrics, a second Analytics, and a second Calendar')
  await addWidget('Analytics', 'KPIs')
  for (const [n, label, value] of [[1, 'Visits', '400'], [2, 'Signups', '100'], [3, 'Churn', '20']]) {
    await settings.getByRole('button', { name: 'Add metric' }).click()
    await settings.getByLabel(`Label for metric ${n}`).fill(label)
    await settings.getByLabel(`Label for metric ${n}`).press('Enter')
    await settings.getByLabel(`Value for metric ${n}`).fill(value)
  }
  await addWidget('Analytics', 'Other KPIs')
  await settings.getByRole('button', { name: 'Add metric' }).click()
  await settings.getByLabel('Label for metric 1').fill('Revenue')
  await settings.getByLabel('Label for metric 1').press('Enter')
  await settings.getByLabel('Value for metric 1').fill('50')
  await addWidget('Calendar', 'Other plan')
  await settings.getByRole('button', { name: 'Add event' }).click()
  await settings.getByLabel('Title for event 1').fill('Retro')
  await settings.getByLabel('Title for event 1').press('Enter')
  assert.deepEqual(await metricLabels('KPIs'), ['Visits', 'Signups', 'Churn'])
  assert.deepEqual(await barWidths('KPIs'), ['100%', '25%', '5%'])

  log('drag the last metric above the first: the cards and the bars follow the new array order')
  await drag(await center(metricGrip('KPIs', 'Churn')), await center(metricGrip('KPIs', 'Visits')))
  assert.deepEqual(await metricLabels('KPIs'), ['Churn', 'Visits', 'Signups'])
  assert.deepEqual(await barWidths('KPIs'), ['5%', '100%', '25%'])
  const pixels = await barPixels('KPIs')
  assert.ok(pixels[1] > pixels[2] && pixels[2] > pixels[0], `bars are drawn in the new order (${pixels.join(', ')} px)`)

  log('Escape during a metric drag restores the order')
  const beforeEscape = await metricLabels('KPIs')
  const first = await center(metricGrip('KPIs', beforeEscape[0]))
  const last = await center(metricGrip('KPIs', beforeEscape[2]))
  await drag(first, { x: last.x, y: last.y + 6 }, { release: false })
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await page.waitForTimeout(500)
  assert.deepEqual(await metricLabels('KPIs'), beforeEscape)

  log('dragging a metric onto another Analytics widget changes nothing')
  const kpisBefore = await metricLabels('KPIs')
  const otherBefore = await metricLabels('Other KPIs')
  await drag(await center(metricGrip('KPIs', kpisBefore[1])), await center(widgetCard('Other KPIs').locator('li').first()))
  assert.deepEqual(await metricLabels('KPIs'), kpisBefore)
  assert.deepEqual(await metricLabels('Other KPIs'), otherBefore)

  log('drag an agenda entry above the other: the agenda follows the array, the day cells stay in date order')
  const daysBefore = await dayCells('Calendar')
  const titles = await agendaTitles('Calendar')
  // The agenda sits at the bottom of the card's own scroll area: bring both grips on screen first.
  await eventGrip('Calendar', titles[1]).scrollIntoViewIfNeeded()
  await eventGrip('Calendar', titles[0]).scrollIntoViewIfNeeded()
  await drag(await center(eventGrip('Calendar', titles[1])), await center(eventGrip('Calendar', titles[0])))
  assert.deepEqual((await agendaTitles('Calendar')).slice(0, 2), [titles[1], titles[0]])
  assert.deepEqual(await dayCells('Calendar'), daysBefore, 'day cells are unchanged')
  const dayNumbers = daysBefore.map((cell) => cell.match(/^\d+/)?.[0]).filter(Boolean)
  assert.deepEqual(dayNumbers, dayNumbers.map((_, n) => String(n + 1)), 'day cells run 1..N in date order')

  log('dragging an agenda entry onto another Calendar changes nothing')
  const calBefore = await agendaTitles('Calendar')
  const otherCalBefore = await agendaTitles('Other plan')
  await eventGrip('Calendar', calBefore[0]).scrollIntoViewIfNeeded()
  await eventGrip('Other plan', otherCalBefore[0]).scrollIntoViewIfNeeded()
  await drag(await center(eventGrip('Calendar', calBefore[0])), await center(eventGrip('Other plan', otherCalBefore[0])))
  assert.deepEqual(await agendaTitles('Calendar'), calBefore)
  assert.deepEqual(await agendaTitles('Other plan'), otherCalBefore)

  log('the Move up and Move down buttons do the same through the same command')
  await goTo(page, 'Outline')
  await outline.getByRole('button', { name: 'KPIs', exact: true }).click()
  await goTo(page, 'My workspace')
  const labelsNow = await metricLabels('KPIs')
  await settings.getByRole('button', { name: 'Move down metric 1' }).click()
  assert.deepEqual(await metricLabels('KPIs'), [labelsNow[1], labelsNow[0], labelsNow[2]])
  assert.equal(await settings.getByRole('button', { name: /Move to / }).count(), 0, 'no transfer to another widget is offered')

  log('Save, reload: both orders persist exactly')
  const expected = { kpis: await metricLabels('KPIs'), agenda: await agenda('Calendar'), agendaTitles: await agendaTitles('Calendar'), other: await metricLabels('Other KPIs'), otherCal: await agendaTitles('Other plan') }
  await page.getByRole('button', { name: 'Save' }).click()
  await page.getByText('All changes saved').waitFor()
  await page.reload()
  await inspector(page).waitFor()
  await goTo(page, 'Outline')
  await outline.waitFor()
  assert.deepEqual({ kpis: await metricLabels('KPIs'), agenda: await agenda('Calendar'), agendaTitles: await agendaTitles('Calendar'), other: await metricLabels('Other KPIs'), otherCal: await agendaTitles('Other plan') }, expected)
  assert.equal(await status(), 'All changes saved')

  console.log('\nOK: real browser metric and agenda sorting passes')
} catch (error) {
  await page.screenshot({ path: process.env.E2E_SHOT ?? 'e2e-failure.png', fullPage: true }).catch(() => {})
  console.error(`\nFAILED at step: ${step}\n`, error)
  process.exitCode = 1
} finally {
  await browser.close()
}
