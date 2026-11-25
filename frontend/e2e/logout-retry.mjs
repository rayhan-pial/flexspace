// Real-browser, real-backend, real-cookie regression for UI-020: an unsuccessful sign-out is reported (never
// shown as success), Retry revokes the actual server session, /auth/me then returns 401 and a refresh stays
// signed out. Also covers a 500, duplicate activation and the dirty-discard confirmation. Not part of
// `npm test`. Same prerequisites as grid-gesture.mjs. Run: npm run test:browser
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'

const executablePath = process.env.E2E_BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:5173'
const PASSWORD = 'correct horse battery staple'

const browser = await chromium.launch({ executablePath })
const context = await browser.newContext({ viewport: { width: 1600, height: 1200 } })
const page = await context.newPage()
let step = 'start'
const log = (message) => {
  step = message
  console.log(`- ${message}`)
}
const meStatus = async () => (await context.request.get(`${baseUrl}/api/auth/me`)).status()
const logoutPosts = []
page.on('request', (request) => {
  if (request.method() === 'POST' && request.url().endsWith('/api/auth/logout')) logoutPosts.push(request.url())
})

try {
  log('register: a real cookie-backed session exists')
  await page.goto(baseUrl)
  await page.getByRole('button', { name: 'Create an account' }).click()
  await page.getByLabel('Email').fill(`e2e${Date.now()}${Math.floor(Math.random() * 1e6)}@example.com`)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.getByLabel('Workspace title').waitFor()
  assert.equal(await meStatus(), 200)

  log('dirty workspace: Log out asks first, and Keep editing changes nothing')
  await page.getByLabel('Workspace title').fill('Private draft title')
  await page.getByRole('button', { name: 'Log out' }).click()
  const dialog = page.getByRole('alertdialog', { name: 'Log out and discard changes?' })
  await dialog.waitFor()
  await dialog.getByRole('button', { name: 'Keep editing' }).click()
  assert.equal(await page.getByLabel('Workspace title').inputValue(), 'Private draft title')
  assert.equal(logoutPosts.length, 0, 'declining sends nothing')

  log('blocked sign-out request: pending, then an honest failure; the server session is still alive')
  let mode = 'abort'
  await page.route('**/api/auth/logout', (route) => (mode === 'abort' ? route.abort('failed') : mode === 'error' ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":{"code":"server_error","message":"boom"}}' }) : route.continue()))
  await page.getByRole('button', { name: 'Log out' }).click()
  await page.getByRole('button', { name: 'Discard and log out' }).click()
  const failure = page.getByRole('alert').filter({ hasText: 'Sign-out could not be confirmed' })
  await failure.waitFor()
  assert.equal(await page.getByLabel('Workspace title').count(), 0, 'private content stays hidden')
  assert.equal(await page.getByRole('heading', { name: 'Sign in to your workspace' }).count(), 0, 'no false signed-out screen')
  assert.equal(await meStatus(), 200, 'the server session was not revoked')
  const text = await failure.innerText()
  assert.ok(!/csrf|token|cookie/i.test(text), 'generic message exposes no session secrets')

  log('a 500 is also a failure, and rapid Retry clicks send one request at a time')
  mode = 'error'
  await page.getByRole('button', { name: 'Retry sign-out' }).click()
  await failure.waitFor()
  assert.equal(await meStatus(), 200)

  log('connectivity restored: Retry revokes the real session; /auth/me is 401 and a refresh stays signed out')
  mode = 'pass'
  const before = logoutPosts.length
  await page.getByRole('button', { name: 'Retry sign-out' }).dblclick().catch(() => {})
  await page.getByRole('heading', { name: 'Sign in to your workspace' }).waitFor()
  assert.equal(logoutPosts.length - before, 1, 'duplicate activation sent one revocation')
  assert.equal(await meStatus(), 401)
  await page.reload()
  await page.getByRole('heading', { name: 'Sign in to your workspace' }).waitFor()
  assert.equal(await page.getByLabel('Workspace title').count(), 0)
  assert.equal(await meStatus(), 401)

  console.log('OK: failed sign-out is reported with Retry, Retry revokes the server session, refresh stays signed out')
} catch (error) {
  console.error(`FAILED at: ${step}`)
  await page.screenshot({ path: 'e2e-failure.png' }).catch(() => {})
  console.error(error)
  process.exitCode = 1
} finally {
  await browser.close()
}
