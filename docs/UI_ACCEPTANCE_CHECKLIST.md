# UI redesign acceptance checklist

Status: **Executed 2026-11-25 (UI-018), with open items listed in section 8.** Follow the [design spec](UI_DESIGN_SPEC.md), [redesign plan](UI_REDESIGN_PLAN.md), and [ordered tasks](UI_REDESIGN_TASKS.md). Evidence details, commands and screenshots are in [design/UI_VERIFICATION.md](design/UI_VERIFICATION.md); screenshots are under `artifacts/ui-review/` (not tracked in git).

**Acceptance reopened, 2026-11-25.** Independent review and user feedback identified behavioral defects and missing UX requirements. Earlier “Verified” rows are historical checks of the old behavior, not approval of the revised design. The Pending gates in section 9 and UI-019–UI-030 must pass before final sign-off; no corrective work was implemented by this documentation update.

Legend: **Verified** = performed and passed on 2026-11-25 against the final code unless a phase is named. **Partly** = some of the row was performed. **Not performed** = still open. [handoff.md](handoff.md) keeps the 2026-11-23 historical baseline (264 backend, 754 frontend, 15 browser scripts); the current results are in section 7.

## 1. Baseline and evidence

- **Verified (UI-001):** Current screens captured and suite results recorded before any change (`artifacts/ui-review/before/`, UI_VERIFICATION Phase 0).
- **Partly (UI-001):** Normalized workspace JSON captured before the redesign, but only for the default Productivity workspace (`baseline-workspace.json`), not a workspace holding all six widgets, hidden entries and unknown widgets. Final run compares a fresh workspace with it ignoring ids, and a separate check proves hidden and unknown data survive (section 5).
- **Verified (every task):** Focused checks ran per phase; failures were fixed or recorded (for example the acceptance-script timing and the backend ordering test in section 8). Selector updates were deliberate; no assertion was weakened.

## 2. Visual system and editor boundaries

- **Verified (UI-002, UI-003):** Off-white background, white surfaces, slate text, indigo accent, shared radius/shadow scale and inline icon set; screenshots from each phase and the final matrix were reviewed.
- **Verified (UI-002):** Editor chrome uses `--ui-*` tokens; workspace colors use scoped `--fs-*`. White-on-white and dark workspace colors left the rail, toolbar, inspector and dialogs readable (browser, Phases 1, 3 and 4); a guard test blocks `--fs-*` use in editor code. Saved colors are never rewritten.
- **Partly (UI-003):** Inputs, buttons, tabs, swatches, badges, validation, disabled and focus states follow shared conventions. Hover and tooltip states were not screenshotted exhaustively.
- **Partly (UI-005, UI-006):** The rail and account controls stay in place whatever the user navigation does: top navigation (final matrix), left navigation (browser checks in Phases 2 to 5) and an empty workspace (final matrix) were looked at; a right-side navigation image from the final matrix was not. `responsive.mjs` covers all three placements numerically. User navigation is never the only route to editing.
- **Verified (UI-007 to UI-012):** Inspector, library, appearance, templates and the six widgets keep real data and actions; no fake filters, uploads, theme-mode persistence or password-recovery controls exist.

## 3. Shell, Preview, and responsive behavior

| Gate | Result |
| --- | --- |
| >= 1440 px | **Verified:** `responsive.mjs` measures a 192 px rail and a 304 px inspector; no fourth permanent column. |
| 1024 to 1439 px | **Verified:** 64 px rail; inspector 280 px at 1024 and 304 px at 1280 (measured). Panels scroll on their own. |
| Preview | **Verified (Phase 2 browser, final screenshots):** rail, panels, handles and selection rings are gone; account, Edit and save status remain; modes never save or discard. |
| < 1024 px | **Verified:** responsive Preview with an accurate explanation; task checks and notes keep working in the draft; no mobile Save flow; dirty status points to a larger screen. |
| Navigation adaptation | **Verified:** placement data is untouched; side navigation appears from 1400 px in Edit and 1024 px in Preview as before. |

