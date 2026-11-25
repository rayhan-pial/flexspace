// Real-browser, real-backend audit of responsive layout and keyboard accessibility (FS-026): every
// design with every navigation placement at 1920, 1440, 1280, 1024, 768 and 390 px wide, in Preview and (from
// 1024) Edit. Not part of `npm test`. Same prerequisites as grid-gesture.mjs.
// Run: npm run test:browser      Set E2E_REPORT=1 to print every measurement.
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
import { goTo, inspector } from './shell.mjs'

const executablePath = process.env.E2E_BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:5173'
const report = process.env.E2E_REPORT === '1'
const PASSWORD = 'correct horse battery staple'
const WIDTHS = [1920, 1440, 1280, 1024, 768, 390]

const browser = await chromium.launch({ executablePath })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
let step = 'start'
const log = (message) => {
  step = message
  console.log(`- ${message}`)
}

const settings = inspector(page)
const components = inspector(page)

async function applyTemplate(name) {
  await goTo(page, 'Templates')
  await settings.getByRole('radio', { name: new RegExp(name) }).check()
  await settings.getByRole('button', { name: `Apply ${name}` }).click()
  const confirm = page.getByRole('alertdialog')
  if (await confirm.isVisible().catch(() => false)) await confirm.getByRole('button', { name: 'Replace my draft' }).click()
  await settings.getByText(new RegExp(`${name} is now in your draft`)).waitFor()
}

async function setPlacement(label) {
  await goTo(page, 'Outline')
  await components.getByLabel('Navigation placement').selectOption({ label })
}

