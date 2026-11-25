// Real-browser, real-backend check of UI-025: every widget at its smallest supported size, with long content, in a
// light and a dark palette. For each card nothing may be silently clipped: overflowing content is either inside an
// intentional scroll container or absent, there is no sideways overflow, and Welcome's text stays readable.
// Builds the workspace through the API (so the saved rectangles are the real minimums), then inspects the page.
// Not part of `npm test`. Same prerequisites as grid-gesture.mjs. Run: npm run test:browser
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright-core'
import { inspector } from './shell.mjs'

const executablePath = process.env.E2E_BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:5173'
const PASSWORD = 'correct horse battery staple'
const out = process.env.E2E_SHOTS ?? new URL('../../artifacts/ui-review/after/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
mkdirSync(out, { recursive: true })

const browser = await chromium.launch({ executablePath })
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })
let step = 'start'
const log = (message) => {
  step = message
  console.log(`- ${message}`)
}

const LONG_GREETING = 'A long greeting that keeps going '.repeat(6).trim().slice(0, 200)
const LONG_SUBTITLE = 'Line one of a longer supporting text.\nLine two keeps going and going and going.\nLine three asks for scrolling.\n' + 'More words. '.repeat(20)
try {
  log('register and build a workspace with every widget at its minimum size and long content')
  await page.goto(baseUrl)
  await page.getByRole('button', { name: 'Create an account' }).click()
  await page.getByLabel('Email').fill(`e2e${Date.now()}${Math.floor(Math.random() * 1e6)}@example.com`)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await inspector(page).waitFor()
  const failures = []
  for (const [name, theme] of [['light', {}], ['dark', { primary: '#818cf8', background: '#0f172a', surface: '#1e293b', text: '#e2e8f0' }]]) {
    await putFixture(theme)
    await page.reload()
    await inspector(page).waitFor()
    await page.waitForTimeout(1200)
    log(`inspect every card at its minimum size (${name} palette, Edit)`)
    const report = await page.evaluate(() => {
      const results = []
      for (const card of document.querySelectorAll('[data-widget-id]')) {
        const id = card.getAttribute('data-widget-id')
        const box = card.getBoundingClientRect()
        const problems = []
        if (card.scrollHeight - card.clientHeight > 1) problems.push(`card content is clipped by ${card.scrollHeight - card.clientHeight}px`)
        if (card.scrollWidth - card.clientWidth > 1) problems.push(`card content overflows sideways by ${card.scrollWidth - card.clientWidth}px`)
        for (const el of card.querySelectorAll('*')) {
          if (el.closest('.sr-only')) continue // visually hidden on purpose (screen-reader text)
          const s = getComputedStyle(el)
          if ((s.overflowY === 'hidden' || s.overflowY === 'clip') && el.scrollHeight - el.clientHeight > 1 && el.clientHeight > 0) {
            problems.push(`<${el.tagName.toLowerCase()} class="${String(el.className).slice(0, 50)}"> hides ${el.scrollHeight - el.clientHeight}px of content`)
          }
          const r = el.getBoundingClientRect()
          if (r.width > 0 && r.right > box.right + 1 && !el.closest('.fs-scroll, [class*="overflow-x"]')) problems.push(`<${el.tagName.toLowerCase()}> extends ${Math.round(r.right - box.right)}px past the card`)
        }
        const scrollers = [...card.querySelectorAll('*')].filter((el) => ['auto', 'scroll'].includes(getComputedStyle(el).overflowY) && el.scrollHeight - el.clientHeight > 1)
        results.push({ id, w: Math.round(box.width), h: Math.round(box.height), scrollers: scrollers.length, problems })
      }
      return results
    })
    for (const r of report) {
      console.log(`  ${name} ${r.id} ${r.w}x${r.h} scrollers=${r.scrollers}${r.problems.length ? ' PROBLEMS: ' + r.problems.join('; ') : ''}`)
      for (const p of r.problems) failures.push(`${name} ${r.id}: ${p}`)
    }
    const compact = await page.evaluate(() => [...document.querySelectorAll('[data-widget-id]')].filter((el) => el.getAttribute('data-compact') === 'true').map((el) => el.getAttribute('data-widget-id')).sort())
    assert.deepEqual(compact, ['w-welcome', 'w-welcome-long'], `${name}: only the 2-row cards use the compact chrome`)
    await page.screenshot({ path: `${out}ui025-min-sizes-${name}.png`, fullPage: true })
  }
  assert.deepEqual(failures, [], 'a widget silently clips content at its minimum size')
  console.log('OK: all six widgets, with long content, show or scroll everything at their minimum size')
} catch (error) {
  console.error(`FAILED at: ${step}`)
  await page.screenshot({ path: 'e2e-failure.png', fullPage: true }).catch(() => {})
  console.error(error)
  process.exitCode = 1
} finally {
  await browser.close()
}

