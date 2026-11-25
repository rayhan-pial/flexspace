# UI redesign verification log

## UI-001 — Baseline capture (2026-11-25)

### Environment
- OS: Windows 11 Pro 10.0.26300
- Node: 24.x, Python 3.12.8
- Browser: Microsoft Edge via Playwright MCP
- Database: scratch SQLite (scratchpad/ui-baseline.db)
- Test account: baseline-a@test.local

### Baseline check results

| Check | Command | Result |
| --- | --- | --- |
| TypeScript | `npm run typecheck` | clean |
| Lint | `npm run lint` | clean |
| Frontend tests | `npm test` | 754 passed in 51 files |
| Backend tests | `pytest -q` | 264 passed, 1 warning |
| Production build | `npm run build` | built (chunk-size advisory, known) |
| Browser suite | `npm run test:browser` | 15 of 15 scripts print OK |

### Console errors
- 2× `401 /api/auth/me` before login — expected behavior, not a bug.

### Screenshots captured

| File | Description |
| --- | --- |
| `artifacts/ui-review/before/01-login-page-1440.png` | Login page at 1440 px |
| `artifacts/ui-review/before/02-register-page-1440.png` | Registration page at 1440 px |
| `artifacts/ui-review/before/03-workspace-edit-1440.png` | Edit mode, full workspace, left sidebar nav |
| `artifacts/ui-review/before/04-workspace-preview-1440.png` | Preview mode at 1440 px |
| `artifacts/ui-review/before/05-theme-panel-1440.png` | Theme panel open |
| `artifacts/ui-review/before/06-templates-panel-1440.png` | Templates panel open |
| `artifacts/ui-review/before/07-library-panel-1440.png` | Library (component list) panel |
| `artifacts/ui-review/before/08-properties-welcome-1440.png` | Welcome selected in outline, Templates tab still active |
| `artifacts/ui-review/before/09-properties-welcome-selected-1440.png` | Properties panel showing Welcome widget fields |
| `artifacts/ui-review/before/10-workspace-edit-1024.png` | Edit mode at 1024 px |
| `artifacts/ui-review/before/11-workspace-768.png` | Responsive preview at 768 px |
| `artifacts/ui-review/before/12-workspace-390.png` | Mobile view at 390 px |
| `artifacts/ui-review/before/13-nav-top-1440.png` | Top navigation placement at 1440 px |
| `artifacts/ui-review/before/14-nav-right-1440.png` | Right sidebar navigation at 1440 px |
| `artifacts/ui-review/before/baseline-workspace.json` | Full workspace config JSON (Productivity template) |

### Visual observations (current state vs design reference)

1. **Login/Register:** Functional but plain. Centered card, no brand presence, no backdrop treatment. Compare reference: indigo backdrop, FlexSpace branding, polished form.
2. **Editor shell:** Flat header with brand left, email/logout right. Toolbar on second row. No app navigation rail. Three-column layout (outline+library | canvas | properties+theme+templates) with simple tabs.
3. **Canvas:** Widgets render with minimal card styling — thin rounded borders, light shadows. No strong visual hierarchy or accent treatment on the Welcome widget.
4. **Outline panel:** Plain text tree with drag grips. No section icons or visual weight.
5. **Library panel:** Six text buttons only (Welcome, Tasks, Notes, Gallery, Analytics, Calendar). No descriptions, icons, categories, or search.
6. **Properties panel:** Functional fields (title, greeting, subtitle, appearance colors, font size). Layout is a simple vertical list. No grouping (Content/Appearance/Layout/Visibility).
7. **Theme panel:** Color hex inputs with picker buttons, font family select, font size input. Plain vertical layout. No swatches, no contrast feedback.
8. **Templates panel:** Radio buttons for three system templates with text descriptions. Custom template name input + save button below. Plain, no gallery cards or previews.
9. **Toolbar:** Undo, Redo, Preview, Cancel, Save — all same-weight buttons except Save (indigo filled). No status badge styling, no visual hierarchy.
10. **Responsive:** At 768/390 px, falls to preview with an explanation banner. Layout stacks correctly. No horizontal overflow. Mobile task/note interactions preserved.
11. **Navigation placements:** Top, left, right all work. Left sidebar shows icons + labels. No app rail separate from workspace nav.
12. **Drag handles:** Small grip dots. Functional but visually subtle.
13. **Typography:** System sans-serif. Adequate but not polished — section headings could be more distinct, widget headers need better rhythm.
14. **Spacing:** Reasonable but inconsistent padding between panels and canvas areas.

