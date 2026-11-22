# Claude Code implementation tasks

Status: FS-001 and FS-002 complete; FS-003 onward pending. Read [architecture](architecture.md) before starting. Execute in numeric order unless a listed dependency and milestone gate permit otherwise. Each task should fit a focused implementation session; split further if its actual diff grows too large.

Completion rule: make the bounded change, run its targeted checks, and record evidence before checking it off. Existing repository authentication is already configured; do not replace it. Do not commit or push without authorization from the implementation request.

## M1 — Foundations

### FS-001 — Scaffold and lock the approved stack

- **Status: ✅ Complete (2026-11-23).** Evidence: `npm run build`, `npm test` (2 tests), `npm run lint`, `pytest` (1 test) pass; `/api/health` returns `ok` directly and through the Vite proxy on :5173. Locked: React 19, Vite 8, TypeScript 7, Tailwind 4, react-grid-layout 2.3.0, @dnd-kit/react 0.5.3 (incl. `/sortable`), Zustand 5, FastAPI 0.165, SQLAlchemy 2.1, Pydantic 2.14, Python 3.12.8.
- Depends on: none. **Execute this task first when implementation is requested.**
- Create `frontend/` with Vite React/TypeScript and Tailwind's Vite integration; create `backend/` with FastAPI, settings, and `/api/health`. Add approved UI dependencies, backend dependencies, and focused test tooling. Configure the Vite `/api` proxy, environment examples, ignores, and local run instructions.
- Acceptance: frontend shows a minimal placeholder and calls health through the proxy; backend reports healthy; type check/build pass; lockfiles record compatible stable versions, including React Grid Layout v2 and the current dnd-kit family. Runtime prerequisites and both start commands are documented. No editor features yet.

### FS-002 — Specify and validate config v1

- **Status: ✅ Complete (2026-11-23).** Evidence: `pytest` 61 passed, `npm test` 64 passed (both run the same 5 valid / 45 invalid fixtures in `contracts/fixtures/`, plus generated limit tests incl. code-point length parity); `npm run typecheck`, `npm run lint`, `npm run build` clean. Code: `backend/app/schemas/config.py`, `backend/app/services/workspace_config.py`, `frontend/src/domain/workspace/`. Schema exported to `contracts/workspace-config.schema.json` with a drift test. Contract details settled during implementation are in `contracts/README.md`.

- Depends on: FS-001.
- Add frontend domain types/parsing/defaults and backend Pydantic config models. Add shared valid/invalid fixtures and exported JSON Schema under `contracts/`; provide the future migration dispatcher with v1 identity behavior.
- Acceptance: both runtimes agree on fixtures for defaults, all six prop types, ID/reference/layout/type limits, unknown widgets retained, invalid current data rejected, and unsupported future versions blocked. No fabricated legacy migration; no arbitrary executable props.

### FS-003 — Add the database boundary

- Depends on: FS-002.
- Implement engine/session factory, ORM models, repositories, and an initial Alembic migration for users, workspaces, templates, and sessions. Seed the three system-template keys idempotently with valid starter configs; visual refinement comes later.
- Acceptance: migrate a fresh temporary SQLite database; foreign keys/ownership uniqueness work; seeding twice duplicates nothing; a rollback leaves no partial registration data. Route modules do not contain SQL. `DATABASE_URL` is the connection boundary.

## M2 — Backend behavior

### FS-004 — Register and verify credentials

- Depends on: FS-003.
- Add email/password validation, normalization, Argon2 hash/verify, and the registration service creating a user and Productivity workspace atomically. Expose registration/login routes as part of the session integration in FS-005.
- Acceptance: service tests cover valid registration, duplicate normalized emails, invalid/oversized inputs, wrong password, and rollback. Stored passwords are hashes; default config passes FS-002 validation.

### FS-005 — Complete session authentication and CSRF

