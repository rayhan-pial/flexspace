import {
  ASSET_KEYS, DEFAULT_DISPLAY_MONTH, DEFAULT_MIN_SIZE, DEFAULT_THEME, FONT_FAMILIES, GRID_COLUMNS,
  ICONS, MAX_BODY, MAX_LABEL, MAX_LIST_ITEMS, MAX_ROW_H, MAX_SECTIONS, MAX_TEXT, MAX_WIDGETS,
  MIN_SIZE, NAV_PLACEMENTS, SECTION_KINDS, UPLOAD_KEY,
} from './constants'
import { migrateConfig, WorkspaceConfigError } from './migrate'
import type {
  AssetKey, GridRect, NavItem, Navigation, ParseResult, Section, Theme, UploadKey, Widget, WorkspaceConfig,
} from './types'

type Obj = Record<string, unknown>

class Invalid extends Error {}
const fail = (path: string, message: string): never => {
  throw new Invalid(`${path}: ${message}`)
}

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
// Lengths count Unicode code points (like Python), not UTF-16 units.
const length = (s: string) => Array.from(s).length

function record(v: unknown, path: string, keys: readonly string[]): Obj {
  if (!isObj(v)) return fail(path, 'must be an object')
  for (const k of Object.keys(v)) if (!keys.includes(k)) fail(`${path}.${k}`, 'unknown property')
  return v
}
const get = (o: Obj, key: string): unknown => (Object.hasOwn(o, key) ? o[key] : undefined)

function str(v: unknown, path: string, max: number): string {
  if (typeof v !== 'string') return fail(path, 'must be a string')
  if (length(v) > max) fail(path, `longer than ${max} characters`)
  return v
}
const optStr = (o: Obj, key: string, path: string, max: number, def: string) =>
  get(o, key) === undefined ? def : str(o[key], `${path}.${key}`, max)

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/
const COLOR_RE = /^#[0-9a-fA-F]{6}$/
function id(v: unknown, path: string): string {
  if (typeof v !== 'string' || !ID_RE.test(v)) return fail(path, 'must be 1-64 characters of A-Z a-z 0-9 _ -')
  return v
}
function color(v: unknown, path: string): string {
  if (typeof v !== 'string' || !COLOR_RE.test(v)) return fail(path, 'must be a #rrggbb colour')
  return v
}
function int(v: unknown, path: string, min: number, max = Infinity): number {
  if (typeof v !== 'number' || !Number.isInteger(v)) return fail(path, 'must be an integer')
  if (v < min || v > max) fail(path, `must be between ${min} and ${max}`)
  return v
}
function bool(o: Obj, key: string, path: string, def: boolean): boolean {
  const v = get(o, key)
  if (v === undefined) return def
  if (typeof v !== 'boolean') return fail(`${path}.${key}`, 'must be a boolean')
  return v
}
/** A bundled picture key, or an uploaded one (`upload:<lowercase uuid>`), kept exactly as written. */
function galleryKey(v: unknown, path: string): AssetKey | UploadKey {
  if (typeof v === 'string' && UPLOAD_KEY.test(v)) return v as UploadKey
  return oneOf(v, path, ASSET_KEYS)
}

function oneOf<T extends string>(v: unknown, path: string, allowed: readonly T[]): T {
  if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) {
    return fail(path, `must be one of ${allowed.join(', ')}`)
  }
  return v as T
}
function list<T>(o: Obj, key: string, path: string, each: (item: unknown, path: string) => T): T[] {
  const v = get(o, key)
  if (v === undefined) return []
  if (!Array.isArray(v)) return fail(`${path}.${key}`, 'must be an array')
  if (v.length > MAX_LIST_ITEMS) fail(`${path}.${key}`, `more than ${MAX_LIST_ITEMS} entries`)
  return v.map((item, n) => each(item, `${path}.${key}[${n}]`))
}

function isoMonth(v: unknown, path: string): string {
  if (typeof v !== 'string' || !/^(19|20|21)[0-9]{2}-[0-9]{2}$/.test(v)) return fail(path, 'must be YYYY-MM')
  const month = Number(v.slice(5))
  if (month < 1 || month > 12) fail(path, 'month must be 01-12')
  return v
}
function isoDate(v: unknown, path: string): string {
  if (typeof v !== 'string' || !/^(19|20|21)[0-9]{2}-[0-9]{2}-[0-9]{2}$/.test(v)) return fail(path, 'must be YYYY-MM-DD')
  const [y, m, d] = v.split('-').map(Number)
  const real = new Date(Date.UTC(y, m - 1, d))
  if (real.getUTCFullYear() !== y || real.getUTCMonth() !== m - 1 || real.getUTCDate() !== d) {
    fail(path, 'not a real calendar date')
  }
  return v
}

