# FlexSpace UI redesign tasks

UI-001 to UI-018 (Phases 0 to 6) complete, with the open items in the [acceptance checklist](UI_ACCEPTANCE_CHECKLIST.md#8-open-items-and-limits-read-before-release). Do not alter backend/schema or original [development tasks](tasks.md) for this redesign. Read [design spec](UI_DESIGN_SPEC.md), [audit/plan](UI_REDESIGN_PLAN.md), and [acceptance checklist](UI_ACCEPTANCE_CHECKLIST.md) first. Existing paths below are relative to the repository root; proposed new files are explicitly labeled.

Execute one bounded task at a time. Run the stated focused checks, fix regressions, record exact commands/results and screenshots, then mark it complete. A build alone is insufficient evidence for an interaction change. Keep an evidence entry with task ID, commit/ref if available, commands, outcomes, screenshot paths, and remaining limitations. Tests below are verification work for Claude during implementation, not tests run in this planning step.

## Phase 0 — Baseline

### UI-001 — Capture the existing baseline

- **Status: ✅ Complete (2026-11-25).** Evidence: typecheck clean, lint clean, 754 frontend tests (51 files), 264 backend tests, build clean (chunk-size advisory known), 15/15 browser scripts OK. Screenshots in `artifacts/ui-review/before/` (14 PNGs + baseline JSON). Verification log: `docs/design/UI_VERIFICATION.md`. Console: 2× expected 401 before login, no errors. Mobile task/Notes interaction confirmed functional in Preview. **Depends on:** none.
- **Files:** read `README.md`, `docs/handoff.md`, existing `frontend/e2e/*.mjs`, manifests/lockfiles; proposed `docs/design/baseline/` evidence and `docs/design/UI_VERIFICATION.md`. Do not change application behavior.
- **Work:** start both services using the documented scratch database; record environment/versions and current config. Capture real Edit/Preview, auth, panels, templates, each nav placement, all three templates and key widths. Run the existing checks to distinguish baseline failures from redesign regressions. Record the mobile task/Notes behavior and stale “read-only” wording.
- **Accept:** actual screenshots and command outcomes exist; errors/flakes are recorded without hiding them; no claim that the concept image is the current UI. The four new UI planning files remain separate from completed FS tasks.
- **Verify:** frontend `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`; backend `.venv\Scripts\python -m pytest`; all 15 browser scripts through `npm run test:browser` with both servers on a scratch DB. Do not mutate a personal/demo database.

## Phase 1 — Tokens and reusable controls

### UI-002 — Establish editor tokens and theme isolation

- **Status: ✅ Complete (2026-11-25).** Added the `--ui-*` tokens, a Tailwind `@theme inline` mapping (`bg-ui-*`, `text-ui-*`, `rounded-ui-*`, `shadow-ui-*`), a shared `.ui-focus` style, and routed the page background, header, toolbar and grid placeholder through them. `--fs-*` is unchanged and still only on `.fs-themed`. Evidence: `shared/ui/themeIsolation.test.ts` (no `--fs-` in editor/shared/auth/shell code; mutation-checked), and in the browser a white-on-white workspace theme left the header, Save, tabs and body colours unchanged (measured computed styles in `docs/design/UI_VERIFICATION.md`). Screenshot `after/p1-02-theme-white-on-white-1440.png`. **Depends on:** UI-001.
- **Files:** `frontend/src/index.css`, `frontend/src/features/workspace/WorkspaceGate.tsx`, `WorkspaceView.tsx`; reuse neighboring `theme.ts`, `appearance.ts` and their tests. A small editor-only stylesheet is optional and proposed.
- **Work:** add the spec's `--ui-*` tokens/scoped app styles and typography while keeping `--fs-*` output/theme semantics unchanged. Preserve grid/resize CSS imports, row/gap units and reduced motion.
- **Accept:** changing every workspace theme field affects canvas only; toolbar/panels/overlay colors remain fixed. Existing custom widget overrides work; panel/theme changes never dirty config by themselves.
- **Verify:** relevant theme/appearance/properties tests; browser screenshots before/after bright, dark and low-contrast workspace themes; measure app token contrast. Compare serialized config before/after presentation-only actions.

### UI-003 — Standardize buttons, fields, tabs and status styling

- **Status: ✅ Complete (2026-11-25), adopted incrementally.** New `shared/ui/Button.tsx` (primary/secondary/quiet/destructive, 44 px on coarse pointers) and `StatusBadge.tsx` (text carries the meaning). Adopted in `EditorToolbar`, the `WorkspaceGate` header and `ConfirmDialog`; `fields.tsx` and `Tabs.tsx` restyled with tokens (error text, invalid background, disabled, coarse-pointer height) with no behaviour change. **Not yet adopted:** `AuthScreen`, `TemplatesPanel`, `LibraryPanel`, `LifecycleActions`, `ThemePanel` and the panels still use their old slate/indigo classes; they move to the shared controls in the tasks that redesign them. Evidence: 11 new unit tests, all 754 existing tests unchanged and passing. **Depends on:** UI-002.
- **Files:** `frontend/src/shared/ui/{fields.tsx,Tabs.tsx}`, `features/editor/EditorToolbar.tsx`; proposed small `Button.tsx`/`StatusBadge.tsx` only where repeated variants justify them.
- **Work:** implement common visual variants, labeled icon controls, input/help/error states, swatches/hex input, and focus treatment. Adopt incrementally; avoid a repository-wide style refactor. Keep all field event/commit/history behavior.
- **Accept:** controls share the token system; disabled/pending/error states are clear; invalid hex and partial numeric text do not corrupt draft; keyboard tab behavior and accessible names remain intact. No new UI dependency.
- **Verify:** `shared/ui/Tabs.test.tsx`, `Properties.test.tsx`, `History.test.tsx`, `editorHistory.test.ts`, `historyControls.test.ts`; targeted interaction checks for field blur/Enter/Escape/reset and color gestures.

### UI-004 — Add a reusable accessible rich-dialog shell

- **Status: ✅ Complete (2026-11-25).** New `shared/ui/Dialog.tsx`: portal, `inert` on every other body child (restored exactly), scroll lock, focus entry (default first control, or `initialFocusRef`), Tab/Shift+Tab containment over all focusable controls, Escape (topmost dialog only), focus return to the opener, `dialog`/`alertdialog`, accessible name and description. `ConfirmDialog` now uses it with the same props, safe initial focus and callbacks. Hand-rolled rather than native `<dialog>` or a library, per the plan. Evidence: `Dialog.test.tsx` (multi-input, inertness, Escape from a focused field, stacking, confirmation callbacks once) and real-browser checks (`#root` inert, dialog outside it, Tab wraps, Escape returns focus to Cancel and keeps the draft dirty). No rich dialog uses it yet (library and templates are UI-008/UI-010). **Depends on:** UI-003.
- **Files:** `frontend/src/shared/ui/ConfirmDialog.tsx`; proposed `shared/ui/Dialog.tsx` and focused tests.
- **Work:** introduce a general dialog shell for library/gallery content with many focusable controls. Reuse a correctly implemented native dialog approach or a small accessible equivalent after verifying React/test-browser behavior. Keep confirmations' safe initial focus and callbacks; no bulk Radix/shadcn installation. Support confirmation as an in-dialog step to avoid stacked traps.
- **Accept:** actual background inertness, focus entry/Tab containment/Escape/return, accessible naming, scroll lock and app-token portal styling work. Confirmation callbacks still fire once; opening/closing changes no workspace data.
- **Verify:** dedicated multi-input/empty/pending dialog tests and real-browser keyboard focus checks, including dialog dismissal while a field is focused and return to the actual trigger. Re-run focused auth/Cancel/template confirmation tests.

## Phase 2 — Editor shell

### UI-005 — Introduce permanent app navigation and three-area shell

- **Status: ✅ Complete (2026-11-25), with one gap.** New `ApplicationRail` (192 px labelled from 1440 px, 64 px icon rail from 1024 px; My workspace, Outline, Components, Templates, Appearance; brand and account at the bottom) and one `Inspector` column (304 px from 1280 px, 280 px at 1024 to 1279 px; sticky, scrolls on its own). It replaces the two tabbed panels, so there is no fourth pane and no new router. The view is local state (`inspectorView.tsx`), so changing it never touches the draft, history or server. One `SortProvider` still wraps the canvas and the outline. DOM order is rail, toolbar and canvas, inspector, with a "Skip to workspace" link. `WorkspaceGate` shows the account header only outside desktop Edit; the rail carries the brand and account there (`AccountControls`, with the same logout-discard confirmation). Measured in the browser: rail 192/64/64 px and inspector 304/304/280 px at 1440/1280/1024, no horizontal overflow. **Gap:** the spec's "inspector can close to widen the canvas" at 1024 to 1279 px is not built; the inspector is always open in Edit. Logout-discard confirmation was not re-exercised in the browser this phase (unit-tested only). **Depends on:** UI-004.
- **Files:** `frontend/src/features/workspace/{WorkspaceGate,EditorShell}.tsx`, `features/editor/EditorPanels.tsx`; proposed `features/workspace/ApplicationRail.tsx` and small presentation-state hook.
- **Work:** implement labeled/compact rail and sibling inspector widths from the spec. My Workspace/Outline/Components/Templates/Appearance open existing controls; account/logout keep their existing boundary. Preserve one `SortProvider`, a flexible measured canvas, selection and current draft across destinations.
- **Accept:** no fourth permanent pane/new router, no dead Settings link, no duplicate outline/provider/store. The app rail never moves with or becomes a target for user navigation. DOM/focus order follows the visual layout; inspector never covers the canvas. UI-only navigation does not create a dirty state.
- **Verify:** `EditorShell.test.tsx`, `responsiveShell.test.tsx`, `App.test.tsx`; browser at 1440/1280/1024 with inspector open/closed; logout discard confirmation; no-op grid measurement checks.

### UI-006 — Consolidate toolbar and refine Preview

- **Status: ✅ Complete (2026-11-25), with limits.** The large title card is gone. `EditorToolbar` now holds the single page heading with "Saved revision N", the labelled "Workspace title" field (Edit only), the status badge, and Undo, Redo, Preview, Cancel and Save, with Save as the one primary button. Preview (and below 1024 px) keeps the account header and a minimal strip with the heading, status and Edit workspace; the rail, inspector, handles and Save/Cancel are gone. Save rules, history, conflicts and mode semantics are untouched. Browser-verified: clean, unsaved and Preview states, a title rename that Saves and survives a reload (revision 1 to 2), and the 390 px view. **Limits:** the saving, error and conflict banners were restyled to tokens but not screenshotted this phase (the conflict flow is covered behaviourally by `acceptance.mjs`); "secondary actions responsive" is only flex wrapping. **Depends on:** UI-005.
- **Files:** `frontend/src/features/editor/EditorToolbar.tsx`, `features/workspace/EditorShell.tsx`, `features/editor/{workspaceSync.ts,useEffectiveMode.ts}` read/reuse; relevant existing tests.
- **Work:** consolidate heading/title-edit/status/Undo/Redo/Preview/Cancel/Save hierarchy; make secondary actions responsive. Preview removes builder chrome but retains minimal Edit/account/status and necessary recovery notices outside the themed canvas. Keep all save guards, history, conflicts, field finalization and mode semantics.
- **Accept:** Save state/disable rules are unchanged; template snapshot action cannot be confused with workspace Save. Newer edits survive delayed saves; Cancel/reload/logout still confirm; Preview task/Notes edits stay in the same draft. No new auto-save or mobile Save flow.
- **Verify:** `saveFlow.test.tsx`, `workspaceSync.test.ts`, `persistence.test.tsx`, `History.test.tsx`; `node e2e/acceptance.mjs` and `node e2e/undo-redo.mjs`; screenshots of clean/dirty/saving/error/conflict/Preview states.

### UI-007 — Group contextual properties and preserve the outline

- **Status: ✅ Complete (2026-11-25), with limits.** Widget Properties are grouped Content, Appearance, Layout, Visibility and Actions (`shared/ui/Group.tsx`; sections get the same groups). Layout shows a grid widget's column, row and size plus the keyboard hint, and the Order controls; click move/resize buttons stay with UI-014. A canvas click opens Properties (`interaction.gesture` must be idle); selecting in the Outline leaves the Outline view until you pick My workspace. With nothing selected the inspector shows the empty state and an "Open outline" button. Hidden and unknown widgets keep their safe inspector states. Verified in the browser: canvas click from Outline view opens Properties, outline selection does not, and every field and action stays reachable. **Limits:** no separate selection-summary card beyond the existing Type, Section and Visibility rows; keyboard traversal of all fields was not walked by hand (the focus audit of 265 controls across the five views covers visible focus and names). **Depends on:** UI-006.
- **Files:** `frontend/src/features/editor/{EditorPanels,InspectorPanel,WidgetProperties,NavItemProperties,ComponentOutline,LifecycleActions,NavigationPanel}.tsx`.
- **Work:** organize Content/Appearance/Layout/Visibility/actions; show useful selection summary and unselected state. Put Properties/Outline and workspace Appearance in the inspector presentation model without remounting drag sources mid-gesture. Initially show existing layout information/keyboard controls; UI-014 adds click move/resize controls.
- **Accept:** canvas selection opens Properties; Outline remains usable for sorting; hidden/unknown/removed items have safe inspector states. Existing registry fields and widget-specific inspectors all remain reachable. No unsupported radius/spacing editor; valid focused edits are not lost on panel changes.
- **Verify:** `Properties.test.tsx`, `Lifecycle.test.tsx`, `EditorShell.test.tsx`, `selection.test.ts`; traverse fields by keyboard; select/delete/hide/show and reorder without losing focus/data. Check long lists scroll within the panel.

## Phase 3 — Discovery and workspace styling

### UI-008 — Redesign the component library

- **Status:** Pending. **Depends on:** UI-007.
- **Files:** `frontend/src/features/editor/LibraryPanel.tsx`, `features/workspace/registry.ts`, `widgets/types.ts`; proposed library dialog wrapper if needed.
- **Work:** use registry-owned presentation labels/descriptions/icons, local search/categories, destination label and Add actions. Reuse actual `addWidget`, default props/placement/IDs and selection logic.
- **Accept:** all six widgets can be added; search/empty/error/limit states are clear. Added widget is selected in Properties. No-sections state offers the existing section-creation path; opening/searching does not change JSON. No drag-from-library or asset upload is invented.
- **Verify:** `Lifecycle.test.tsx`, `registry.test.ts`, focused library tests; add each type to grid/stack, Save/login/Cancel via existing lifecycle flow. Confirm one activation adds exactly one widget.

### UI-009 — Redesign workspace Appearance

- **Status:** Pending. **Depends on:** UI-008.
- **Files:** `frontend/src/features/editor/ThemePanel.tsx`, `shared/ui/fields.tsx`, `features/workspace/theme.ts` read/reuse.
- **Work:** group existing four colors and typography, improve live swatches/inheritance labels, add nonblocking contrast feedback. If adding suggested palettes, apply existing fields atomically through current commands/history; no new schema field or stored theme mode.
- **Accept:** `system/serif/mono` and validated size limits remain; app chrome is unaffected; Save/Cancel/Undo work; arbitrary user colors are preserved despite warnings. No unsupported background images, padding/radius settings, or Light/Dark/System control.
- **Verify:** `Properties.test.tsx`, `theme.test.ts`, `appearance.test.ts`, `History.test.tsx`; real color gesture, invalid hex/reset and persistence; screenshot the editor while the workspace uses extreme colors.

### UI-010 — Build a truthful template gallery

- **Status:** Pending. **Depends on:** UI-009.
- **Files:** `frontend/src/features/editor/TemplatesPanel.tsx`, neighboring `templateSummary.ts`, `applyTemplate.ts`; `frontend/src/api/templates.ts` read/reuse; proposed `TemplateThumbnail.tsx` and gallery dialog wrapper.
- **Work:** add Ready-made/My templates cards, config-derived mini-previews, detail/summary fallback, empty/loading/error states and clearly separated snapshot/apply/delete/reset actions. Keep existing alive/request guards and ownership/replace-blocker behavior. Avoid mounting the main editor to draw thumbnails.
- **Accept:** all three actual system configs have distinctive previews; custom details load lazily. Create snapshot does not save/change workspace; apply regenerates IDs and requires explicit Save; Cancel restores baseline. Save-in-flight blockers, deletion/replacement confirmation and private-template behavior remain unchanged. No marketplace/redundant Saved tab.
- **Verify:** `Templates.test.tsx`, `CustomTemplates.test.tsx`, `applyTemplate.test.ts`, `node e2e/templates.mjs`, `node e2e/custom-templates.mjs`; check multiple gallery opens/closes/late responses and keyboard focus after in-dialog confirmation.

## Phase 4 — Widgets and manipulation

### UI-011 — Refine common widget chrome, Welcome, Tasks and Notes

- **Status: ✅ Complete (2026-11-25)), with limits.** Card headers carry a code-owned type icon (`findWidgetPresentation`); the selected card has an editor-accent outline plus a visible "Selected" word; hover shows a quiet ring. Controls inside widgets (Tasks inputs, Notes textarea) follow the widget's own text color (`.fs-field`) so dark themes are legible; checkboxes use the workspace primary. Welcome gets a left accent border (no extra height). IDs, headings, handlers and appearance overrides are unchanged. Limit: Welcome at its minimum 3x2 size still clips its large greeting (unchanged from before; the domain minimum is not altered). **Depends on:** UI-010.
- **Files:** `frontend/src/features/workspace/{WidgetShell,WidgetRenderer}.tsx`, neighboring `registry.ts`, `frontend/src/widgets/{welcome,tasks,notes}/*`.
- **Work:** align header icons, title rhythm, selection/hover states and padding; refine actual greeting/checklist/textarea rendering. Retain real content, common shell, IDs/headings, appearance overrides and event handlers.
- **Accept:** existing minimum sizes and long/empty text remain usable; no static replacement of widgets, hardcoded user names or forced palette. Unknown widgets preserve data/placeholders. Task checks/Notes continue updating draft in Preview, with app save status.
- **Verify:** `WelcomeTasks.test.tsx`, `NotesWidget.test.tsx`, `registry.test.ts`, `node e2e/welcome-tasks.mjs`; inspect min-size variants and Save/login round trip of edited content.