### Existing behavior to preserve
- Authentication flow with validation, pending state, frozen-draft warning
- Per-user workspace persistence with revision tracking
- JSON-driven widget rendering via registry
- React Grid Layout with 12 columns, 32 px rows, 16 px gaps
- dnd-kit sorting with keyboard, pointer, and Move buttons
- Zustand store: saved/draft, dirty detection, history (30 steps)
- Save/Cancel/conflict/session-expiry flows
- Template apply/snapshot/delete with ownership
- Schema v1 compatibility and unknown widget preservation
- Responsive effective mode at 1024 px breakpoint
- Side navigation adaptation at 1400 px (Edit) and 1024 px (Preview)

## Phase 1 — Tokens, controls, dialog shell (UI-002 to UI-004, 2026-11-25)

### Results

| Check | Result |
| --- | --- |
| `npm run typecheck` / `npm run lint` | clean (two lint warnings from the first draft were fixed) |
| `npm test` | 765 passed in 54 files (754 before, plus 11 new) |
| `npm run build` | built; CSS 33.37 to 36.04 kB, JS 566.63 to 568.00 kB; same chunk-size advisory |
| `npm run test:browser` | 15 of 15 scripts OK against the changed UI (grid drag and resize, all sorting families, templates, Save and reload, undo, accessibility focus audit over 276 controls, two-account acceptance) |
| Backend | not run: no backend change |

### Browser checks performed (Playwright MCP, Edge, 1440 px, scratch DB, account phase1-a)

- Workspace theme set to primary black, page, card and text all white (white on white). Computed styles: header background `rgb(255,255,255)`, header text `rgb(15,23,42)`, Save `rgb(79,70,229)`, selected tab `rgb(55,48,163)`, body `rgb(248,250,252)`, no `--fs-text` on `html` or `body`; the canvas became `rgb(255,255,255)` on `rgb(255,255,255)`.
- Cancel opened the confirmation: `#root` inert, dialog not inside an inert node, body scroll locked, dialog portalled to `body`, focus on "Keep editing". Two Tabs returned to "Keep editing". Escape closed it, restored `#root`, scroll and focus (on Cancel) and left the draft "Unsaved changes". Cancel then Discard restored the saved theme and "All changes saved".
- Console errors: only the 401 on `/api/auth/me` before login, as in the baseline. No new errors.

### Screenshots (`artifacts/ui-review/after/`)

`p1-01-workspace-edit-1440.png`, `p1-02-theme-white-on-white-1440.png`, `p1-03-confirm-dialog-1440.png`, `p1-04-preview-1440.png`.

### Contrast measured (WCAG ratios of the tokens)

text on bg 17.06, text on surface 17.85, muted on surface 4.76, muted on bg 4.55, **muted on subtle 4.34 (below 4.5)**, white on primary 6.29, white on danger 6.47, selected text on selected 8.88, success/warning/danger on their tints 6.81/6.84/5.91, control border on surface 3.46, focus indigo on surface 6.29. The one failing pair is not used anywhere yet; do not put secondary text on `--ui-surface-subtle` (or darken `--ui-text-secondary`) when that surface is adopted.

### Not verified in this phase

