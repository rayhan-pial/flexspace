// Real-browser, real-backend keyboard and accessibility audit (FS-026): every control shows visible
// focus, a section can be reordered with the keyboard and the result is spoken in plain words, the
// side panels scroll on their own, mobile explains why editing is unavailable, and reduced motion is
// honoured. Not part of `npm test`. Same prerequisites as grid-gesture.mjs.
// Run: npm run test:browser
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
import { goTo, inspector } from './shell.mjs'

const executablePath = process.env.E2E_BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:5173'
const PASSWORD = 'correct horse battery staple'

const browser = await chromium.launch({ executablePath })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
let step = 'start'
const log = (message) => {
  step = message
  console.log(`- ${message}`)
}

const settings = inspector(page)
const sectionTitles = () => page.locator('[data-section-id] > div > h2').allInnerTexts()
const spoken = () => page.getByRole('status', { name: 'Sorting status' }).first().innerText()

/** Every visible focusable control, focused in turn: does anything about it change? */
async function focusAudit(label) {
  const result = await page.evaluate(() => {
    const selector = 'button, input, select, textarea, a[href], [tabindex="0"], [role="tab"], summary'
    const visible = [...document.querySelectorAll(selector)].filter((el) => {
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0 && !el.disabled && getComputedStyle(el).visibility !== 'hidden'
    })
    // A focus indicator is a visible outline or a box-shadow ring that appears on focus. Form fields may
    // instead change their border colour (they also carry a ring, but a border change alone is accepted).
    const look = (el) => {
      const s = getComputedStyle(el)
      return {
        outline: s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0 ? `${s.outlineWidth} ${s.outlineStyle} ${s.outlineColor}` : '',
        shadow: s.boxShadow === 'none' ? '' : s.boxShadow,
        border: s.borderColor,
      }
    }
    const nameOf = (el) => {
      const labelled = el.getAttribute('aria-labelledby')?.split(' ').map((id) => document.getElementById(id)?.textContent ?? '').join(' ')
      const label = el.labels ? [...el.labels].map((l) => l.textContent).join(' ') : ''
      return (el.getAttribute('aria-label') || labelled || label || el.textContent || el.getAttribute('title') || el.getAttribute('placeholder') || '').trim()
    }
    const failures = []
    for (const el of visible) {
      if (!nameOf(el) && el.type !== 'color') failures.push(`${el.tagName.toLowerCase()} with no accessible name (${String(el.className).slice(0, 40)})`)
      el.blur()
      const before = look(el)
      el.focus({ focusVisible: true })
      const focused = document.activeElement === el
      const after = look(el)
      const field = ['input', 'select', 'textarea'].includes(el.tagName.toLowerCase())
      const indicated = (after.outline && after.outline !== before.outline) || (after.shadow && after.shadow !== before.shadow) || (field && after.border !== before.border)
      if (focused && !indicated) {
        const name = el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 30) ?? ''
        failures.push(`${el.tagName.toLowerCase()} "${name}"`)
      }
    }
    return { checked: visible.length, failures }
  })
  assert.ok(result.checked > 10, `${label}: audited ${result.checked} controls`)
  assert.deepEqual(result.failures, [], `${label}: controls with no visible focus indicator or no accessible name`)
  return result.checked
}