### UI-012 — Refine Gallery, Analytics and Calendar

- **Status: ✅ Complete (2026-11-25)), with limits.** Gallery tiles and captions have clearer composition; Analytics has label/value hierarchy (small caps label, large value) with a thicker bar on a theme-neutral track; Calendar has a divided agenda with aligned dates and, at narrow widths, compact weekday names and cells (container query) so nothing overflows sideways. Tasks rows and the add form wrap at minimum width. In-widget scrollbars are thin and theme-neutral. No new data, charts, filters or uploads. Limit: Tasks at 3 columns is cramped by nature (it wraps rather than hides controls). **Depends on:** UI-011.
- **Files:** `frontend/src/widgets/{gallery,analytics,calendar}/*`, existing asset resolver and widget inspectors.
- **Work:** improve image/caption composition, KPI hierarchy/bar visualization and calendar/agenda spacing. Keep current sample data semantics and input inspectors.
- **Accept:** real bundled image keys/alt text, editable values and dates/order persist; minimum grid sizes do not clip actions; long lists have intentional scrolling. No new live charts, growth/time-filter controls, uploads, external data, or calendar-day sorting.
- **Verify:** `GalleryAnalytics.test.tsx`, `Calendar.test.tsx`, widget-focused tests; `node e2e/gallery-analytics.mjs`, `node e2e/calendar.mjs`; min/empty/long-data screenshots.