- Coarse-pointer 44 px targets (class added, not exercised on a touch device).
- Screen reader behaviour of the dialog (automated and keyboard checks only).
- Presentation-only actions were not compared by diffing serialized JSON; "not dirty" is covered by the existing `grid-gesture.mjs` assertions and by Escape leaving the draft state unchanged.
- Only the toolbar, header, confirmation dialog, tabs and field styles changed visibly; the panels, library, templates and auth screens are unchanged by design until their own tasks.

## Phase 2 — Editor shell, toolbar, inspector (UI-005 to UI-007, 2026-11-25)

### Results

| Check | Result |
| --- | --- |
| `npm run typecheck` / `npm run lint` | clean (two unused-variable warnings in `e2e/` were removed) |
| `npm test` | 773 passed in 54 files (765 before; 86 tests were migrated from tab navigation to the rail, 8 new) |
| `npm run build` | built; CSS 36.04 to 38.19 kB, JS 568.00 to 572.35 kB; same chunk-size advisory |
| `npm run test:browser` | 15 of 15 scripts OK, run by me after the migration |
| Backend | not run: no backend change |

### Test migration

The two tabbed panels no longer exist, so tests and browser scripts now reach views through the rail (`src/test/shell.ts`, `e2e/shell.mjs`): Properties is My workspace, Theme is Appearance, Library is Components. Assertions were kept; only how a view is reached changed. New tests cover the rail and `aria-current`, absence of rail and inspector in Preview and below 1024 px, the skip link, view changes leaving draft, history and server untouched, canvas vs outline selection, the toolbar heading and title field, the empty state, and the property groups. Three of them were mutation-checked (wrong view for "Open outline", canvas-selection check removed, a group renamed); each failed the matching test and the source was restored. `responsive.mjs` now asserts rail widths 64/64/192 px and inspector widths 280/304/304 px at 1024/1280/1440, and `accessibility.mjs` audits all five rail destinations (265 control checks).

### Browser checks performed (Playwright MCP, Edge, scratch DB, account phase2-a)

- 1440 px: rail 192 px with labels, inspector 304 px, no horizontal overflow. 1280 px: rail 64 px. 1024 px: rail 64 px, inspector 280 px, widgets end at 665 px while the inspector starts at 705 px.
- Clicking a widget title on the canvas opened Properties (Content, Appearance, Layout, Visibility, Actions). In Outline view, selecting Tasks selected its card and kept the Outline view; clicking a canvas widget afterwards switched to Properties.
- Preview: no rail, inspector or handles; account header plus a strip with the heading, status and Edit workspace. 390 px: account header, heading, status, the desktop-only note and the stacked canvas.
- Rename to "Phase 2 workspace", Save, reload: heading, "Saved revision 2" and "All changes saved" persisted.
- Console errors after login: none.

### Observation worth knowing

Right after a viewport resize the grid still shows its previous width for a moment, because React Grid Layout re-measures asynchronously. A screenshot taken immediately showed widgets sliding under the inspector at 1024 px; after about a second they fit (checked by measurement). A fresh load at 1024 px was correct. This is the same measurement behaviour as before the redesign, so scripts wait about a second after resizing.

### Screenshots (`artifacts/ui-review/after/`)

`p2-01-edit-1440.png`, `p2-02-properties-welcome-1440.png`, `p2-03-outline-view-1440.png`, `p2-04-edit-1280.png`, `p2-05-edit-1024.png`, `p2-05b-edit-1024-fresh.png`, `p2-06-preview-1440.png`, `p2-07-templates-view-1440.png`, `p2-08-mobile-390.png`.

### Not verified or not built in this phase

- The inspector cannot be closed to widen the canvas at 1024 to 1279 px (spec allows it; not built).
- Logout-discard confirmation was not re-exercised in the browser (unit tests only).
- Saving, error and conflict banners were restyled but not screenshotted.
- Dragging in the browser was verified only through the existing scripts (grid move and resize, all sorting families, outline), not by hand through the MCP browser.
- README line on Edit mode was updated; `docs/handoff.md` still describes the old panels and is left as a dated record.