/** What a reader would notice at the current width. */
const measure = () =>
  page.evaluate(() => {
    const vw = document.documentElement.clientWidth
    const overflowing = [...document.querySelectorAll('body *')]
      .filter((el) => {
        const r = el.getBoundingClientRect()
        if (r.width === 0 || getComputedStyle(el).position === 'fixed') return false
        return r.right > vw + 1 && !el.closest('[data-scroll-x]')
      })
      .slice(0, 5)
      .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)} right=${Math.round(el.getBoundingClientRect().right)}`)
    const section = document.querySelector('[data-section-id]')
    const sectionWidth = section ? Math.round(section.getBoundingClientRect().width) : 0
    const widgets = [...document.querySelectorAll('[data-widget-id]')].map((w) => {
      const r = w.getBoundingClientRect()
      return { w: Math.round(r.width), clipped: w.scrollWidth > w.clientWidth + 1 }
    })
    return {
      pageOverflow: document.documentElement.scrollWidth - vw,
      overflowing,
      sectionWidth,
      narrowestWidget: widgets.length ? Math.min(...widgets.map((x) => x.w)) : 0,
      clippedWidgets: widgets.filter((x) => x.clipped).length,
    }
  })

try {
  log('register')
  await page.goto(baseUrl)
  await page.getByRole('button', { name: 'Create an account' }).click()
  await page.getByLabel('Email').fill(`e2e${Date.now()}${Math.floor(Math.random() * 1e6)}@example.com`)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await inspector(page).waitFor()
  await goTo(page, 'Outline')

  const cases = [
    ['Productivity', 'Top bar'],
    ['Productivity', 'Left sidebar'],
    ['Creative', 'Right sidebar'],
    ['Analytics', 'Top bar'],
    ['Analytics', 'Left sidebar'],
  ]
  for (const [design, placement] of cases) {
    await page.setViewportSize({ width: 1440, height: 1000 })
    await applyTemplate(design)
    await setPlacement(placement)
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 1000 })
      await page.waitForTimeout(400)
      const modes = width >= 1024 ? ['edit', 'preview'] : ['preview']
      for (const mode of modes) {
        if (width >= 1024) {
          const toggle = mode === 'preview' ? page.getByRole('button', { name: 'Preview', exact: true }) : page.getByRole('button', { name: 'Edit workspace' })
          if (await toggle.isVisible().catch(() => false)) await toggle.click()
          await page.waitForTimeout(300)
        }
        const m = await measure()
        const label = `${design} / ${placement} / ${width}px / ${mode}`
        if (report) console.log(label, JSON.stringify(m))
        assert.equal(m.pageOverflow, 0, `${label}: page scrolls sideways by ${m.pageOverflow}px (${m.overflowing.join('; ')})`)
        assert.equal(m.clippedWidgets, 0, `${label}: ${m.clippedWidgets} widget(s) clip their content`)
        if (mode === 'edit') assert.ok(m.sectionWidth >= 480, `${label}: the canvas is only ${m.sectionWidth}px wide`)
        assert.ok(m.narrowestWidget >= (width < 1024 ? 240 : 150), `${label}: a widget is only ${m.narrowestWidget}px wide`)
      }
      if (width >= 1024) {
        const edit = page.getByRole('button', { name: 'Edit workspace' })
        if (await edit.isVisible().catch(() => false)) await edit.click()
      }
    }
  }

  log('200% zoom (720 and 960 css px) with a dirty draft: Preview with no sideways scrolling, and widening restores Edit with the same draft and no write')
  const puts = []
  page.on('request', (request) => {
    if (request.method() === 'PUT' && request.url().includes('/api/workspace')) puts.push(request.url())
  })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.waitForTimeout(800)
  await applyTemplate('Productivity')
  await page.getByLabel('Workspace title').fill('Zoomed workspace')
  const box = page.getByRole('checkbox').first()
  const ticked = await box.isChecked()
  for (const width of [960, 720]) {
    await page.setViewportSize({ width, height: 900 })
    await page.waitForTimeout(500)
    const m = await measure()
    assert.equal(m.pageOverflow, 0, `${width}px (200% zoom): page scrolls sideways by ${m.pageOverflow}px`)
    assert.equal(m.clippedWidgets, 0, `${width}px (200% zoom): widgets clip their content`)
    await page.getByRole('note').filter({ hasText: /stay in this browser tab until you open the workspace on a wider screen and press Save/ }).waitFor()
    assert.equal(await page.getByRole('complementary').count(), 0, 'no inspector below 1024px')
    assert.match(await page.getByRole('status', { name: 'Save status' }).innerText(), /^Unsaved changes\./)
  }
  await page.getByRole('checkbox').first().click() // tasks still work in the narrow Preview
  assert.equal(await page.getByRole('checkbox').first().isChecked(), !ticked)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.waitForTimeout(900)
  assert.equal(await page.getByLabel('Workspace title').inputValue(), 'Zoomed workspace', 'the draft survives narrowing and widening')
  assert.equal(await page.getByRole('checkbox').first().isChecked(), !ticked, 'the task tick made in the narrow Preview is still in the draft')
  assert.equal(await page.getByRole('status', { name: 'Save status' }).innerText(), 'Unsaved changes')
  assert.equal(await inspector(page).count(), 1, 'Edit and its inspector are back')
  assert.equal(puts.length, 0, 'resizing never wrote to the server')

  log('the rail and the inspector have the specified widths at 1024, 1280 and 1440 px')
  const widthsAt = async (width) => {
    await page.setViewportSize({ width, height: 900 })
    await page.waitForTimeout(1000) // the grid re-measures asynchronously after a resize
    const rail = await page.locator('aside:has(nav[aria-label="Editor navigation"])').boundingBox()
    const panel = await inspector(page).boundingBox()
    return { rail: Math.round(rail.width), inspector: Math.round(panel.width) }
  }
  assert.deepEqual(await widthsAt(1024), { rail: 64, inspector: 280 })
  assert.deepEqual(await widthsAt(1280), { rail: 64, inspector: 304 })
  assert.deepEqual(await widthsAt(1440), { rail: 192, inspector: 304 })

  log('at 1024px the inspector of a long workspace stays in reach: it scrolls on its own and stays in view')
  await page.setViewportSize({ width: 1024, height: 700 })
  await page.waitForTimeout(1000)
  const column = await page.evaluate(() => {
    const aside = document.querySelector('aside[aria-label="Inspector"]')
    const s = getComputedStyle(aside)
    return { position: s.position, overflowY: s.overflowY, height: Math.round(aside.getBoundingClientRect().height) }
  })
  assert.equal(column.position, 'sticky')
  assert.equal(column.overflowY, 'auto')
  assert.ok(column.height <= 700, `the inspector fits the window (${column.height}px)`)
  await page.evaluate(() => window.scrollTo(0, 600))
  await page.waitForTimeout(200)
  const reachable = await page.evaluate(() => Math.round(document.querySelector('aside[aria-label="Inspector"]').getBoundingClientRect().top))
  assert.ok(reachable >= 0 && reachable <= 24, `the inspector stays at the top of the window while the canvas scrolls (${reachable}px)`)
  const side = await measure()
  assert.equal(side.pageOverflow, 0, `no sideways scrolling with the inspector open (${side.pageOverflow}px)`)

  console.log('\nOK: real browser responsive layout passes')
} catch (error) {
  await page.screenshot({ path: process.env.E2E_SHOT ?? 'e2e-failure.png', fullPage: true }).catch(() => {})
  console.error(`\nFAILED at step: ${step}\n`, error)
  process.exitCode = 1
} finally {
  await browser.close()
}