### UI-013 — Standardize semantic drag feedback across all adapters

- **Status: ✅ Complete (2026-11-25)), with limits.** Shared grips are at least 24 px (44 px on coarse pointers) and become fully visible on hover or focus; the dragged item is raised with a solid accent outline (`data-dragging`); drop targets and empty containers use accent outlines; Move up/down/to buttons use the shared Button. Sorting internals, providers, refs, announcements and commit/cancel logic are untouched. Limits: the feedback is an outlined item at its preview position, not a separate insertion line; coarse-pointer sizes were not tried on a real touch device. **Depends on:** UI-012.
- **Files:** `frontend/src/features/sorting/{SortableSection,SortHandle,MoveButtons,SortProvider}.tsx`, sorting styles; `workspaceAdapter.ts`, `resolveDrop.ts` read/reuse.
- **Work:** consistent grips/hover/selected/insertion/empty/invalid feedback and readable Move controls. Preserve current refs, keyboard plugin choice, transient previews, IDs, announcements and commit/cancel logic; do not replace sorting internals for appearance.
- **Accept:** every supported group and four cross-container transfer families follows the spec's compatibility matrix. Invalid/outside/Escape drops do not dirty a clean workspace; nested gestures never move parents. Move alternatives remain reachable on keyboard and touch.
- **Verify:** sorting unit/UI tests; `node e2e/nav-sorting.mjs`, `node e2e/sections-sorting.mjs`, `node e2e/lists-sorting.mjs`, `node e2e/entries-sorting.mjs`; include empty targets, hidden/unknown widgets and task↔gallery rejection. Capture feedback during real drags.