## Phase 3 — Discovery and workspace styling (UI-008 to UI-010, 2026-11-25)

### Results

- `npm run typecheck` clean. `npm run lint` clean. `npm test` 787 passed in 55 files (773 before; 14 new in `ComponentsAppearanceGallery.test.tsx`, two existing `Templates.test.tsx` tests adapted, see below). `npm run build` OK (CSS 39.70 kB, JS 584.05 kB, same chunk-size advisory). `npm run test:browser` 16 of 16 OK, including the new `e2e/components-appearance-gallery.mjs`. Backend untouched (last run: Phase 0, 264 passed).
- Mutation checks (each reverted afterwards): removing `disabled` on Add at the widget limit, applying only one palette color, and ignoring the loaded config when choosing a template each made a new test fail.

### Test changes worth knowing

- `Templates.test.tsx` "previews a design without applying it" now expects each ready-made design to be fetched once (for its thumbnail) and choosing one not to fetch again; "reports a template that cannot be loaded" now makes the failure exist before the panel opens (the thumbnail fetch would otherwise have already cached the design).
- `e2e/templates.mjs` reads the template name from the radio's sibling instead of the label's first nested span (the label now holds a thumbnail first).

### Browser checks performed (Playwright MCP, Edge, scratch DB, account phase3)

- Baseline screenshots of Components, Appearance and Templates before any change (`before/phase3-*.png`).
- Components: search narrows to one item without dirtying; each of the six types added with one click (11 to 17 widgets), selected, "Edit properties" opens Properties on the last one; Save then reload keeps 17; the confirmation is scrolled into view when the list is scrolled down.
- Appearance: Midnight palette sets only the four colors; white-on-white workspace colors leave the rail, inspector and toolbar readable (screenshot) and show the contrast advice; an invalid `#12` is refused and the previous color kept; four Undos return to the original; Forest saved and kept after reload; Sunset then Cancel returns to Forest.
- Templates: panel opened/closed three times with no stale state; three thumbnails (left sidebar indigo, top bar blue, right sidebar pink) are visibly distinct; previewing and snapshotting leave "All changes saved"; applying Creative goes to "Unsaved changes" and Cancel restores the saved colors; a custom template loads on selection and gets a thumbnail; delete confirmation focuses "Keep template", Escape closes it and focus returns to the Delete button; delete removes it.
- 1024px: Components, Appearance and Templates have no horizontal overflow (inspector 265px content width, page not wider than the window); palette list drops to one column below 1280px so names are not truncated.
- Console: no errors or warnings during the above.

### Screenshots (`artifacts/ui-review/after/`)

`phase3-components.png`, `phase3-components-added.png`, `phase3-appearance.png`, `phase3-appearance-midnight.png`, `phase3-appearance-extreme-low-contrast.png`, `phase3-appearance-1024.png`, `phase3-components-1024.png`, `phase3-templates.png`, `phase3-templates-gallery-crop.png`, `phase3-templates-applied.png`, `phase3-templates-after-delete.png`, `phase3-templates-1024.png`.

### Not verified or not built in this phase

- The template gallery lives in the inspector, not a dialog, so there is no gallery-dialog focus trap to test (the delete/replace confirmations were tested).
- The three ready-made configs are refetched each time the Templates view opens (twice in dev because of React StrictMode); no cross-open cache.
- Thumbnails approximate layout and colors; they are not pixel renders and carry no text.
- Palettes and contrast thresholds are suggestions, not validated by a user study. Primary on cards uses the 3:1 non-text threshold; The Midnight palette was applied in the browser and its theme values read back, but its screenshot was not inspected by eye.
- Screen reader and coarse-pointer behavior of the new controls were not tested. The palette buttons and category chips use the same 44px coarse-pointer rule as other controls, unverified on a touch device.
- Late-response races for thumbnails are covered by the existing alive/request guards and unit tests, not by an artificial slow-network browser run.
