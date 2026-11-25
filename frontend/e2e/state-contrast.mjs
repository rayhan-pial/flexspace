// Real-browser, measured check for UI-029: focus indicators (3:1 non-text contrast), hover text (4.5:1), error text and
// invalid-field borders, and that every natively disabled button carries a readable reason (aria-describedby pointing at
// non-empty text) in the editor, with a selected widget at a boundary, and in both dialogs.
// Not part of `npm test`. Same prerequisites as grid-gesture.mjs. Run: npm run test:browser
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
import { goTo, inspector, library, templates } from './shell.mjs'

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

// Contrast helpers run in the page so they use real computed colors and the real stack of backgrounds.
await page.addInitScript(() => {
  // Tailwind v4 colors can compute to oklch() or color-mix(); a 1x1 canvas turns any CSS color into plain sRGB.
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 1
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const parse = (value) => {
    if (!value) return null
    const m = value.match(/^rgba?\(([^)]+)\)$/)
    if (m) {
      const [r, g, b, a = '1'] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number)
      return { r, g, b, a }
    }
    ctx.clearRect(0, 0, 1, 1)
    ctx.fillStyle = '#000'
    ctx.fillStyle = value
    ctx.fillRect(0, 0, 1, 1)
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
    return { r, g, b, a: a / 255 }
  }
  const over = (top, bottom) => ({ r: top.r * top.a + bottom.r * (1 - top.a), g: top.g * top.a + bottom.g * (1 - top.a), b: top.b * top.a + bottom.b * (1 - top.a), a: 1 })
  const luminance = ({ r, g, b }) => {
    const lin = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
  }
  window.__fs = {
    contrast(a, b) {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
      return (hi + 0.05) / (lo + 0.05)
    },
    /** The color a pixel behind `el` really has: its own background flattened over its ancestors'. */
    backdrop(el) {
      const stack = []
      for (let node = el; node; node = node.parentElement) {
        const c = parse(getComputedStyle(node).backgroundColor)
        if (c && c.a > 0) stack.push(c)
        if (c && c.a === 1) break
      }
      return stack.reduceRight((below, layer) => over(layer, below), { r: 255, g: 255, b: 255, a: 1 })
    },
    parse,
    over,
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
  await page.getByLabel('Workspace title').fill('Contrast check')

  log('focus: every tab stop in the toolbar, rail and inspector has an outline at least 3:1 against what is behind it')
  const focusFailures = []
  let focusChecked = 0
  for (let i = 0; i < 60; i += 1) {
    await page.keyboard.press('Tab')
    await page.waitForTimeout(220) // Tailwind's transition-colors fades the outline in over 150 ms; measure the settled color
    const result = await page.evaluate(() => {
      const el = document.activeElement
      if (!el || el === document.body || !el.matches(':focus-visible')) return null
      const s = getComputedStyle(el)
      const outline = s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0 ? window.__fs.parse(s.outlineColor) : null
      const back = window.__fs.backdrop(el.parentElement ?? el)
      const own = window.__fs.parse(s.borderColor)
      const name = (el.getAttribute('aria-label') || el.textContent || el.id || el.tagName).trim().slice(0, 30)
      if (outline) return { name, kind: 'outline', ratio: window.__fs.contrast(window.__fs.over(outline, back), back) }
      // Form fields may signal focus by border color instead (checked against the field's own surface).
      const fieldBack = window.__fs.backdrop(el)
      return { name, kind: 'border', ratio: own ? window.__fs.contrast(own, fieldBack) : 0 }
    })
    if (!result) continue
    focusChecked += 1
    if (result.ratio < 3) focusFailures.push(`${result.name} (${result.kind}) ${result.ratio.toFixed(2)}:1`)
  }
  console.log(`  ${focusChecked} focus indicators measured`)
  assert.ok(focusChecked >= 25, 'a meaningful number of tab stops was measured')
  assert.deepEqual(focusFailures, [], 'focus indicators below 3:1')

  log('hover: text on hovered buttons and rail items stays at 4.5:1 or better')
  const hoverTargets = [
    page.locator('[data-toolbar]').getByRole('button', { name: 'Add component' }),
    page.locator('[data-toolbar]').getByRole('button', { name: 'Preview' }),
    page.locator('[data-toolbar]').getByRole('button', { name: 'Save', exact: true }),
    page.getByRole('navigation', { name: 'Editor navigation' }).getByRole('button', { name: 'Outline' }),
    page.getByRole('navigation', { name: 'Editor navigation' }).getByRole('button', { name: 'Appearance' }),
  ]
  const hoverFailures = []
  for (const target of hoverTargets) {
    await target.hover()
    await page.waitForTimeout(250) // the 150 ms color transition
    const ratio = await target.evaluate((el) => {
      const text = window.__fs.parse(getComputedStyle(el).color)
      const back = window.__fs.backdrop(el)
      return window.__fs.contrast(window.__fs.over(text, back), back)
    })
    const label = await target.innerText().catch(() => '?')
    console.log(`  hover ${JSON.stringify(label.trim() || 'icon')} ${ratio.toFixed(2)}:1`)
    if (ratio < 4.5) hoverFailures.push(`${label.trim()} ${ratio.toFixed(2)}:1`)
  }
  assert.deepEqual(hoverFailures, [], 'hover text below 4.5:1')

  log('errors: an invalid color shows readable error text and a visible invalid border')
  await goTo(page, 'Appearance')
  const field = inspector(page).getByLabel('Primary color')
  await field.fill('#12')
  await inspector(page).getByRole('alert').first().waitFor()
  const error = await inspector(page).getByRole('alert').first().evaluate((el) => {
    const text = window.__fs.parse(getComputedStyle(el).color)
    const back = window.__fs.backdrop(el)
    return window.__fs.contrast(window.__fs.over(text, back), back)
  })
  const border = await field.evaluate((el) => {
    const s = getComputedStyle(el)
    return { ratio: window.__fs.contrast(window.__fs.parse(s.borderColor), window.__fs.backdrop(el)), invalid: el.getAttribute('aria-invalid') }
  })
  console.log(`  error text ${error.toFixed(2)}:1, invalid border ${border.ratio.toFixed(2)}:1`)
  assert.ok(error >= 4.5, `error text contrast ${error.toFixed(2)}`)
  assert.equal(border.invalid, 'true')
  assert.ok(border.ratio >= 3, `the invalid border is visible (${border.ratio.toFixed(2)}:1)`)
  await field.fill('#6366f1')

  log('banners: the save-error, conflict and status colors are readable')
  const samples = await page.evaluate(() => {
    const make = (cls, text) => {
      const el = document.createElement('p')
      el.className = cls
      el.textContent = text
      document.body.appendChild(el)
      const t = window.__fs.parse(getComputedStyle(el).color)
      const b = window.__fs.backdrop(el)
      const ratio = window.__fs.contrast(window.__fs.over(t, b), b)
      el.remove()
      return { cls, ratio }
    }
    return [
      make('rounded px-3 py-2 text-sm bg-red-50 text-red-900', 'save error'),
      make('rounded px-3 py-2 text-sm bg-amber-50 text-ui-warning', 'conflict'),
      make('rounded px-3 py-2 text-sm bg-emerald-50 text-emerald-900', 'confirmation'),
      make('text-xs text-ui-muted bg-ui-surface', 'muted help text'),
    ]
  })
  for (const sample of samples) {
    console.log(`  ${sample.cls}: ${sample.ratio.toFixed(2)}:1`)
    assert.ok(sample.ratio >= 4.5, `${sample.cls} ${sample.ratio.toFixed(2)}:1`)
  }

  // Disabled controls: a natively disabled button must point at a non-empty, readable reason.
  const unexplained = () =>
    page.evaluate(() => {
      const bad = []
      const scope = document.querySelector('[role="dialog"]') ?? document
      for (const button of scope.querySelectorAll('button[disabled]')) {
        const ids = (button.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean)
        const text = ids.map((id) => document.getElementById(id)?.textContent?.trim() ?? '').join(' ').trim()
        if (!text) bad.push(`${(button.getAttribute('aria-label') || button.textContent || '').trim().slice(0, 30)}: no reason`)
      }
      return bad
    })

  log('disabled reasons: the idle editor (Undo, Redo, Cancel, Save) explain themselves')
  await goTo(page, 'My workspace')
  assert.deepEqual(await unexplained(), [])
  const disabledCount = await page.locator('button[disabled]').count()
  console.log(`  ${disabledCount} disabled buttons, all explained`)

  log('disabled reasons: a widget at the top-left corner explains Left, Up and the size limits, in text a screen reader can read')
  await page.getByRole('article', { name: 'Welcome' }).click({ position: { x: 60, y: 12 } })
  await inspector(page).getByRole('button', { name: /Move Welcome left/ }).waitFor()
  assert.deepEqual(await unexplained(), [])
  assert.equal(await inspector(page).getByRole('button', { name: 'Move Welcome left' }).isDisabled(), true)
  const left = await inspector(page).getByRole('button', { name: 'Move Welcome left' }).evaluate((el) => document.getElementById(el.getAttribute('aria-describedby')).textContent)
  assert.match(left, /left edge/)
  assert.ok((await inspector(page).getByText(/Unavailable now:/).innerText()).includes('Left'))

  log('disabled reasons: both dialogs')
  await goTo(page, 'Components')
  assert.deepEqual(await unexplained(), [])
  await page.keyboard.press('Escape')
  await library(page).waitFor({ state: 'hidden' })
  await goTo(page, 'Templates')
  await templates(page).getByRole('radio', { name: /Creative/ }).check()
  await templates(page).getByRole('button', { name: 'Apply Creative' }).waitFor()
  assert.deepEqual(await unexplained(), [])
  await page.keyboard.press('Escape')

  console.log('OK: focus 3:1, hover and error 4.5:1, invalid border 3:1, and every disabled button explains itself')
} catch (error) {
  console.error(`FAILED at: ${step}`)
  await page.screenshot({ path: 'e2e-failure.png' }).catch(() => {})
  console.error(error)
  process.exitCode = 1
} finally {
  await browser.close()
}
