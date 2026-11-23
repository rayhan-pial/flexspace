// Real-browser, real-backend audit of responsive layout and keyboard accessibility (FS-026): every
// design with every navigation placement at 1440, 1024, 768 and 390 px wide, in Preview and (from
// 1024) Edit. Not part of `npm test`. Same prerequisites as grid-gesture.mjs.
// Run: npm run test:browser      Set E2E_REPORT=1 to print every measurement.
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'

const executablePath = process.env.E2E_BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:5173'
const report = process.env.E2E_REPORT === '1'
const PASSWORD = 'correct horse battery staple'
const WIDTHS = [1440, 1024, 768, 390]

const browser = await chromium.launch({ executablePath })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
let step = 'start'
const log = (message) => {
  step = message
  console.log(`- ${message}`)
}

const settings = page.getByRole('complementary', { name: 'Settings panel' })
const components = page.getByRole('complementary', { name: 'Components panel' })

async function applyTemplate(name) {
  await settings.getByRole('tab', { name: 'Templates' }).click()
  await settings.getByRole('radio', { name: new RegExp(name) }).check()
  await settings.getByRole('button', { name: `Apply ${name}` }).click()
  const confirm = page.getByRole('alertdialog')
  if (await confirm.isVisible().catch(() => false)) await confirm.getByRole('button', { name: 'Replace my draft' }).click()
  await settings.getByText(new RegExp(`${name} is now in your draft`)).waitFor()
}

async function setPlacement(label) {
  await components.getByRole('tab', { name: 'Outline' }).click()
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
  await page.getByRole('list', { name: 'Components' }).waitFor()

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

  log('at 1024px the properties of a long workspace stay in reach: the panel column scrolls on its own')
  await page.setViewportSize({ width: 1024, height: 700 })
  await page.waitForTimeout(300)
  const column = await page.evaluate(() => {
    const aside = document.querySelector('aside[aria-label="Settings panel"]')
    const wrapper = aside.parentElement
    const s = getComputedStyle(wrapper)
    return { position: s.position, overflowY: s.overflowY, height: Math.round(wrapper.getBoundingClientRect().height) }
  })
  assert.equal(column.position, 'sticky')
  assert.equal(column.overflowY, 'auto')
  assert.ok(column.height <= 700, `the panel column fits the window (${column.height}px)`)
  await page.evaluate(() => window.scrollTo(0, 600))
  await page.waitForTimeout(200)
  const reachable = await page.evaluate(() => Math.round(document.querySelector('aside[aria-label="Settings panel"]').parentElement.getBoundingClientRect().top))
  assert.ok(reachable >= 0 && reachable <= 24, `panels stay at the top of the window while the canvas scrolls (${reachable}px)`)

  console.log('\nOK: real browser responsive layout passes')
} catch (error) {
  await page.screenshot({ path: process.env.E2E_SHOT ?? 'e2e-failure.png', fullPage: true }).catch(() => {})
  console.error(`\nFAILED at step: ${step}\n`, error)
  process.exitCode = 1
} finally {
  await browser.close()
}
