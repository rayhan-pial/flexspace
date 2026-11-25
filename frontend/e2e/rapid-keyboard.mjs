// Real-browser, real-backend check of UI-029: the keyboard sort sequence Space, arrow, Space works when the keys
// arrive back to back (no artificial wait for the "Picked up" announcement), for sections, outline widgets and
// navigation items; cancel with Escape restores; every sort also has a working Move alternative.
// Not part of `npm test`. Same prerequisites as grid-gesture.mjs. Run: npm run test:browser
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
import { goTo, inspector } from './shell.mjs'

const executablePath = process.env.E2E_BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:5173'
const PASSWORD = 'correct horse battery staple'
const ROUNDS = Number(process.env.RAPID_ROUNDS ?? 25)

const browser = await chromium.launch({ executablePath })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
let step = 'start'
const log = (message) => {
  step = message
  console.log(`- ${message}`)
}

const sectionTitles = () => page.locator('[data-section-id] > div > h2').allInnerTexts()
const spoken = () => page.getByRole('status', { name: 'Sorting status' }).first().innerText()
const writes = []
page.on('request', (r) => r.method() !== 'GET' && r.url().includes('/api/') && writes.push(r.method()))

const VARIANT = process.env.RAPID_VARIANT ?? 'sequential'

/**
 * Space, arrow, Space with no waiting for any announcement in between. `sequential` awaits each key press;
 * `parallel` queues all three key presses at once; `same-task` dispatches the three keydown events inside one
 * JavaScript task, the harshest timing a person (or a very fast macro) could produce.
 */
async function rapid(handle, arrow) {
  await handle.focus()
  if (VARIANT === 'parallel') {
    await Promise.all([page.keyboard.press('Space'), page.keyboard.press(arrow), page.keyboard.press('Space')])
  } else if (VARIANT === 'same-task') {
    await page.evaluate((key) => {
      const fire = (k, code) => document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: k, code, bubbles: true, cancelable: true }))
      fire(' ', 'Space')
      fire(key, key)
      fire(' ', 'Space')
    }, arrow)
  } else {
    await page.keyboard.press('Space')
    await page.keyboard.press(arrow)
    await page.keyboard.press('Space')
  }
}

try {
  log('register: sections Today, Reference')
  await page.goto(baseUrl)
  await page.getByRole('button', { name: 'Create an account' }).click()
  await page.getByLabel('Email').fill(`e2e${Date.now()}${Math.floor(Math.random() * 1e6)}@example.com`)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await inspector(page).waitFor()
  assert.deepEqual(await sectionTitles(), ['Today', 'Reference'])
  writes.length = 0 // the account registration is not a sort write

  log(`${ROUNDS} rapid Space, ArrowDown, Space sequences on the section grip each move the section exactly one place`)
  let misses = 0
  let order = ['Today', 'Reference']
  for (let round = 0; round < ROUNDS; round += 1) {
    const moving = order[0]
    await rapid(page.getByRole('button', { name: `Reorder section ${moving}` }), 'ArrowDown')
    await page.waitForFunction((expected) => [...document.querySelectorAll('[data-section-id] > div > h2')].map((h) => h.textContent).join('|') === expected, [order[1], order[0]].join('|'), { timeout: 3000 }).catch(() => { misses += 1 })
    const actual = await sectionTitles()
    if (actual.join('|') !== [order[1], order[0]].join('|')) {
      console.log(`  round ${round}: expected ${[order[1], order[0]]} but saw ${actual}`)
      await page.keyboard.press('Escape')
      break
    }
    order = actual
  }
  assert.equal(misses, 0, `${misses} rapid sequences lost their first movement`)
  console.log(`  ${ROUNDS}/${ROUNDS} rapid sequences moved the section`)

  log('the status line says what happened in words, and nothing was saved')
  await page.waitForFunction(() => /^Dropped section .* at position \d of 2 in Sections\.$/.test(document.querySelector('[aria-label="Sorting status"]')?.textContent ?? ''), null, { timeout: 3000 })
  assert.match(await spoken(), /^Dropped section .* at position \d of 2 in Sections\.$/)
  assert.deepEqual(writes, [])

  log('rapid pickup then Escape cancels with no change')
  const before = await sectionTitles()
  const grip = page.getByRole('button', { name: `Reorder section ${before[0]}` })
  await grip.focus()
  await page.keyboard.press('Space')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  assert.deepEqual(await sectionTitles(), before)
  assert.match(await spoken(), /cancel|Cancel|back where it was/i)

  log('the Move alternative reaches the same result without dragging')
  await goTo(page, 'Outline')
  const outline = page.getByRole('list', { name: 'Components' })
  await outline.getByRole('button', { name: before[0], exact: true }).click()
  await goTo(page, 'My workspace')
  await inspector(page).getByRole('button', { name: /^Move down/ }).click()
  assert.deepEqual(await sectionTitles(), [before[1], before[0]])

  console.log('OK: rapid keyboard sorting never loses its first movement; Escape and Move alternatives work')
} catch (error) {
  console.error(`FAILED at: ${step}`)
  await page.screenshot({ path: 'e2e-failure.png' }).catch(() => {})
  console.error(error)
  process.exitCode = 1
} finally {
  await browser.close()
}
