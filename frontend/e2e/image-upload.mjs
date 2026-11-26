// Real-browser, real-backend check of picture upload: choose files in a Gallery's Properties, the picture is stored in
// the database and shown, survives Save / reload / logout and login, is private to its owner, wrong types and oversized
// files are refused with a message, and unused old uploads do not break anything. Works over plain HTTP (set
// E2E_BASE_URL to the LAN address to prove it). Not part of `npm test`. Run: npm run test:browser
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
import { goTo, inspector, library } from './shell.mjs'

const executablePath = process.env.E2E_BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:5173'
const PASSWORD = 'correct horse battery staple'
// A real 1x1 PNG, and an SVG that must be refused.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')

const browser = await chromium.launch({ executablePath })
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })
let step = 'start'
const log = (message) => {
  step = message
  console.log(`- ${message}`)
}
const email = `e2e${Date.now()}${Math.floor(Math.random() * 1e6)}@example.com`
const tiles = () => page.locator('[data-widget-id] figure img')
const loaded = () => tiles().evaluateAll((imgs) => imgs.map((i) => ({ ok: i.complete && i.naturalWidth > 0, src: i.getAttribute('src') })))
const uploadFiles = async (files) => {
  await inspector(page).getByLabel('Choose pictures to upload').setInputFiles(files)
}

try {
  log(`register at ${baseUrl} (secure context: ${await page.goto(baseUrl).then(() => page.evaluate(() => window.isSecureContext))})`)
  await page.getByRole('button', { name: 'Create an account' }).click()
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await inspector(page).waitFor()

  log('add a Gallery and open its Properties')
  await goTo(page, 'Components')
  await library(page).getByRole('button', { name: 'Add Gallery', exact: true }).click()
  await inspector(page).getByRole('button', { name: 'Upload pictures' }).waitFor()

  log('upload a real picture: it appears in the gallery, from the private image URL, as an unsaved change')
  await uploadFiles({ name: 'photo.png', mimeType: 'image/png', buffer: PNG })
  await page.getByText('Picture added to this gallery.').waitFor()
  await page.waitForFunction(() => document.querySelectorAll('[data-widget-id] figure img').length === 1)
  await page.waitForTimeout(500)
  const first = await loaded()
  assert.equal(first.length, 1)
  assert.match(first[0].src, /^\/api\/images\/[0-9a-f-]{36}$/)
  assert.equal(first[0].ok, true, 'the uploaded picture decodes')
  assert.equal(await page.getByRole('status', { name: 'Save status' }).innerText(), 'Unsaved changes')
  const imageId = first[0].src.split('/').pop()

  log('a wrong type and an oversized file are refused with a message and add nothing')
  await uploadFiles({ name: 'evil.svg', mimeType: 'image/svg+xml', buffer: SVG })
  await page.getByRole('alert').filter({ hasText: 'is not a PNG, JPEG, GIF or WebP picture' }).waitFor()
  await uploadFiles({ name: 'huge.png', mimeType: 'image/png', buffer: Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]) })
  await page.getByRole('alert').filter({ hasText: 'is larger than 5 MB' }).waitFor()
  assert.equal((await loaded()).length, 1)
  // A file the browser calls a PNG but whose bytes are not an image is refused by the server.
  await uploadFiles({ name: 'fake.png', mimeType: 'image/png', buffer: Buffer.from('definitely not a picture') })
  await page.getByRole('alert').filter({ hasText: 'PNG, JPEG, GIF or WebP' }).waitFor()
  assert.equal((await loaded()).length, 1)

  log('several files at once are all added')
  await uploadFiles([
    { name: 'a.png', mimeType: 'image/png', buffer: PNG },
    { name: 'b.png', mimeType: 'image/png', buffer: PNG },
  ])
  await page.getByText('2 pictures added to this gallery.').waitFor()
  await page.waitForFunction(() => document.querySelectorAll('[data-widget-id] figure img').length === 3)

  log('Save, reload, log out and in: all three pictures are still there and still decode')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByText('All changes saved').waitFor()
  await page.reload()
  await inspector(page).waitFor()
  await page.waitForTimeout(800)
  assert.deepEqual((await loaded()).map((i) => i.ok), [true, true, true])
  await page.getByRole('button', { name: 'Log out' }).click()
  await page.getByRole('button', { name: 'Create an account' }).waitFor()
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await inspector(page).waitFor()
  await page.waitForTimeout(800)
  assert.deepEqual((await loaded()).map((i) => i.ok), [true, true, true])

  log('privacy: another account cannot read the picture (404), and an anonymous request gets 401')
  const other = await browser.newContext()
  const second = await other.newPage()
  await second.goto(baseUrl)
  assert.equal((await other.request.get(`${baseUrl}/api/images/${imageId}`)).status(), 401)
  await second.getByRole('button', { name: 'Create an account' }).click()
  await second.getByLabel('Email').fill(`other${Date.now()}@example.com`)
  await second.getByLabel('Password').fill(PASSWORD)
  await second.getByRole('button', { name: 'Create account' }).click()
  await second.getByLabel('Workspace title').waitFor()
  assert.equal((await other.request.get(`${baseUrl}/api/images/${imageId}`)).status(), 404)
  await other.close()

  await page.screenshot({ path: new URL('../../artifacts/ui-review/after/upload-gallery-lan.png', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') })

  log('removing a picture from the gallery is a draft change that Undo reverses')
  await page.getByRole('article', { name: 'Gallery' }).click({ position: { x: 60, y: 12 } })
  await inspector(page).getByRole('button', { name: 'Remove image 1' }).click()
  await page.waitForFunction(() => document.querySelectorAll('[data-widget-id] figure img').length === 2)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await page.waitForFunction(() => document.querySelectorAll('[data-widget-id] figure img').length === 3)

  console.log('OK: pictures upload, show, persist, stay private, and bad files are refused')
} catch (error) {
  console.error(`FAILED at: ${step}`)
  await page.screenshot({ path: 'e2e-failure.png' }).catch(() => {})
  console.error(error)
  process.exitCode = 1
} finally {
  await browser.close()
}
