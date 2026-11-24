// Real-browser, real-backend check of the Gallery and Analytics widgets (FS-017). Not part of `npm test`.
// Same prerequisites as grid-gesture.mjs (API + dev server running, scratch database). Run: npm run test:browser
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
import { goTo, inspector } from './shell.mjs'

const executablePath = process.env.E2E_BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:5173'
const PASSWORD = 'correct horse battery staple'

const browser = await chromium.launch({ executablePath })
const page = await browser.newPage({ viewport: { width: 1400, height: 1800 } })
let step = 'start'
const log = (message) => {
  step = message
  console.log(`- ${message}`)
}

// Everything the page requests must come from the app itself (no external images or services).
const external = []
page.on('request', (request) => {
  const url = new URL(request.url())
  if (!['localhost', '127.0.0.1'].includes(url.hostname) && !request.url().startsWith('data:')) external.push(request.url())
})

const outline = page.getByRole('list', { name: 'Components' })
const settings = inspector(page)
const left = inspector(page)
const status = () => page.getByRole('status').first().innerText()
const gallery = page.locator('[data-widget-id]:has(ul[aria-label$="images"])')
const analytics = page.locator('[data-widget-id]:has(ul[aria-label$="metrics"])')

try {
  log('register and add a Gallery and an Analytics widget from the Library')
  const email = `e2e${Date.now()}@example.com`
  await page.goto(baseUrl)
  await page.getByRole('button', { name: 'Create an account' }).click()
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await inspector(page).waitFor()
  await goTo(page, 'Outline')
  await outline.waitFor()
  await goTo(page, 'Outline')
  await outline.getByRole('button', { name: 'Today', exact: true }).click()
  await goTo(page, 'Components')
  await left.getByRole('button', { name: 'Add Gallery' }).click()
  await goTo(page, 'My workspace')
  await settings.getByRole('button', { name: 'Add image' }).click()
  await settings.getByRole('button', { name: 'Add image' }).click()
  await goTo(page, 'Components')
  await left.getByRole('button', { name: 'Add Analytics' }).click()
  await goTo(page, 'My workspace')
  await settings.getByRole('button', { name: 'Add metric' }).click()
  await settings.getByRole('button', { name: 'Add metric' }).click()

  log('edit images')
  await goTo(page, 'Outline')
  await goTo(page, 'Outline')
  await outline.getByRole('button', { name: 'Gallery', exact: true }).click()
  await goTo(page, 'My workspace')
  await settings.getByLabel('Picture for image 1').selectOption('mountain')
  await settings.getByLabel('Alt text for image 1').fill('Snowy peak at sunrise')
  await settings.getByLabel('Alt text for image 1').press('Enter')
  await settings.getByLabel('Caption for image 1').fill('Morning hike')
  await settings.getByLabel('Caption for image 1').press('Enter')
  await settings.getByLabel('Picture for image 2').selectOption('city')
  await settings.getByLabel('Alt text for image 2').fill('City at dusk')
  await settings.getByLabel('Alt text for image 2').press('Enter')

  log('bundled images actually load (no broken images, no external requests)')
  await gallery.getByAltText('Snowy peak at sunrise').waitFor()
  const sizes = await gallery.locator('img').evaluateAll((imgs) => imgs.map((img) => [img.complete, img.naturalWidth, img.naturalHeight]))
  assert.equal(sizes.length, 2)
  for (const [complete, w, h] of sizes) assert.ok(complete && w > 0 && h > 0, `image decoded (${w}x${h})`)
  assert.deepEqual(external, [])

  log('edit metrics')
  await goTo(page, 'Outline')
  await outline.getByRole('button', { name: 'Analytics', exact: true }).click()
  await goTo(page, 'My workspace')
  await settings.getByLabel('Label for metric 1').fill('Visits')
  await settings.getByLabel('Label for metric 1').press('Enter')
  await settings.getByLabel('Value for metric 1').fill('1200.5')
  await settings.getByLabel('Label for metric 2').fill('Signups')
  await settings.getByLabel('Label for metric 2').press('Enter')
  await settings.getByLabel('Value for metric 2').fill('300')
  await analytics.getByText('1,200.5').waitFor()
  const widths = await analytics.locator('[data-bar]').evaluateAll((els) => els.map((e) => e.style.width))
  assert.deepEqual(widths, ['100%', '25%'])
  const pixels = await analytics.locator('[data-bar]').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().width)))
  assert.ok(pixels[0] > pixels[1] * 3, `bars are drawn proportionally (${pixels.join(' vs ')} px)`)

  log('invalid values are flagged and not applied')
  await settings.getByLabel('Value for metric 1').fill('not a number')
  await settings.getByText('Enter a number.').waitFor()
  await analytics.getByText('1,200.5').waitFor() // the widget still shows the last valid value
  await settings.getByLabel('Label for metric 2').fill('')
  await settings.getByLabel('Label for metric 2').press('Enter')
  await settings.getByText('A metric needs a label.').waitFor()
  await analytics.getByText('Signups').waitFor()

  log('Save, log out, log in: images and metrics are the same')
  await page.getByRole('button', { name: 'Save' }).click()
  await page.getByText('All changes saved').waitFor()
  await page.getByRole('button', { name: 'Log out' }).click()
  await page.getByRole('heading', { name: 'Sign in to your workspace' }).waitFor()
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await inspector(page).waitFor()
  await goTo(page, 'Outline')
  await outline.waitFor()
  await gallery.getByAltText('Snowy peak at sunrise').waitFor()
  await gallery.getByAltText('City at dusk').waitFor()
  await gallery.getByText('Morning hike').waitFor()
  await analytics.getByText('1,200.5').waitFor()
  await analytics.getByText('Signups').waitFor()
  assert.equal(await status(), 'All changes saved')
  assert.deepEqual(external, [])

  console.log('\nOK: real browser Gallery/Analytics persistence passes')
} catch (error) {
  await page.screenshot({ path: process.env.E2E_SHOT ?? 'e2e-failure.png', fullPage: true }).catch(() => {})
  console.error(`\nFAILED at step: ${step}\n`, error)
  process.exitCode = 1
} finally {
  await browser.close()
}