- **Verified (UI-016):** Screenshots saved for all three designs (left, top and right navigation) at 1920, 1440, 1280, 1024, 768 and 390 px in Edit (from 1024) and Preview, plus a selected widget, an empty workspace, every inspector view and three modal states: 41 images in `artifacts/ui-review/final/`. I reviewed 7 of them by eye (list in UI_VERIFICATION); the other 34 were saved and not individually inspected. Layout metrics for every combination were asserted by `responsive.mjs`.
- **Partly (UI-016, UI-017):** 200% zoom was emulated (720 css px at 2x density, plus 960 and 720 px windows), not browser zoom. No page-level overflow and no dirty JSON.
- **Verified (UI-016):** The stale "read-only" wording in README and handoff is corrected; narrow Preview keeps task and note edits.

## 4. Cross-section sorting and grid behavior

Pointer drag, keyboard sorting and Move controls are exercised by `nav-sorting`, `sections-sorting`, `lists-sorting`, `entries-sorting` and `outline-grid` (all passing on the final code), each followed by Save/reload checks where the script does them.

| Surface | Result |
| --- | --- |
| Navbar and sidebar groups | **Verified:** reorder and primary/secondary transfer, including an empty target (`nav-sorting.mjs`). |
| Workspace sections | **Verified:** reorder with nested data intact; hidden sections stay in the outline (`sections-sorting.mjs`). |
| Stack cards | **Verified:** reorder and transfer, unknown cards stay put (`sections-sorting.mjs`, unit tests). |
| Tasks | **Verified:** reorder and transfer including an empty destination (`lists-sorting.mjs`). |
| Gallery | **Verified:** reorder and transfer including an empty destination (`lists-sorting.mjs`). |
| Metrics and agenda | **Verified:** reorder in own widget, cross-widget transfer rejected (`entries-sorting.mjs`). |
| Grid outline | **Verified:** reorder within a grid repacks geometry; cross-grid and grid-to-stack rejected (`outline-grid.mjs`). |

- **Partly (UI-013):** Escape (`lists`, `sections`, `nav`, `accessibility` scripts), outside drop (`sections-sorting`), incompatible drops and stale source (`SortProvider.test.tsx`) and a full 100-item destination (`sortingLists.test.tsx`) are covered. The full-destination and stale-source cases are unit level, not browser level.
- **Partly (UI-013):** Drop targets, empty targets and dragged items have distinct outlines; selected cards carry the word "Selected". The dragged state is an outline plus raised shadow, not a separate insertion line.
- **Verified (UI-014):** 12 columns, 32 px rows, 16 px gaps, minimum sizes, bounds and overlap rejection are unchanged; one commit per gesture; outline reorder repacks geometry; click step buttons use `nudgeWidget` (`grid-gesture`, `outline-grid`, `widget-chrome-grid-steps`).
- **Verified (UI-014):** Opening panels, measuring, resizing the window or changing placement creates no unsaved change (`responsive.mjs` and `final-regression.mjs` assert no write; status stayed "All changes saved" in browser checks).

## 5. Persistence, history, auth, and templates

- **Verified (UI-006):** Edit, Preview and Edit keep the draft; Save keeps edits made during a delayed response; Cancel confirms and restores the baseline (`saveFlow.test.tsx`, `acceptance.mjs`).
- **Verified (UI-006):** Failures keep the draft; two tabs give a visible 409 with keep-editing or reload; late responses from another owner are ignored (`saveFlow.test.tsx`, `acceptance.mjs` step 8b).
- **Verified (UI-006, UI-015):** Expired session freezes private content; same-account sign-in restores it and a different account clears it (browser, Phase 5, with a genuinely expired cookie); logout and discard confirmations work; credential errors stay generic.
- **Verified (UI-006):** Undo and Redo keep 30 steps, one gesture is one step, no network write, Cancel and account switches clear history (`History.test.tsx`, `undo-redo.mjs`).
- **Verified (UI-010):** System templates and Restore default change the draft only; Cancel restores; snapshots are private and do not save the workspace; apply remaps ids; delete leaves the workspace alone (`templates.mjs`, `custom-templates.mjs`, `components-appearance-gallery.mjs`).
- **Verified (UI-018):** Save, log out, log in gives an identical document (deep equality of the API JSON and the same revision), including a hidden widget; an unknown widget payload and widget order survive an unrelated edit and Save (`final-regression.mjs`); an unsupported newer schema opens no writable editor (`acceptance.mjs` step AC-12b).
- **Verified (UI-018):** No backend, schema or contract change: `git diff 427ef2f HEAD -- backend contracts` is empty.