- Depends on: FS-004.
- Implement register/login/me/logout routes, hashed opaque session tokens, expiry, fresh-login tokens, protected cookie settings, Origin validation, CSRF tokens, and current-user dependencies. Add the common error envelope and private-response cache policy.
- Acceptance: API tests cover cookie flags in localhost/HTTPS modes, login/me/logout, revoked/expired sessions, forged or missing CSRF/Origin, generic login failure, and anonymous 401. A logged-out token cannot access protected routes. Credentials never appear in logs/responses.

### FS-006 — Read and conditionally save the user's workspace

- Depends on: FS-005.
- Implement `GET/PUT /api/workspace` with server normalization/validation, session-derived ownership, and atomic revision-matched updates. Enforce payload size and unsupported-schema errors without rewriting stored data on GET.
- Acceptance: two users load independent configs; malicious ownership fields fail validation; a valid PUT increments revision and round-trips content; two saves with the same base revision produce one success and one 409. Invalid/oversized/future-version data leaves storage intact.

### FS-007 — Implement private template APIs

- Depends on: FS-006.
- Implement template metadata listing, detail, custom snapshot creation, and own-custom deletion. Use the workspace validator and session-derived owner; system templates are read-only.
- Acceptance: system plus own templates are listed; another user's ID returns 404 on read/delete; system delete is 403; invalid configs/names fail; creating a template never changes the workspace or its revision.

## M3 — Complete the first vertical slice

### FS-008 — Connect authentication and protected loading

- Depends on: FS-007.
- Build accessible registration/login screens, API fetch/error/CSRF handling, auth bootstrap via `/auth/me`, and protected workspace loading. Introduce auth generation/owner checks and clear-state behavior.
- Acceptance: browser registration/login/logout works through the proxy; failed login is understandable; a new session loads only its own workspace; delayed previous-user responses cannot populate the current account. No credentials/private draft persistence in browser storage.

### FS-009 — Implement editor domain state and commands

- Depends on: FS-008.
- Create Zustand saved/draft/revision/mode/selection/interaction state and immutable command infrastructure. Implement load, property update, Cancel, mode change, and save lifecycle transitions before wiring many controls.
- Acceptance: focused tests prove deep separation of saved/draft, true dirty comparison, no-op behavior, Cancel, immutable submitted snapshots, newer edits preserved after save success, failure retention, and owner-generation guards. No localStorage persistence or component-owned workspace copies.

### FS-010 — Wire explicit Save, Cancel, and recovery

- Depends on: FS-009.
- Connect workspace GET/PUT to the state machine. Add dirty/saving/error status, duplicate-save prevention, conflict/reload confirmation, unsaved navigation guards, and owner-bound reauthentication recovery.
- Acceptance: a changed JSON fixture can Save/reload/Cancel; 409 does not silently replace the draft; edits during a delayed Save remain dirty afterward. A response lost after commit is reconciled by fetching/comparing the submitted snapshot. A 401 hides/freezes private state, resumes only for the same owner, and clears it for a different login.

### FS-011 — Build registry rendering with Notes and fallback

- Depends on: FS-010.
- Add registry/renderer/widget shell, grid/stack section shells, a complete Notes widget, and the unknown-type placeholder. Wire note edits through domain commands; add a temporary simple navigation shell as needed.
- Acceptance: edit a note, Save, logout/login, and see the same text; Cancel restores the baseline; unknown widget JSON survives an unrelated Save unchanged. Text renders escaped and no runtime user code is supported. This is the first complete persistence demonstration.

## M4 — Editing controls and spatial layout

### FS-012 — Add the editor shell and selection

- Depends on: FS-011.
- Add Edit/Preview toggle, toolbar, component outline, library/properties/theme/template panel slots, and selection synchronization between outline and widget shell.
- Acceptance: Preview hides builder panels/handles and offers an Edit entry point; toggling modes preserves the draft without writes; selected/deleted/hidden targets never leave a stale inspector. Below desktop width, explain editing availability and show Preview.

### FS-013 — Implement component and section lifecycle