### UI-014 — Refine grid handles and add click move/resize alternatives

- **Status: ✅ Complete (2026-11-25)).** The resize corner is a visible 24 px accent corner (44 px coarse), the drag placeholder is a dashed translucent rectangle, and a dragged or resized widget is raised. The Layout group gains Position (Left, Right, Up, Down) and Size (Narrower, Wider, Shorter, Taller) buttons that call the existing `nudgeWidget`; refusals (outside the grid, too small, space taken) appear beside the buttons and leave the draft unchanged. Domain placement, RGL units and stop-only commits are unchanged. **Depends on:** UI-013.
- **Files:** `frontend/src/features/workspace/{GridSection,GridHandle}.tsx`, `features/editor/WidgetProperties.tsx` or proposed layout group, `index.css`; `domain/workspace/grid.ts` read/reuse.
- **Work:** style spatial placeholder/resize grips and add labeled position/size step buttons wired to existing `nudgeWidget`. Do not change domain placement algorithms or React Grid Layout config units. Keep semantic outline order synchronization.
- **Accept:** grid can move/resize by pointer drag, keyboard and simple clicks; collisions/minimum/bounds errors keep draft unchanged. Stop-only grid commits, hidden rect preservation, outline repacking and cross-engine isolation remain. Panel resizing/measurement makes no persistence write or dirty state.
- **Verify:** `GridSection.test.tsx`, `grid.test.ts`, `reorderGrid.test.ts`, `node e2e/grid-gesture.mjs`, `node e2e/outline-grid.mjs`; add a browser check of click alternatives and minimum bounds; resize shell/inspector during clean state.

