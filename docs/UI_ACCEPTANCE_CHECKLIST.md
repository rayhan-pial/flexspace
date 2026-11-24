# UI redesign acceptance checklist

Status: **Pending — planning only.** Follow the [design spec](UI_DESIGN_SPEC.md), [redesign plan](UI_REDESIGN_PLAN.md), and [ordered tasks](UI_REDESIGN_TASKS.md). No redesign acceptance checks or application suites were executed to create this document.

[handoff.md](handoff.md) records the 2026-11-23 baseline: 264 backend tests, 754 frontend tests, and 15 browser scripts passed. These are historical results, not a current pass. Record commit, environment, command, result, and evidence for each completed gate; leave unrun checks Pending. The reference image is inspiration, not acceptance evidence.

## 1. Baseline and evidence

- [ ] **Pending / UI-001:** Capture current screens and record actual suite results before changing presentation. Use a scratch SQLite database and throwaway accounts A/B; preserve existing personal workspaces.
- [ ] **Pending / UI-001:** Capture normalized workspace JSON before redesign. Include all six widgets, grid/stack sections, hidden entries, unknown widget data, and both navigation groups.
- [ ] **Pending / every task:** Run focused checks for affected features; retain failure output and fix regressions before advancing. Record intentional selector updates, not weakened assertions.

## 2. Visual system and editor boundaries

- [ ] **Pending / UI-002–UI-003:** Consistent off-white application background, white surfaces, slate text, indigo accent, border/radius/shadow scale, typography, and Lucide icon sizing. Primary actions stand out; cards avoid unnecessary decoration and excessive borders.
- [ ] **Pending / UI-002:** Editor chrome uses independent `--ui-*` tokens; workspace and widget appearance use scoped `--fs-*` values. Change workspace colors to black, white, and deliberately poor combinations: toolbar, inspector, dialogs, app rail, and focus indicators remain readable and usable. Do not silently rewrite saved user colors.
- [ ] **Pending / UI-003:** Inputs, buttons, tabs, swatches, status badges, tooltips, validation, disabled, hover, selected, and focus states follow shared conventions. No unlabeled icon-only action or inert decorative control.
- [ ] **Pending / UI-005–UI-006:** Permanent editor navigation/account controls remain reachable when the user's navigation moves top/left/right, changes theme, or becomes empty. User navigation never becomes the app's only route to editing.
- [ ] **Pending / UI-007–UI-012:** Inspector, library, appearance, templates, and six widgets retain real data/actions. No unsupported radius/spacing/theme-mode persistence, fake analytics filters/deltas, uploads, profile fields, or password recovery implied by the reference.

## 3. Shell, Preview, and responsive behavior

| Pending gate | Required evidence |
| --- | --- |
| UI-005: wide desktop, ≥1440 px | 192 px app rail; 304 px inspector; canvas remains central and measured. Outline/library access does not create a fourth permanent column. |
| UI-005/UI-016: 1024–1439 px | 64 px rail; inspector 280 px at 1024–1279 and 304 px from 1280. Labels/tooltips remain accessible; panels scroll without covering canvas actions. |
| UI-006/UI-016: Preview | App rail, builder panels, selection rings, semantic/grid/resize handles disappear. Minimal account, return-to-Edit, and save-status controls remain outside the personalized canvas. Mode changes never save/discard. |
| UI-016: <1024 px | Responsive Preview; explain desktop editing requirement. Preserve actual Preview task-check/note draft interactions. Do not add a new mobile Save flow; dirty status explains returning to desktop. |
| UI-016: navigation adaptation | Preserve data/placement choice while using the documented compact presentation. Current adaptation is side navigation from 1400 px in Edit and 1024 px in Preview; any approved visual adjustment must not persist placement/layout changes. |

- [ ] **Pending / UI-016:** Screenshot all three templates at **1920, 1440, 1280, 1024, 768, and 390 px**, covering top/left/right navigation and Edit/Preview where available. Include selected widget, empty workspace, open inspector, and modal states.
- [ ] **Pending / UI-016–UI-017:** At 200% browser zoom, controls/text remain reachable without page-level horizontal overflow or obscured focus; responsive changes do not dirty JSON.
- [ ] **Pending / UI-016:** Correct stale README/handoff “read-only” wording during implementation handoff: actual narrow Preview allows task/note changes. Preserve that behavior rather than silently disabling it.

## 4. Cross-section sorting and grid behavior

All rows are **Pending / UI-013**, plus UI-014 for grid/outline. Exercise pointer drag, keyboard sorting, and Move controls; then Save/reload to verify order.

| Surface | Required success and rejection cases |
| --- | --- |
| Navbar/sidebar groups | Reorder in top/left/right placement; transfer primary↔secondary, including empty target. |
| Workspace sections | Reorder root sections with nested data intact; no section nesting. Hidden sections stay recoverable in outline. |
| Stack cards | Reorder; transfer known cards between stack sections, including empty target. Unknown cards stay within their section. |
| Tasks | Reorder and transfer between Tasks widgets, including empty destination; text/completion preserved exactly once. |
| Gallery | Reorder and transfer between Gallery widgets, including empty destination; asset/caption preserved exactly once. |
| Metrics and agenda | Reorder within own widget; reject cross-widget transfers. Calendar day cells retain chronological placement. |
| Grid outline | Reorder within own grid, including hidden widgets; repack valid geometry. Reject cross-grid/grid-to-stack transfers. |