- Depends on: FS-012.
- Add known widgets with registry defaults, unique IDs, and valid placement. Implement widget hide/show/remove; section add/title/hide/remove using grid/stack choices. Maintain valid nav targets when sections are removed (set those targets to null).
- Acceptance: add every widget type to draft even before all renderers are finished; hidden items remain accessible in the outline; show avoids occupied grid space; remove cleans geometry/references; Cancel reverses all lifecycle actions. Empty sections render useful states.

### FS-014 — Implement properties, theme, and navigation placement

- Depends on: FS-013.
- Generate inspectors from allowed field descriptors; implement titles/text, per-widget colors/font size, global colors/font family/size, and nav labels/targets/icons. Apply theme through CSS variables; share one nav model across top/left/right placements.
- Acceptance: react-colorful and labeled text/color fields update the draft live; unsupported values fail validation; Save/login and Cancel work for these properties. Navigation changes placement without duplicating or losing primary/secondary item data; runtime classes are not assembled from JSON.

### FS-015 — Integrate React Grid Layout v2

- Depends on: FS-014.
- Build measured-container grid adapter, desktop move/resize handles, valid-size constraints, canonical geometry commits, visible/hidden layout merging, and derived narrow-screen stacking. Provide an internal move/resize domain command for the adapter.
- Acceptance: move/resize persists after Save/login; opening panels, changing navigation placement, initial mount, or resizing the viewport does not dirty data. A content control never drags its parent. Pure placement tests cover deterministic packing/bounds/hidden widgets; a browser test covers a real grid gesture.

## M5 — Demonstration widgets

### FS-016 — Complete Welcome and Tasks

- Depends on: FS-015.
- Implement polished Welcome and Tasks registry renderers/inspectors. Support task create/edit/delete/check through typed commands; prepare stable task item IDs for sorting.
- Acceptance: default sample content is useful; task checks work in Preview and mark the same draft dirty; Preview status directs users to Edit to Save/Cancel. Changed greeting, task text, completion, and deletion persist after Save/login.

### FS-017 — Complete Gallery and Analytics

- Depends on: FS-016.
- Add bundled gallery assets, image/alt/caption editing, and KPI/metric editing with a lightweight CSS/SVG bar visualization. Add item create/delete commands; preserve stable IDs.
- Acceptance: widgets look complete without external network data; configured images/labels/values persist; invalid asset keys and non-finite numbers are rejected. Rendering remains bounded with empty lists and long labels. No upload or extra chart service is introduced.

### FS-018 — Complete Calendar and refine Notes

- Depends on: FS-017.
- Implement mini calendar, ordered agenda, date/title editing, event create/delete, persisted display-month property, and transient calendar browsing. Refine Notes appearance and empty states.
- Acceptance: calendar dates remain chronological; agenda follows its stored array order; edits persist while ordinary calendar browsing does not dirty config. Notes body is plain text and respects limits. All six widgets now render, edit, and persist supported data.

## M6 — Ordering throughout the workspace

### FS-019 — Build shared sortable adapter and navigation proof

- Depends on: FS-018.
- Implement `SortableSection`, item handles, typed container policies, transient drag state, empty targets, keyboard support/Move controls, and the atomic move command. Connect primary/secondary navigation first.
- Acceptance: reorder navigation at top/left/right; move an item between groups including an empty group. Escape/outside/incompatible drops produce no change, duplicate IDs never appear, and keyboard/buttons use the same command. Test domain moves plus one real pointer gesture before adding more adapters.

### FS-020 — Reorder sections and stack cards

- Depends on: FS-019.
- Connect workspace section order and stack widget order to the shared abstraction. Permit registered cards to transfer between stack sections; enforce root-only sections and preserve unknown widgets within their current section.
- Acceptance: section moves carry all nested data/geometry; a nested card gesture never moves its section; cards transfer into empty stack sections with IDs/content preserved exactly once. A card cannot become a nav item or nested workspace section.

### FS-021 — Sort and transfer Tasks and Gallery content

- Depends on: FS-020.
- Add adapters for task rows and gallery items using the same `SortableSection`. Support same-type transfers between corresponding widgets, with destination limits and empty-container targets.
- Acceptance: both item types reorder and transfer correctly; a task-to-gallery attempt changes nothing; cancellation restores the initial draft. Save/login preserves order, completion/captions, and unique ownership of each item. Inputs and nested handles do not trigger parent drags.