async function putFixture(theme) {
  await page.evaluate(
    async ([themePatch, greeting, subtitle]) => {
      const me = await (await fetch('/api/auth/me')).json()
      const current = await (await fetch('/api/workspace')).json()
      const longText = (n, word) => Array.from({ length: n }, (_, i) => `${word} ${i + 1}`).join(' ')
      const task = (i) => ({ id: `t${i}`, text: `A fairly long task description number ${i} that needs wrapping to fit`, done: i % 2 === 0 })
      const w = (id, type, title, props) => ({ id, type, title, hidden: false, appearance: {}, props })
      const config = {
        ...current.config,
        theme: { ...current.config.theme, ...themePatch },
        navigation: { placement: 'top', primaryItems: [], secondaryItems: [] },
        sections: [{
          id: 's-min', kind: 'grid', title: 'Minimum sizes', hidden: false,
          widgets: [
            w('w-welcome', 'welcome', 'Welcome', { greeting: 'Welcome back', subtitle: 'Here is what is on your plate today.' }),
            w('w-welcome-long', 'welcome', 'Long welcome', { greeting, subtitle }),
            w('w-tasks', 'tasks', 'Tasks', { items: [1, 2, 3, 4, 5].map(task) }),
            w('w-notes', 'notes', 'Notes', { body: longText(120, 'note') }),
            w('w-gallery', 'gallery', 'Gallery', { items: ['aurora', 'workspace', 'mountain', 'studio'].map((k, i) => ({ id: `g${i}`, assetKey: k, alt: `Picture ${i}`, caption: `A caption that is long enough to wrap, picture ${i}` })) }),
            w('w-analytics', 'analytics', 'Analytics', { metrics: [1, 2, 3, 4].map((i) => ({ id: `m${i}`, label: `A metric label that is quite long ${i}`, value: i * 20 })) }),
            w('w-calendar', 'calendar', 'Calendar', { displayMonth: '2026-11', events: [1, 2, 3].map((i) => ({ id: `e${i}`, date: `2026-11-${10 + i}`, title: `An event with a long title ${i}` })) }),
          ],
          layout: [
            { i: 'w-welcome', x: 0, y: 0, w: 3, h: 2 }, { i: 'w-welcome-long', x: 9, y: 0, w: 3, h: 2 },
            { i: 'w-tasks', x: 3, y: 0, w: 3, h: 4 }, { i: 'w-notes', x: 6, y: 0, w: 3, h: 3 },
            { i: 'w-gallery', x: 0, y: 4, w: 4, h: 4 }, { i: 'w-analytics', x: 4, y: 4, w: 4, h: 3 }, { i: 'w-calendar', x: 8, y: 4, w: 4, h: 5 },
          ],
        }],
      }
      const res = await fetch('/api/workspace', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': me.csrfToken }, body: JSON.stringify({ baseRevision: current.revision, config }) })
      if (!res.ok) throw new Error(`PUT failed ${res.status} ${await res.text()}`)
    },
    [theme, LONG_GREETING, LONG_SUBTITLE],
  )
}
