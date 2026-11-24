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