- [ ] **Pending / UI-013:** Test Escape, outside drop, incompatible task↔gallery/nav drop, stale source, and full destination (100 items). Configuration, dirty state, and history remain unchanged on rejected/no-op operations. No duplicate IDs or lost items.
- [ ] **Pending / UI-013:** Drop indicators identify valid destinations; empty targets remain hittable; selected/focused/dragged states are distinct without color alone. Preserve one sorting provider, transient previews, announcements, container IDs, and dedicated handles.
- [ ] **Pending / UI-014:** Preserve 12 columns, 32 px rows, 16 px gaps, rectangle fields `i/x/y/w/h`, minimum sizes, bounds, overlap rejection, and hidden geometry. A completed grid gesture commits once; spatial movement synchronizes semantic order and outline reorder repacks geometry.
- [ ] **Pending / UI-014:** Opening panels, initial measurement, viewport resizing, or changing nav placement creates no unsaved change. Notes typing, task checks, gallery sorting, section sorting, and resize never trigger another drag engine.

## 5. Persistence, history, auth, and templates

- [ ] **Pending / UI-006:** Edit → Preview → Edit retains draft. Save snapshots preserve edits made during a delayed response; duplicate/mid-drag Save is blocked. Cancel confirms and restores the saved baseline.
- [ ] **Pending / UI-006:** Network/validation failures retain draft; ambiguous committed Save is reconciled; two tabs produce a visible 409 conflict with keep-editing/reload confirmation. Late owner/epoch responses never update another workspace.
- [ ] **Pending / UI-006/UI-015:** Expired session hides/freezes private content; same-account login restores safely, different-account login clears it. Logout/discard guards, cookie/CSRF requests, isolation, and generic credential errors remain intact.
- [ ] **Pending / UI-006:** Undo/Redo keeps 30 steps; one typing/color/drag transaction is one step; no network write. New edits clear redo; Cancel/load/account switch clear history; undoing saved work becomes dirty.
- [ ] **Pending / UI-010:** System templates apply/reset into draft only; Cancel restores baseline. Custom snapshots capture draft without saving workspace; remain private; apply remaps IDs/references; delete leaves workspace unchanged.
- [ ] **Pending / UI-018:** Save → logout → login reproduces JSON, content, theme, order, hidden state, and geometry. Unknown widget payloads survive unrelated edits. Unsupported schema opens no writable replacement. No schema/API/backend rewrite is required.

## 6. Accessibility and overlay behavior

- [ ] **Pending / UI-017:** Measure editor/default-theme text contrast: 4.5:1 normally, 3:1 for qualifying large text; verify visible control/focus contrast separately. Warn about poor custom workspace combinations without changing stored colors. See [W3C contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).
- [ ] **Pending / UI-004/UI-017:** Modal initial focus, contained Tab/Shift+Tab, Escape, inert background, accessible title, and focus return work, including destructive confirmation. Follow [W3C dialog guidance](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).
- [ ] **Pending / UI-014/UI-017:** Retain Arrow/Shift+Arrow grid move/resize. Add clickable inspector step controls using existing `nudgeWidget`; existing grid support is keyboard-only, not a pointer alternative. Retain semantic Move buttons. [W3C dragging guidance](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html) requires a no-drag pointer alternative separately from keyboard access.
- [ ] **Pending / UI-017:** Logical DOM/focus order matches visible layout; no hover-only essential action; reduced motion, labels/errors, keyboard navigation, and spoken sorting/save states work. Perform and record a real screen-reader pass; prior automated focus checks do not prove it.

## 7. Final execution and demo gate

Run existing commands; browser tests are standalone `.mjs` scripts using `playwright-core`, not a `npx playwright test` project. Use the [README](../README.md#real-browser-suite-15-scripts) scratch-database/server setup.

| Gate / UI-018 | Command or evidence | Status |
| --- | --- | --- |
| Backend | From `backend`: `.venv\Scripts\python -m pytest` | Pending |
| Frontend | From `frontend`: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` | Pending |
| Browser | From `frontend`: `npm run test:browser` — all 15 scripts | Pending |
| Visual/manual | Screenshot matrix, 200% zoom, screen reader, reference/design comparison | Pending |
| Demo | Auth → edit/style → all move families → Undo → Save/login → template/Cancel → second-user isolation → stale-tab conflict | Pending |

Preserve or deliberately update role/name and structural selectors: scripts use substring accessible-name matching and hooks such as `[data-section-id] > div > h2`. Adding “Save…” actions can create ambiguous matches; use specific names/exact matching without dropping behavior checks. Final ledger must record actual results and remaining limitations. Release requires all required checks passed and no unresolved data-loss, privacy, navigation, or drag regression.