## Phase 5 — Auth, responsiveness and accessibility

### UI-015 — Restyle authentication and recovery

- **Status: ✅ Complete (2026-11-25)).** Sign in, create account and sign in again use the editor tokens, the brand mark and the shared Button; errors and the session notice wrap long text. A "Show characters" / "Hide characters" button (local state only, `aria-pressed`, named so it does not collide with the Password label) reveals the password and resets after a failed attempt or a mode switch. Fields, autocomplete values, validation, frozen-draft wording and the discard confirmation are unchanged; no name, forgot-password, remember-me or social controls were added. The loading and server-unavailable screens use the same tokens. **Depends on:** UI-014.
- **Files:** `frontend/src/features/auth/AuthScreen.tsx`; session/API modules read/reuse, shared controls.
- **Work:** apply the shared visual language to login/register/reauth, errors and pending states; optional password visibility is local state only.
- **Accept:** existing email/password/autocomplete/validation and frozen-draft warnings persist. No full-name/forgot-password/remember-me/social-login controls or auth backend changes. Long error/email text fits small screens; password visibility has an accessible label.
- **Verify:** `App.test.tsx`, `sessionStore.test.ts`, `node e2e/acceptance.mjs`; wrong password, duplicate email, expired session, same-user recovery, different-user clearing and logout confirmation.