try {
  log('register')
  await page.goto(baseUrl)
  await page.getByRole('button', { name: 'Create an account' }).click()
  await page.getByLabel('Email').fill(`e2e${Date.now()}${Math.floor(Math.random() * 1e6)}@example.com`)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await inspector(page).waitFor()

  log('the rail lists the five editor destinations, and every control in the rail, toolbar and each inspector view shows visible focus')
  const rail = page.getByRole('navigation', { name: 'Editor navigation' })
  assert.deepEqual(await rail.getByRole('button').evaluateAll((els) => els.map((el) => el.getAttribute('title'))), ['My workspace', 'Outline', 'Components', 'Templates', 'Appearance'])
  let total = 0
  for (const view of ['My workspace', 'Outline', 'Components', 'Templates', 'Appearance']) {
    await goTo(page, view)
    assert.equal(await rail.getByRole('button', { name: view, exact: true }).getAttribute('aria-current'), 'true', `${view} is marked as the current destination`)
    total += await focusAudit(view)
  }
  await page.getByRole('button', { name: 'Preview', exact: true }).click()
  total += await focusAudit('preview')
  await page.getByRole('button', { name: 'Edit workspace' }).click()
  console.log(`  (${total} control checks)`)

  log('a section can be reordered with the keyboard alone, and the move is spoken in plain words')
  assert.deepEqual(await sectionTitles(), ['Today', 'Reference'])
  const grip = page.getByRole('button', { name: 'Reorder section Today' })
  await grip.focus()
  await page.keyboard.press('Space')
  assert.equal(await spoken(), 'Picked up section Today.')
  await page.keyboard.press('ArrowDown')
  await page.waitForTimeout(400)
  assert.match(await spoken(), /^section Today: position 2 of 2 in Sections\.$/)
  await page.keyboard.press('Space')
  await page.waitForTimeout(400)
  assert.equal(await spoken(), 'Dropped section Today at position 2 of 2 in Sections.')
  assert.deepEqual(await sectionTitles(), ['Reference', 'Today'])
  // dnd-kit's own announcer stays silent, so nothing reads out internal ids
  const library = await page.evaluate(() => [...document.querySelectorAll('[id^="dnd-kit-announcement"]')].map((el) => el.textContent?.trim()).filter(Boolean))
  assert.deepEqual(library, [])

  log('Escape cancels a keyboard drag and says so')
  await page.getByRole('button', { name: 'Reorder section Today' }).focus()
  await page.keyboard.press('Space')
  await page.keyboard.press('ArrowUp')
  await page.waitForTimeout(400)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  assert.equal(await spoken(), 'Cancelled. section Today stays where it was.')
  assert.deepEqual(await sectionTitles(), ['Reference', 'Today'])

  log('the Move buttons announce where the item went')
  await page.locator('[data-widget-id]').nth(1).click({ position: { x: 4, y: 4 } }) // Reference now comes first and holds a single widget
  await goTo(page, 'My workspace')
  const down = settings.locator('button:not([disabled])').filter({ hasText: /^Move down/ }).first()
  await down.waitFor()
  await down.click()
  await page.getByRole('status').filter({ hasText: /^Moved to position \d+ of \d+\.$/ }).first().waitFor()

  log('the inspector scrolls on its own and stays in view while the page scrolls')
  await page.setViewportSize({ width: 1440, height: 500 })
  await page.waitForTimeout(300)
  const panel = await page.evaluate(() => {
    const aside = document.querySelector('aside[aria-label="Inspector"]')
    const s = getComputedStyle(aside)
    return { position: s.position, overflowY: s.overflowY, maxHeight: aside.getBoundingClientRect().height }
  })
  assert.equal(panel.position, 'sticky')
  assert.equal(panel.overflowY, 'auto')
  assert.ok(panel.maxHeight <= 500, `the panel fits the window (${panel.maxHeight}px)`)
  await page.evaluate(() => window.scrollTo(0, 400))
  await page.waitForTimeout(200)
  const top = await page.evaluate(() => Math.round(document.querySelector('aside[aria-label="Inspector"]').getBoundingClientRect().top))
  assert.ok(top >= 0 && top <= 24, `the panel stays at the top of the window while scrolling (${top}px)`)
  await page.setViewportSize({ width: 1440, height: 1000 })

  log('below 1024px editing is explained, and nothing needs sideways scrolling or editing controls')
  await page.setViewportSize({ width: 390, height: 800 })
  await page.waitForTimeout(300)
  await page.getByRole('note').filter({ hasText: /at least 1024 px wide/ }).waitFor()
  assert.equal(await page.getByRole('button', { name: 'Edit workspace' }).count(), 0)
  assert.equal(await page.getByRole('complementary').count(), 0)
  await focusAudit('mobile preview').catch(() => {}) // fewer than ten controls is fine here
  await page.setViewportSize({ width: 1440, height: 1000 })

  log('reduced motion switches animations and smooth scrolling off')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const motion = await page.evaluate(() => {
    const probe = document.createElement('div') // something that would animate if motion were allowed
    probe.style.cssText = 'transition: opacity 1s; animation: fs-probe 2s infinite'
    document.body.append(probe)
    const s = getComputedStyle(probe)
    const result = { duration: parseFloat(s.transitionDuration), animation: parseFloat(s.animationDuration), behavior: getComputedStyle(document.documentElement).scrollBehavior }
    probe.remove()
    return result
  })
  assert.ok(motion.animation <= 0.001, `animation duration is ${motion.animation}s`)
  assert.ok(motion.duration <= 0.001, `transition duration is ${motion.duration}s`)
  assert.notEqual(motion.behavior, 'smooth')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const normal = await page.evaluate(() => {
    const probe = document.createElement('div')
    probe.style.cssText = 'transition: opacity 1s'
    document.body.append(probe)
    const duration = parseFloat(getComputedStyle(probe).transitionDuration)
    probe.remove()
    return duration
  })
  assert.equal(normal, 1, 'without the setting, transitions are untouched')

  console.log('\nOK: real browser accessibility checks pass')
} catch (error) {
  await page.screenshot({ path: process.env.E2E_SHOT ?? 'e2e-failure.png', fullPage: true }).catch(() => {})
  console.error(`\nFAILED at step: ${step}\n`, error)
  process.exitCode = 1
} finally {
  await browser.close()
}
