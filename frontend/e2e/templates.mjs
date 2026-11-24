// Real-browser, real-backend check of the curated system templates (FS-024): the live list, preview,
// apply, Restore default, and that each design is visually complete at desktop and narrow widths.
// Not part of `npm test`. Same prerequisites as grid-gesture.mjs. Run: npm run test:browser
// Set E2E_SHOT_DIR to a folder to also save a screenshot of every design at both widths.
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright-core'
import { goTo, inspector } from './shell.mjs'

const executablePath = process.env.E2E_BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:5173'
const shotDir = process.env.E2E_SHOT_DIR
const PASSWORD = 'correct horse battery staple'
if (shotDir) mkdirSync(shotDir, { recursive: true })

const browser = await chromium.launch({ executablePath })
const page = await browser.newPage({ viewport: { width: 1800, height: 2400 } })
let step = 'start'
const log = (message) => {
  step = message
  console.log(`- ${message}`)
}

const outline = page.getByRole('list', { name: 'Components' })
const settings = inspector(page)
const status = () => page.getByRole('status', { name: 'Save status' }).innerText()
const sectionTitles = () => page.locator('[data-section-id] > div > h2').allInnerTexts()
const ids = () => page.evaluate(() => ({
  sections: [...document.querySelectorAll('[data-section-id]')].map((e) => e.getAttribute('data-section-id')),
  widgets: [...document.querySelectorAll('[data-widget-id]')].map((e) => e.getAttribute('data-widget-id')),
}))

async function openTemplates() {
  await goTo(page, 'Templates')
  await settings.getByText(/Start from a ready-made design/).waitFor()
}

async function apply(name) {
  await openTemplates()
  await settings.getByRole('radio', { name: new RegExp(name) }).check()
  await settings.getByRole('button', { name: `Apply ${name}` }).click()
  const confirm = page.getByRole('alertdialog')
  if (await confirm.isVisible().catch(() => false)) await confirm.getByRole('button', { name: 'Replace my draft' }).click()
  await settings.getByText(new RegExp(`${name} is now in your draft`)).waitFor()
}

/** Everything a visually complete design must satisfy at the current width. */
async function assertComplete(label) {
  await page.waitForTimeout(500)
  const report = await page.evaluate(() => {
    const widgets = [...document.querySelectorAll('[data-widget-id]')]
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      unsupported: document.querySelectorAll('[data-unsupported]').length,
      empty: widgets.filter((w) => !(w.textContent ?? '').trim() && !w.querySelector('img,table')).length,
      broken: [...document.querySelectorAll('[data-widget-id] img')].filter((img) => !(img.complete && img.naturalWidth > 0)).length,
      widgets: widgets.length,
      rects: widgets.map((w) => { const r = w.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.width), Math.round(r.height)] }),
    }
  })
  assert.ok(report.widgets >= 5, `${label}: widgets render (${report.widgets})`)
  assert.equal(report.unsupported, 0, `${label}: no unsupported placeholders`)
  assert.equal(report.empty, 0, `${label}: no empty widget cards`)
  assert.equal(report.broken, 0, `${label}: every image decodes`)
  assert.ok(report.overflow <= 1, `${label}: no horizontal page overflow (${report.overflow}px)`)
  return report
}

async function shot(name) {
  if (shotDir) await page.screenshot({ path: join(shotDir, `${name}.png`), fullPage: true })
}