## 6. Accessibility and overlay behavior

- **Partly (UI-017):** Text contrast of the editor chrome (rail, toolbar, every inspector view) and the auth screens was measured against the painted background (4.5:1, 3:1 for large text) by `accessibility.mjs`: 148 chrome text runs and 28 auth text runs, all passing. Hover, selected and every error state were not measured, and the contrast of focus rings themselves was not measured (their presence was checked on 279 controls).
- **Verified (UI-004, UI-017):** Dialog initial focus, Tab containment, Escape, inert background, accessible title and focus return work, including destructive confirmations (`Dialog.test.tsx`; browser checks of delete-template, replace-draft, discard and logout dialogs).
- **Verified (UI-014, UI-017):** Arrow and Shift+Arrow grid move and resize remain; click step controls and semantic Move buttons give pointer alternatives to dragging.
- **Partly (UI-017):** DOM and focus order, no hover-only essential action, reduced motion (computed styles), labels, errors and spoken sorting and save states were checked by script and in the browser. **A real screen-reader pass was not performed**, and automated focus checks do not replace one.
- **Verified (UI-017):** With a touch-emulated browser (coarse pointer, 1100 px), the rail, toolbar, every inspector view and the canvas buttons and grips are at least 44 px tall and wide (`final-regression.mjs`); this found and fixed the toolbar title field, Outline rows, Add section buttons, filter chips, nav links, task delete buttons and calendar arrows. Not tested on a real touch device.

## 7. Final execution and demo gate

| Gate / UI-018 | Command or evidence | Result 2026-11-25 |
| --- | --- | --- |
| Backend | From `backend`: `.venv\Scripts\python -m pytest` | **264 tests; 4 of 6 full runs passed, 2 runs had one failure** (`test_list_shows_system_templates_in_order_then_own_newest_first`, an existing ordering tie; see section 8). Backend code is unchanged. |
| Frontend | `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` | **Passed:** typecheck and lint clean, 801 tests in 57 files, build OK (CSS 40.16 kB, JS 585.82 kB; chunk-size advisory unchanged). |
| Browser | `npm run test:browser` | **Passed: 18 of 18 scripts** (the original 15 plus `components-appearance-gallery`, `widget-chrome-grid-steps` and `final-regression`). |
| Visual and manual | Screenshot matrix, zoom, coarse pointer, reference comparison | **Partly:** matrix saved and 7 images reviewed; zoom emulated; coarse pointer emulated; no screen reader; the reference image was used for hierarchy only. |
| Demo | Auth, edit and style, move families, Undo, Save and login, template and Cancel, second-user isolation, stale-tab conflict | **Verified** by `acceptance.mjs` (two accounts, two tabs, steps 1 to 8b) with `nav/sections/lists/entries/outline-grid-sorting`, `undo-redo` and `final-regression`; sequence recorded in UI_VERIFICATION. |

## 8. Open items and limits (read before release)

1. **Backend ordering test is intermittent.** The templates list orders by creation time with no tie-breaker, so two custom templates created within the same clock tick can list in either order. It predates the redesign and was not fixed, because this work does not change the backend. A tie-breaker in `backend/app/repositories/templates.py` would fix it.
2. **No real screen-reader pass** and no real touch device; both are emulated or unperformed as stated above.
3. **200% zoom** is emulated, not real browser zoom.
4. **Acceptance script timing:** `acceptance.mjs` step 3 sent ArrowDown immediately after Space and failed intermittently (7 of 25 runs on the redesigned UI, 0 of 10 on the pre-redesign UI). Measured drag pickup takes about 40 ms in both versions and the cause was not isolated further; the script now waits for the "Picked up" announcement (0 failures in 20 runs afterwards). A person pressing keys within a few milliseconds could still miss the first arrow.
5. **Baseline JSON** is the default workspace only.
6. **Screenshots are untracked** (`artifacts/`), so the paths in the evidence log do not exist in a fresh clone.