// ---- widget props (known types) --------------------------------------------

type PropsParser = (v: unknown, path: string) => Obj
const withId = (path: string, o: Obj) => id(get(o, 'id'), `${path}.id`)
const required = (o: Obj, key: string, path: string) => {
  if (get(o, key) === undefined) fail(`${path}.${key}`, 'is required')
  return o[key]
}

const PROPS: Record<string, PropsParser> = {
  welcome(v, path) {
    const o = record(v, path, ['greeting', 'subtitle'])
    return { greeting: optStr(o, 'greeting', path, MAX_TEXT, ''), subtitle: optStr(o, 'subtitle', path, MAX_TEXT, '') }
  },
  tasks(v, path) {
    const o = record(v, path, ['items'])
    return {
      items: list(o, 'items', path, (item, p) => {
        const t = record(item, p, ['id', 'text', 'done'])
        return { id: withId(p, t), text: str(required(t, 'text', p), `${p}.text`, MAX_TEXT), done: bool(t, 'done', p, false) }
      }),
    }
  },
  notes(v, path) {
    const o = record(v, path, ['body'])
    return { body: optStr(o, 'body', path, MAX_BODY, '') }
  },
  gallery(v, path) {
    const o = record(v, path, ['items'])
    return {
      items: list(o, 'items', path, (item, p) => {
        const g = record(item, p, ['id', 'assetKey', 'alt', 'caption'])
        return {
          id: withId(p, g),
          assetKey: galleryKey(get(g, 'assetKey'), `${p}.assetKey`),
          alt: optStr(g, 'alt', p, MAX_TEXT, ''),
          caption: optStr(g, 'caption', p, MAX_TEXT, ''),
        }
      }),
    }
  },
  analytics(v, path) {
    const o = record(v, path, ['metrics'])
    return {
      metrics: list(o, 'metrics', path, (item, p) => {
        const m = record(item, p, ['id', 'label', 'value'])
        const value = get(m, 'value')
        if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${p}.value`, 'must be a finite number')
        return { id: withId(p, m), label: str(required(m, 'label', p), `${p}.label`, MAX_LABEL), value }
      }),
    }
  },
  calendar(v, path) {
    const o = record(v, path, ['displayMonth', 'events'])
    const month = get(o, 'displayMonth')
    return {
      displayMonth: month === undefined ? DEFAULT_DISPLAY_MONTH : isoMonth(month, `${path}.displayMonth`),
      events: list(o, 'events', path, (item, p) => {
        const e = record(item, p, ['id', 'date', 'title'])
        return {
          id: withId(p, e),
          date: isoDate(get(e, 'date'), `${p}.date`),
          title: str(required(e, 'title', p), `${p}.title`, MAX_LABEL),
        }
      }),
    }
  },
}
export type KnownPropsResult = { ok: true; props: Record<string, unknown> } | { ok: false; message: string }

/** Runtime parser for a known widget type's props (used by the registry). Unknown types fail. */
export function parseKnownProps(type: string, raw: unknown): KnownPropsResult {
  if (!Object.hasOwn(PROPS, type)) return { ok: false, message: `${type} is not a known widget type` }
  try {
    return { ok: true, props: PROPS[type](raw, 'props') }
  } catch (error) {
    if (error instanceof Invalid) return { ok: false, message: error.message }
    throw error
  }
}

// Props key holding each type's repeatable entries (all carry globally unique ids).
const ITEM_LISTS: Record<string, string> = { tasks: 'items', gallery: 'items', analytics: 'metrics', calendar: 'events' }

// ---- structure ---------------------------------------------------------------

interface Ctx { ids: Set<string>; widgetCount: number }
function claim(ctx: Ctx, entityId: string, path: string) {
  if (ctx.ids.has(entityId)) fail(path, `duplicate id ${entityId}`)
  ctx.ids.add(entityId)
}

function parseAppearance(v: unknown, path: string): Obj {
  const a = record(v, path, ['background', 'text', 'fontSizePx'])
  const out: Obj = {}
  if (get(a, 'background') !== undefined) out.background = color(a.background, `${path}.background`)
  if (get(a, 'text') !== undefined) out.text = color(a.text, `${path}.text`)
  if (get(a, 'fontSizePx') !== undefined) out.fontSizePx = int(a.fontSizePx, `${path}.fontSizePx`, 12, 24)
  return out
}

function parseWidget(v: unknown, path: string, ctx: Ctx): Widget {
  const w = record(v, path, ['id', 'type', 'title', 'hidden', 'appearance', 'props'])
  const widgetId = id(get(w, 'id'), `${path}.id`)
  const type = str(get(w, 'type'), `${path}.type`, 64)
  if (type.length === 0) fail(`${path}.type`, 'must not be empty')
  ctx.widgetCount += 1
  claim(ctx, widgetId, `${path}.id`)

  const known = Object.hasOwn(PROPS, type)
  const rawProps = get(w, 'props') === undefined ? {} : w.props
  const rawAppearance = get(w, 'appearance') === undefined ? {} : w.appearance
  let props: Obj
  let appearance: Obj
  if (known) {
    // Known types are always validated; they never fall through to the opaque branch.
    props = PROPS[type](rawProps, `${path}.props`)
    appearance = parseAppearance(rawAppearance, `${path}.appearance`)
    const key = ITEM_LISTS[type]
    if (key) for (const entry of props[key] as Obj[]) claim(ctx, entry.id as string, `${path}.props.${key}`)
  } else {
    if (!isObj(rawProps)) fail(`${path}.props`, 'must be an object')
    if (!isObj(rawAppearance)) fail(`${path}.appearance`, 'must be an object')
    props = structuredClone(rawProps as Obj)
    appearance = structuredClone(rawAppearance as Obj)
  }
  return {
    id: widgetId, type, title: optStr(w, 'title', path, MAX_LABEL, ''),
    hidden: bool(w, 'hidden', path, false), appearance, props,
  }
}

function overlap(a: GridRect, b: GridRect) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

function parseRect(v: unknown, path: string): GridRect {
  const r = record(v, path, ['i', 'x', 'y', 'w', 'h'])
  const rect = {
    i: id(get(r, 'i'), `${path}.i`),
    x: int(get(r, 'x'), `${path}.x`, 0),
    y: int(get(r, 'y'), `${path}.y`, 0),
    w: int(get(r, 'w'), `${path}.w`, 1, GRID_COLUMNS),
    h: int(get(r, 'h'), `${path}.h`, 2, MAX_ROW_H),
  }
  if (rect.x + rect.w > GRID_COLUMNS) fail(path, 'x + w exceeds 12 columns')
  return rect
}

function parseSection(v: unknown, path: string, ctx: Ctx): Section {
  const s = record(v, path, ['id', 'kind', 'title', 'hidden', 'widgets', 'layout'])
  if (s.layout === null) delete s.layout // null means "absent", as on the backend
  const sectionId = id(get(s, 'id'), `${path}.id`)
  const kind = oneOf(get(s, 'kind'), `${path}.kind`, SECTION_KINDS)
  claim(ctx, sectionId, `${path}.id`)
  const widgets = list(s, 'widgets', path, (w, p) => parseWidget(w, p, ctx))
  const base = {
    id: sectionId, kind, title: optStr(s, 'title', path, MAX_LABEL, ''),
    hidden: bool(s, 'hidden', path, false), widgets,
  }
  if (kind === 'stack') {
    if (get(s, 'layout') !== undefined) fail(`${path}.layout`, 'stack sections have no layout')
    return base
  }
  const layout = list(s, 'layout', path, parseRect)
  const rects = new Map<string, GridRect>()
  for (const rect of layout) {
    if (rects.has(rect.i)) fail(`${path}.layout`, `duplicate rectangle for ${rect.i}`)
    rects.set(rect.i, rect)
  }
  const byId = new Map(widgets.map((w) => [w.id, w]))
  if (rects.size !== byId.size || [...byId.keys()].some((k) => !rects.has(k))) {
    fail(path, 'grid widgets and layout rectangles must match one to one')
  }
  for (const [wid, rect] of rects) {
    const type = byId.get(wid)!.type
    const [minW, minH] = Object.hasOwn(MIN_SIZE, type) ? MIN_SIZE[type] : DEFAULT_MIN_SIZE // own keys only: "constructor" is just an unknown type
    if (rect.w < minW || rect.h < minH) fail(path, `${wid} is smaller than the ${type} minimum`)
  }
  const visible = widgets.filter((w) => !w.hidden).map((w) => rects.get(w.id)!)
  visible.forEach((a, n) => {
    if (visible.slice(n + 1).some((b) => overlap(a, b))) fail(path, `visible widget ${a.i} overlaps another`)
  })
  return { ...base, layout }
}

function parseTheme(v: unknown, path: string): Theme {
  const t = record(v === undefined ? {} : v, path, ['primary', 'background', 'surface', 'text', 'fontFamily', 'fontSizePx'])
  const c = (key: 'primary' | 'background' | 'surface' | 'text') =>
    get(t, key) === undefined ? DEFAULT_THEME[key] : color(t[key], `${path}.${key}`)
  return {
    primary: c('primary'), background: c('background'), surface: c('surface'), text: c('text'),
    fontFamily: get(t, 'fontFamily') === undefined ? DEFAULT_THEME.fontFamily : oneOf(t.fontFamily, `${path}.fontFamily`, FONT_FAMILIES),
    fontSizePx: get(t, 'fontSizePx') === undefined ? DEFAULT_THEME.fontSizePx : int(t.fontSizePx, `${path}.fontSizePx`, 12, 20),
  }
}

function parseNavItem(v: unknown, path: string, ctx: Ctx): NavItem {
  const n = record(v, path, ['id', 'label', 'targetSectionId', 'icon'])
  const navId = id(get(n, 'id'), `${path}.id`)
  claim(ctx, navId, `${path}.id`)
  const target = get(n, 'targetSectionId')
  return {
    id: navId,
    label: str(required(n, 'label', path), `${path}.label`, MAX_LABEL),
    targetSectionId: target === undefined || target === null ? null : id(target, `${path}.targetSectionId`),
    icon: get(n, 'icon') === undefined ? 'home' : oneOf(n.icon, `${path}.icon`, ICONS),
  }
}

function parseNavigation(v: unknown, path: string, ctx: Ctx): Navigation {
  const n = record(v === undefined ? {} : v, path, ['placement', 'primaryItems', 'secondaryItems'])
  return {
    placement: get(n, 'placement') === undefined ? 'left' : oneOf(n.placement, `${path}.placement`, NAV_PLACEMENTS),
    primaryItems: list(n, 'primaryItems', path, (i, p) => parseNavItem(i, p, ctx)),
    secondaryItems: list(n, 'secondaryItems', path, (i, p) => parseNavItem(i, p, ctx)),
  }
}

/** Validates a *current-version* document and fills documented defaults. Throws `Invalid`-wrapped errors. */
function validateCurrent(doc: Obj): WorkspaceConfig {
  const root = record(doc, '$', ['schemaVersion', 'title', 'theme', 'navigation', 'sections'])
  const ctx: Ctx = { ids: new Set(), widgetCount: 0 }
  const title = str(required(root, 'title', '$'), '$.title', MAX_LABEL)
  const theme = parseTheme(get(root, 'theme'), '$.theme')
  const navigation = parseNavigation(get(root, 'navigation'), '$.navigation', ctx)
  const sections = list(root, 'sections', '$', (s, p) => parseSection(s, p, ctx))
  if (sections.length > MAX_SECTIONS) fail('$.sections', `more than ${MAX_SECTIONS} sections`)
  if (ctx.widgetCount > MAX_WIDGETS) fail('$', `more than ${MAX_WIDGETS} widgets`)
  const sectionIds = new Set(sections.map((s) => s.id))
  for (const item of [...navigation.primaryItems, ...navigation.secondaryItems]) {
    if (item.targetSectionId !== null && !sectionIds.has(item.targetSectionId)) {
      fail('$.navigation', `target ${item.targetSectionId} does not exist`)
    }
  }
  return { schemaVersion: 1, title, theme, navigation, sections }
}

/**
 * Migrates, validates and normalizes untrusted JSON into a WorkspaceConfig.
 * Never mutates its input and never silently resets invalid data.
 */
export function parseWorkspaceConfig(raw: unknown): ParseResult {
  try {
    return { ok: true, config: validateCurrent(migrateConfig(raw)) }
  } catch (error) {
    if (error instanceof WorkspaceConfigError) return { ok: false, code: error.code, message: error.message }
    if (error instanceof Invalid) return { ok: false, code: 'invalid_config', message: error.message }
    throw error
  }
}