try {
  log('register: a new account starts from the Productivity design')
  const email = `e2e${Date.now()}@example.com`
  await page.goto(baseUrl)
  await page.getByRole('button', { name: 'Create an account' }).click()
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await inspector(page).waitFor()
  await goTo(page, 'Outline')
  await outline.waitFor()
  assert.deepEqual(await sectionTitles(), ['Today', 'Reference'])
  const starterIds = await ids()

  log('the Templates tab lists the three curated designs from the real API, Productivity first')
  await openTemplates()
  const names = await settings.getByRole('radio').evaluateAll((els) => els.map((e) => e.closest('label').querySelector('span span').textContent))
  assert.deepEqual(names, ['Productivity', 'Analytics', 'Creative'])
  await settings.getByText(/Key metrics and engagement figures/).waitFor()

  log('previewing a design changes nothing')
  await settings.getByRole('radio', { name: /Creative/ }).check()
  const preview = settings.getByRole('region', { name: 'Creative preview' })
  await preview.getByText(/3 sections, 9 widgets, navigation in the right sidebar: Studio, Ideas, Archive\./).waitFor()
  assert.equal(await status(), 'All changes saved')
  assert.deepEqual(await sectionTitles(), ['Today', 'Reference'])

  log('apply Analytics: the whole workspace becomes that design, as an unsaved draft')
  await apply('Analytics')
  assert.deepEqual(await sectionTitles(), ['Overview', 'Reports', 'Notes'])
  assert.equal(await status(), 'Unsaved changes')
  assert.equal(await page.getByRole('heading', { level: 1, name: 'Analytics workspace' }).count(), 1)
  const navBox = await page.getByRole('navigation', { name: 'Workspace' }).boundingBox()
  assert.ok(navBox.width > navBox.height, 'Analytics navigation is a top bar (wider than tall)')

  log('Cancel brings the saved Productivity workspace back exactly, with its original ids')
  await page.getByRole('button', { name: 'Cancel' }).click()
  await page.getByRole('button', { name: 'Discard changes' }).click()
  assert.deepEqual(await sectionTitles(), ['Today', 'Reference'])
  assert.deepEqual(await ids(), starterIds)
  assert.equal(await status(), 'All changes saved')

  for (const name of ['Productivity', 'Analytics', 'Creative']) {
    log(`${name}: visually complete at desktop width and at a narrow width`)
    await page.setViewportSize({ width: 1800, height: 2400 })
    await apply(name)
    const desktop = await assertComplete(`${name} at desktop`)
    await shot(`${name.toLowerCase()}-desktop`)
    // Below 1024 px the page is a Preview: the same widgets, stacked in one column, with no overflow.
    await page.setViewportSize({ width: 800, height: 2400 })
    const narrow = await assertComplete(`${name} at narrow width`)
    assert.equal(narrow.widgets, desktop.widgets, `${name}: the same widgets at both widths`)
    const lefts = new Set(narrow.rects.map(([x]) => x))
    assert.ok(lefts.size <= 2, `${name} at narrow width stacks the widgets in one column (lefts: ${[...lefts].join(', ')})`)
    await shot(`${name.toLowerCase()}-narrow`)
  }
  await page.setViewportSize({ width: 1800, height: 2400 })

  log('Creative has the containers for tile moves: drag an image from Inspiration to Mood board')
  await apply('Creative')
  const card = (title) => page.locator('[data-widget-id]').filter({ has: page.getByRole('heading', { level: 3, name: title, exact: true }) })
  const captions = (title) => card(title).locator('figcaption').allInnerTexts()
  const before = { inspiration: await captions('Inspiration'), mood: await captions('Mood board') }
  assert.equal(before.inspiration.length, 3)
  const grip = card('Inspiration').getByRole('button', { name: /^Reorder image / }).first()
  await grip.scrollIntoViewIfNeeded()
  const target = card('Mood board').locator('img').first()
  const g = await grip.boundingBox()
  const t = await target.boundingBox()
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2)
  await page.mouse.down()
  await page.mouse.move(g.x + 8, g.y + 8, { steps: 3 })
  await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2, { steps: 25 })
  await page.waitForTimeout(250)
  await page.mouse.up()
  await page.waitForTimeout(500)
  assert.equal((await captions('Inspiration')).length, 2)
  assert.equal((await captions('Mood board')).length, 4)

  log('Analytics has the containers for card and task moves: the Move buttons transfer a card and a task')
  await apply('Analytics')
  await goTo(page, 'Outline')
  await outline.getByRole('button', { name: 'Findings', exact: true }).click()
  await goTo(page, 'My workspace')
  await settings.getByRole('button', { name: 'Move to Notes' }).click()
  const notesSectionCards = await page.locator('[data-section-id]').filter({ has: page.getByRole('heading', { level: 2, name: 'Notes', exact: true }) }).locator('[data-widget-id] h3').allInnerTexts()
  assert.ok(notesSectionCards.includes('Findings'), `Findings moved into the Notes section (${notesSectionCards.join(', ')})`)
  await goTo(page, 'Outline')
  await outline.getByRole('button', { name: 'Follow-ups', exact: true }).click()
  await goTo(page, 'My workspace')
  await settings.getByRole('button', { name: 'Move to Next steps task' }).click()
  const nextTasks = await card('Next steps').locator('input[aria-label^="Task text: "]').evaluateAll((els) => els.map((e) => e.value))
  assert.equal(nextTasks.length, 3, 'a task moved from Follow-ups into Next steps')

  log('applying over unsaved changes asks first; "Keep my changes" leaves them alone')
  const draftTitle = await page.getByRole('heading', { level: 1 }).innerText()
  await openTemplates()
  await settings.getByRole('radio', { name: /Productivity/ }).check()
  await settings.getByRole('button', { name: 'Apply Productivity' }).click()
  const dialog = page.getByRole('alertdialog')
  await dialog.getByText('Replace your unsaved changes?').waitFor()
  await dialog.getByRole('button', { name: 'Keep my changes' }).click()
  assert.equal(await page.getByRole('heading', { level: 1 }).innerText(), draftTitle)

  log('Save, reload: the applied design persists with its new ids; none of the template ids is left')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByText('All changes saved').waitFor()
  const savedTitles = await sectionTitles()
  await page.reload()
  await inspector(page).waitFor()
  await goTo(page, 'Outline')
  await outline.waitFor()
  assert.deepEqual(await sectionTitles(), savedTitles)
  const after = await ids()
  for (const id of [...after.sections, ...after.widgets]) {
    assert.match(id, /^(section|widget)-[0-9a-f]{12}$/, `${id} is a fresh id, never a template id`)
  }

  log('Restore default: back to the Productivity design, as a draft with new ids')
  await openTemplates()
  await settings.getByRole('button', { name: 'Restore default' }).click()
  await settings.getByText(/The default Productivity design is now in your draft/).waitFor()
  assert.deepEqual(await sectionTitles(), ['Today', 'Reference'])
  assert.equal(await status(), 'Unsaved changes')
  const restored = await ids()
  assert.ok(restored.widgets.every((id) => /^widget-[0-9a-f]{12}$/.test(id)))
  assert.equal(restored.widgets.filter((id) => starterIds.widgets.includes(id)).length, 0)

  console.log('\nOK: real browser system templates pass')
} catch (error) {
  await page.screenshot({ path: process.env.E2E_SHOT ?? 'e2e-failure.png', fullPage: true }).catch(() => {})
  console.error(`\nFAILED at step: ${step}\n`, error)
  process.exitCode = 1
} finally {
  await browser.close()
}