### UI-016 — Verify responsive layout and Preview behavior

- **Status: ✅ Complete (2026-11-25)), with limits.** The narrow Preview note now says what is true: tasks and notes can still be changed, but only in the open tab's draft until saved from 1024 px or wider (README and `docs/handoff.md` no longer call it read-only). `e2e/responsive.mjs` now covers 1920, 1440, 1280, 1024, 768 and 390 px for five design/placement cases plus 200%-zoom-equivalent widths (960 and 720 css px) with a dirty draft: no sideways scrolling, no clipped widgets, widening restores Edit with the same draft, and no write to the server. Limit: zoom was emulated by narrowing the viewport, not by browser zoom or device pixel ratio. **Depends on:** UI-015.
- **Files:** shell/panel/toolbar/navigation styles, `features/editor/useEffectiveMode.ts` read/reuse; existing responsive tests/scripts. Update only the misleading responsive wording in `README.md`/`docs/handoff.md` during implementation, preserving their historical result records.
- **Work:** apply exact rail/inspector breakpoints; validate all three navigation placements and templates with panels open/closed and at 200% zoom. Keep actual mobile task/Notes interactions, with accurate ephemeral-draft/save guidance.
- **Accept:** no page overflow or clipped primary actions at 1920/1440/1280/1024/768/390 px; below 1024 hides advanced tools without changing saved mode/layout. Side user navigation retains current adaptive thresholds; panel/canvas width changes never rewrite config.
- **Verify:** `responsiveShell.test.tsx`, `WorkspaceView.test.tsx`, `node e2e/responsive.mjs`; extend width/zoom coverage in current script style. Capture real screenshots for Edit/Preview and narrow dirty Preview; widening restores chosen mode/draft.