### FS-022 — Sort metrics and calendar agenda

- Depends on: FS-021.
- Connect analytics metric cards and calendar agenda entries to shared sorting; scope each to its own widget.
- Acceptance: visual KPI/bar order and agenda order follow saved arrays; Move up/down controls work; calendar day cells retain date order; cross-widget metric/event transfers are rejected. No separate drag provider or duplicated move algorithm is added.

### FS-023 — Synchronize dashboard outline and grid ordering

- Depends on: FS-022.
- Use the shared sorter for grid widgets in the outline; implement deterministic geometry repacking after semantic reorder and visible-array synchronization after spatial moves. Finalize event isolation across both drag engines.
- Acceptance: outline reorder changes grid positions and narrow-screen order; grid movement updates semantic order; hidden entries/rectangles remain valid. Save/login reproduces both. Browser checks prove task/gallery dragging, section dragging, grid movement, and resize do not activate one another; canceled gestures do not dirty a clean workspace.

## M7 — Templates and presentation

### FS-024 — Curate the three system templates

- Depends on: FS-023.
- Replace starter seed content with distinct Productivity, Analytics, and Creative designs using the same schema/registry. Across the templates include grid and stack sections, all widget types, and enough compatible containers to demonstrate cross-container moves. Add client preview/select/apply and Restore default.
- Acceptance: all template fixtures validate; seed updates system content deliberately by key without touching user workspaces. Applying/resetting remaps every entity/reference ID and changes draft only; Cancel restores the prior baseline. Each template is visually complete at desktop and narrow widths.

### FS-025 — Save and manage private custom templates

- Depends on: FS-024.
- Add name/snapshot creation from the current draft, own-template listing/apply/delete, loading/error/empty states, and dirty-draft replacement confirmation.
- Acceptance: template creation leaves workspace revision/baseline unchanged, including while the workspace is dirty. Apply regenerates entity IDs consistently. Another account never sees the custom snapshot; deleting it does not affect the current workspace. A save-in-flight blocks template replacement.

### FS-026 — Finish responsive presentation and accessibility

- Depends on: FS-025.
- Refine shell spacing, typography, widget content, empty/loading/error states, color feedback, panel scrolling, and keyboard focus. Test 1440/1024/768/390 px and both navigation orientations. Respect reduced motion; give sorting status announcements and clear labels.
- Acceptance: no page-level horizontal overflow in Preview; desktop panels leave a usable measured grid; mobile editing limits are explained. Every supported sorter has keyboard or Move controls, visible focus, and meaningful labels. Property/theme edits and normal widget interaction remain reachable.

## M8 — Optional history and final handoff

### FS-027 — Optional bounded Undo/Redo

- Depends on: FS-026. Optional; record included or deferred, with reason.
- Add at most 30 config snapshots using existing command transaction boundaries; expose Undo/Redo only in Edit.
- Acceptance if included: one completed drag/color gesture/text-focus session/template application is one step; undo/redo never writes to the backend; new edits clear redo; Cancel/load/account switch clear history. Undo after Save creates a dirty draft. Required behavior must remain intact if this task is deferred.

### FS-028 — Verify the demonstration and write the implementation handoff

- Depends on: FS-026; FS-027 must be completed or explicitly deferred.
- Run the brief's full acceptance scenario with two accounts and two tabs. Finish browser regression coverage for persistence, every supported sortable group, one example per cross-container transfer family, rejection/cancellation, conflicts, and unknown widgets. Document fresh-clone setup, migrations/seeding, environment settings, exact validation commands, known limitations, and a short management demonstration script.
- Acceptance: frontend type check/production build and focused suites pass; backend tests pass on temporary SQLite; browser suite passes; required AC-01–AC-13 are evidenced and optional AC-14 is classified. Repository contains no credentials/database artifacts. Fresh-clone PowerShell instructions are reproducible; no unrelated service or feature has been added.