The previous release assessment is superseded: independent browser probes now confirm a delayed-reload data-loss case and failed logout retaining an active server session. See section 9. Resolve those defects and the revised user-interaction requirements before declaring completion.

## 9. Reopened acceptance after independent review and user feedback

Results of the corrective pass (2026-11-25) are in the **Result** column; unresolved items are listed in section 10. Baseline: independent full runs passed 801 frontend / 264 backend tests and 18 browser scripts on 2026-11-25; those suites did not catch every case below. New results must be recorded after implementation, not copied from that baseline.

| Gate | Required evidence | Result |
| --- | --- | --- |
| UI-019: reload/new edits | Trigger a two-tab conflict, confirm Reload latest, delay the GET, attempt another edit, then release. Either editing was clearly blocked or the new edit remains protected; no silent overwrite or false “All changes saved.” Repeat for GET failure and account switch. | **Verified.** `reload-latest.mjs` (delayed GET: editing paused, no overwrite, remote copy shown after; aborted GET keeps the draft; logout while pending ignores the late result) plus store/UI tests. |
| UI-020: reliable logout | Abort logout or return 500: show pending/failure/retry, not silent success. Restore connectivity and Retry: server session is revoked, `/auth/me` returns 401 and refresh does not log back in. Duplicate clicks and late responses remain owner/generation-safe. | **Verified.** `logout-retry.mjs` on real cookies: aborted and 500 logout show "Sign-out could not be confirmed", `/auth/me` stays 200 until Retry, then 401 and a refresh stays signed out; duplicate click = one request. |
| UI-021: automatic same-section reflow | Drag C onto A and A down over B in an occupied grid; show neighbors making room, then match visible order/outline/mobile order after drop. Preserve sizes/IDs/other sections/hidden entries; zero final overlaps. One Undo restores the whole layout. Escape/outside/mode change abandons preview without dirtying a clean draft. Idle load/resize/panel changes preserve saved gaps and geometry. | **Verified.** `grid-gesture.mjs`: a drag onto Tasks pushes it, zero overlaps, same widths, outline = canvas order, one Undo/Redo, Save and reload persist; Escape and outside-canvas release cancel. Domain tests cover mixed sizes and 80 random layouts. |
| UI-022: unavailable controls | At each boundary/minimum/maximum/blocked one-cell step, button is natively disabled before click and has a readable reason. Update immediately after a valid move. Add/Save/template/history/nav controls follow actual capability, never merely fail silently; evaluation creates no draft/history/network change. Close/Back/recovery remain accessible. | **Verified.** Natively disabled steps with attached reasons at Left/Up/minimum/maximum, re-enabled after a valid move; occupied steps stay enabled; evaluator is side-effect free and agrees with execution. |
| UI-023: explicit and visible Add | Pick a visible destination from Add to section; add every registered type once to grid/stack, including a below-fold section. Close library, show Properties, scroll/focus/select the new card and announce actual destination. Hidden/no-visible/full/removed destination disables Add with a recovery path. Never silently switch to another or hidden section. Save/login and Undo/Cancel reproduce expected results. | **Verified.** `add-destination.mjs` (below-the-fold stack and grid: dialog closes, Properties open, card in view and focused, nothing saved; Undo/Redo/Save/reload exact) plus 11 unit cases (hidden/no-visible/limit/lost destination, rapid activation). |
| UI-024: full workspace palette | Apply a visibly different palette in top/left/right and Edit/Preview. Canvas stage, whitespace, user navigation and inherited cards/text reflect the mapped colors; app rail/toolbar/inspector/dialogs remain readable and fixed. Custom overrides remain with an explanation/reset. Save/login, one-step Undo and Cancel work. Measure computed colors and inspect screenshots at 1024/1440/390. | **Verified.** `workspace-palette.mjs`: computed colors and stage geometry in top/left/right nav, Edit 1440/1024, Preview 1440/1024/390; editor chrome and dialog unchanged; one Undo, Cancel, only theme fields change after Save. Screenshots read. |
| UI-025: minimum widget sizes | Visually inspect all six widgets at supported minima, including Welcome with multiline/long text. Meaningful content is readable or intentionally scrollable, never silently clipped. Do not alter all saved geometries or schema to fit a skin. | **Verified.** `min-sizes.mjs`: all six widgets at their minima with long content, light and dark: nothing silently clipped (Welcome and Notes were, now fixed). Welcome at 80 px shows the greeting and about one subtitle line; the rest scrolls. |
| UI-026–UI-027: promised design surfaces | Real focused library dialog and large 3/2/1-column template gallery with Ready-made/My templates; safe dialog focus/inertness and in-dialog confirmation. Inspector closes/reopens without losing selection/draft/scroll; canvas remeasures without a persistence write. Toolbar Add/Templates and Back to properties are present. | **Verified, with a limit.** Library and Templates are real dialogs (960 px, tabs, in-dialog confirmation, focus returns); inspector hides/shows with a wider canvas, no write, scroll/view/selection kept; toolbar Add/Templates; Back to properties. The 2- and 1-column gallery tiers exist in CSS but are unreachable (dialog needs Edit, >= 1024 px). |
| UI-028: equal timestamp ordering | Force equal timestamps in a temporary database; demonstrate documented deterministic tie order repeatedly while system order, ownership/privacy and template snapshots remain unchanged. Test asserts the chosen tie rule, not random insertion assumptions. | **Verified.** Tie rule (`created_at` desc, `id` asc) tested with equal timestamps; the flaky test was actually `test_sync_bumps_the_updated_time_only_for_rows_it_changes` and is now clock-independent; backend 267 passed in 15 consecutive full runs. |
| UI-029: accessibility/readiness | Exercise rapid keyboard pickup→arrow without relying solely on a test delay; verify all normal keyboard/Move alternatives. Record actual screen-reader smoke, real browser 200% zoom and focus/hover/error contrast. Hardware/emulation distinction is explicit; unavailable required checks stay Blocked, not Verified. | **Partly: two items Blocked.** Rapid keyboard (325 real-key sequences), real 200% browser zoom, measured focus/hover/error contrast and disabled-reason scan done. **Blocked:** real screen-reader pass and hardware touch device. |
| UI-030: final acceptance | Run frontend typecheck/lint/tests/build, backend tests and every browser script on scratch data; update old occupied-drop/button-refusal assertions to the approved new behavior, keeping boundary/zero-overlap/privacy coverage. Review screenshots against revised spec, not just numeric no-overflow checks. Report unresolved items honestly. | **Verified, with the open items in section 10.** See `design/UI_VERIFICATION.md`, Corrective pass. |

Keep the prior per-phase results as history. Do not clear these gates because old suites pass. Evidence paths in a local artifacts folder need an explicit handoff/export or documented regeneration; do not claim they exist in a fresh clone.


## 10. Corrective pass sign-off (UI-030, 2026-11-25)

Overall status: **accepted for everything that could be exercised here; two required manual checks are Blocked, so full sign-off is not claimed.**

Blocked (cannot be done in this environment):

1. A real screen-reader pass (no screen reader could be driven or heard; automated name, role and live-region checks are not a substitute).
2. A hardware touch device (touch is emulated only).

Open, not blocking: the 2/1-column gallery tiers are unreachable in practice; the user navigation is flat on the stage (no elevated card); Welcome at 80 px relies on scrolling for all but its first subtitle line; a synthetic same-task burst of Space+arrow keys (not producible by a keyboard) loses the first arrow inside dnd-kit; `artifacts/` stays untracked.

Counts and commands are in [design/UI_VERIFICATION.md](design/UI_VERIFICATION.md), Corrective pass.