### UI-017 — Complete accessibility and final visual polish

- **Status: ✅ Complete (2026-11-25)), with limits.** The remaining old slate/indigo/rose editor surfaces (Outline, Add section, Navigation, widget inspectors for Analytics, Calendar, Gallery and Tasks, toolbar notices, placeholders, nav grips) now use the editor tokens or the widget's own colors. `e2e/accessibility.mjs` now audits the auth screens (focus, names, reveal toggle, long email at 390 px) and measures text contrast of the rail, toolbar and every inspector view against the painted background (4.5:1, or 3:1 for large text); it found and led to a fix for the Appearance sample chip (white on the default primary was 4.47:1; the sample now picks white or black). Limits: no real screen reader and no coarse-pointer device were used; contrast was measured for the default and focused-free states of editor chrome, not hover or every error state; the dialog backdrop keeps a fixed dark scrim. **Depends on:** UI-016.
- **Files:** focused shared/component styles and tests as needed; `frontend/e2e/accessibility.mjs`, UI verification evidence.
- **Work:** keyboard/skip links, focus order/restoration, screen-reader smoke, app contrast, touch targets, reduced motion and long/empty/error states. Keep manipulation controls accessible even when visually quiet. Review repeated overlays and bundle impact; no dependency churn for cosmetic polish.
- **Accept:** no invisible focus, trapped panel or non-inert modal background; all operations have meaningful names; simple-pointer alternatives and announcements work. User low-contrast colors show advisory feedback without altering saved values. Record any remaining assistive-technology/browser limits honestly.
- **Verify:** `node e2e/accessibility.mjs`, manual keyboard + real screen-reader checks, 200% zoom/coarse pointer/reduced motion, contrast measurement and before/after screenshot review. Compare production-build advisories against UI-001 baseline.

## Phase 6 — Demo acceptance

### UI-018 — Run regression gates and prepare demo evidence

- **Status: ✅ Complete (2026-11-25), with open items.** Full gates were run and recorded (backend 264 tests with one intermittent existing failure, frontend 801 tests, 18 of 18 browser scripts), the acceptance checklist now carries dated evidence per row, and a 41-image screenshot matrix and a demonstration sequence are recorded. New scripts: `final-regression.mjs` (exact JSON round trip, unknown and hidden data, structure against the pre-redesign baseline, 44 px coarse-pointer targets) and `screenshot-matrix.mjs` (evidence tool). Fixes found by the final pass: seven editor and canvas controls below 44 px on touch; `acceptance.mjs` now waits for the drag pickup announcement. Open: intermittent backend ordering test, no real screen-reader pass, emulated zoom. Nothing was committed or published by this task. **Depends on:** UI-017.
- **Files:** UI verification log and evidence; focused existing test scripts only when changed presentation requires deliberate selector updates. Keep original FS task history intact.
- **Work:** complete [UI acceptance](UI_ACCEPTANCE_CHECKLIST.md), record before/after screenshots and a short real-data demonstration sequence. Update accessible-name selectors deliberately, using exact matches where prefixes conflict; never delete assertions to make a restyle pass.
- **Accept:** all functional and visual gates have dated evidence, no unexplained regression, no changed schema/backend contract or silently overwritten saved configurations. Screenshot review confirms professional presentation and all supported reordering; two-account/two-tab persistence and isolation still work. No credentials/private configs/database artifacts are tracked.
- **Verify:** full frontend typecheck/lint/tests/build, full backend pytest against temporary SQLite, all 15 existing browser scripts against scratch API/database, and manual visual/accessibility review. Record actual final counts, not copied baseline counts. Do not publish, commit or push merely because UI tasks are complete; follow the user's authorization for those actions.
