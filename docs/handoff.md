# FlexSpace implementation handoff

This is the closing record of the implementation (FS-001 to FS-028). It says how to set the project up from a fresh clone, how to prove it works, where each acceptance criterion is evidenced, what is not included, and how to demonstrate it in about ten minutes. Per-task evidence stays in [tasks.md](tasks.md); the design is in [architecture.md](architecture.md).

## 1. Fresh-clone setup

Prerequisites: Node.js 20+ and npm (tested on 24), Python 3.12+ (tested on 3.12.8), and for the browser suite Microsoft Edge or another Chromium-family browser. All commands are PowerShell, from the repository root.

```powershell
py -3.12 -m venv backend\.venv        # see the README if `py` cannot find 3.12
backend\.venv\Scripts\python -m pip install -r backend\requirements-dev.txt
Copy-Item backend\.env.example backend\.env
cd backend; .venv\Scripts\python scripts\init_db.py; cd ..
cd frontend; npm ci; cd ..
```

- **Migrations and seeding.** `scripts\init_db.py` runs the Alembic migrations (`backend\migrations`) and then `sync_system_templates`, which inserts or refreshes the three system templates by `system_key`. It prints how many it wrote (3 the first time, 0 afterwards), is safe to repeat, and never reads or writes user workspaces or custom templates. Re-run it after pulling changes to the designs.
- **Run.** `cd backend; .venv\Scripts\python -m uvicorn app.main:app --reload` and, in a second terminal, `cd frontend; npm run dev`. Open http://localhost:5173.
- **Environment settings** (prefix `FLEXSPACE_`, read from `backend\.env`; defaults in `backend\app\core\settings.py`):

| Setting | Default | Notes |
| --- | --- | --- |
| `FLEXSPACE_DATABASE_URL` | `sqlite:///./flexspace.db` | The SQLite file lives in `backend\` (git-ignored, WAL mode). |
| `FLEXSPACE_COOKIE_SECURE` | `true` | `.env.example` sets `false` for plain-HTTP localhost. Keep `true` when serving over HTTPS. |
| `FLEXSPACE_ALLOWED_ORIGINS` | the two localhost origins | JSON list. Add the real origin when deploying. |
| `FLEXSPACE_SESSION_COOKIE_NAME` | `flexspace_session` | |
| `FLEXSPACE_SESSION_TTL_HOURS` | `8` | |
| `VITE_BACKEND_URL` | `http://127.0.0.1:8000` | Frontend dev proxy target. |

There are no secrets to configure: sessions are server-side rows with an HttpOnly cookie plus a CSRF token, and passwords are hashed.

## 2. Validation commands and recorded results

Recorded on 2026-11-23, both in the development tree and in a **fresh copy** made from exactly the files a clone contains (304 files: no `.venv`, `node_modules`, `.env` or database), following section 1 literally.

| Check | Command | Result |
| --- | --- | --- |
| Backend tests (temporary SQLite) | `cd backend; .venv\Scripts\python -m pytest` | 264 passed |
| Type check | `cd frontend; npm run typecheck` | clean |
| Lint | `npm run lint` | clean |
| Frontend tests | `npm test` | 754 passed in 51 files |
| Production build | `npm run build` | built (one chunk-size advisory, see section 5) |
| Real-browser suite | `npm run test:browser` (API with a scratch database and `npm run dev` running; see the README) | 15 of 15 scripts print `OK` |
| Seeding | `init_db.py` twice | wrote 3 template(s), then 0 |

Repository hygiene: no `.db`, `.sqlite`, `.env`, image or credential-like string is tracked, and none was ever committed (checked across the whole git history). `backend\.env`, `*.db*` and the browser suite's failure screenshot are git-ignored.

## 3. Acceptance evidence (AC-01 to AC-14)

"Browser" means a script in `frontend/e2e/`, run against the real backend in Edge. "Unit" means Vitest, "backend" means pytest. `acceptance.mjs` is the brief's demonstration run (two accounts, two tabs).

| AC | Evidence |
| --- | --- |
| AC-01 Register, log in, log out | Backend `test_auth_api.py`, `test_auth_service.py`; unit `sessionStore.test.ts`, `App.test.tsx`; browser `acceptance.mjs` (register, logout ends the server session, login) |
| AC-02 Private workspace | Backend `test_workspace_api.py`, `test_templates_api.py` (401 anonymous, 404 for another user's template, ownership never taken from the client); browser `acceptance.mjs` and `custom-templates.mjs` (second account sees its own workspace and gets 404 for A's template) |
| AC-03 Edit and Preview | Unit `EditorShell.test.tsx`, `WorkspaceView.test.tsx`; browser `acceptance.mjs` (Preview removes the panels, switching modes sends no write and keeps the draft) |
| AC-04 Widgets: add, hide, show, remove | Unit `Lifecycle.test.tsx`; browser `acceptance.mjs`, `welcome-tasks.mjs`, `gallery-analytics.mjs`, `calendar.mjs` (all six types persist) |
| AC-05 Move and resize | Unit `GridSection.test.tsx`; browser `grid-gesture.mjs` (real pointer drag and resize, no overlap, mount and resize create no unsaved change, persisted after reload) |
| AC-06 Reorder every group | Browser `nav-sorting.mjs` (top, left, right), `sections-sorting.mjs` (sections and stack cards), `lists-sorting.mjs` (tasks and gallery), `entries-sorting.mjs` (metrics and agenda), `outline-grid.mjs` (dashboard order through the outline); keyboard and Move buttons in each, spoken status in `accessibility.mjs` |
| AC-07 Compatible moves | Browser `nav-sorting.mjs` (primary to secondary, including an empty group), `sections-sorting.mjs` (card between stacks), `lists-sorting.mjs` (task between Tasks widgets, image between galleries, empty target, a task dragged onto a gallery and a tile onto Tasks change nothing, cancelled and outside drops change nothing); unit `sorting*.test.tsx`, `SortProvider.test.tsx` |
| AC-08 Appearance and properties | Unit `Properties.test.tsx`, `theme.test.ts`, `appearance.test.ts`; backend schema validation of colors and fonts; browser `acceptance.mjs` (primary color, font, size, placement persist through logout and login) |
| AC-09 Templates | Backend `test_system_templates.py`; unit `Templates.test.tsx`, `CustomTemplates.test.tsx`; browser `templates.mjs` (three distinct designs, apply, Cancel), `custom-templates.mjs`, `acceptance.mjs` (save a snapshot without saving the workspace, apply Creative and Cancel, apply Analytics and Save, restore default and Cancel) |
| AC-10 Deliberate saving and errors | Unit `workspaceSync.test.ts`, `saveFlow.test.tsx`, `editorStore.test.ts`; backend revision tests; browser `acceptance.mjs` (second tab's stale save gets a conflict, keep editing then saving again conflicts again, nothing is overwritten, Reload latest after confirmation) |
| AC-11 Return to my workspace | Browser `acceptance.mjs` (entire saved config identical after logout and login; Cancel never appears after reload), `persistence.test.tsx` |
| AC-12 Old configurations | Unit `registry.test.ts`, contract fixtures in `contracts/fixtures` run by both runtimes; browser `acceptance.mjs` (an unknown widget type shows a placeholder and its data survives a later save; a newer schema opens no editor and replaces nothing) |
| AC-13 Responsive and professional | Browser `responsive.mjs` (three designs, three navigation placements, 1440, 1024, 768 and 390 px, Preview and Edit: no sideways scrolling or clipped widgets), `accessibility.mjs` (276 controls with visible focus and a name, keyboard sorting, reduced motion), `templates.mjs` (visually complete designs) |
| AC-14 Undo and Redo (optional) | **Included.** Unit `editorHistory.test.ts`, `History.test.tsx`, `historyControls.test.ts`; browser `undo-redo.mjs` (typed edit, colour drag, drag and template are one step each; no network write; Cancel clears history) |

## 4. Where things are

- `backend/app` FastAPI application (`api`, `services`, `repositories`, `schemas`, `db`, `core`), `backend/migrations` Alembic, `backend/scripts` (`init_db.py`, schema and fixture exporters), `backend/tests`.
- `contracts/` the workspace JSON v1 contract: JSON Schema, and the valid and invalid fixtures that both the backend and the frontend normalize.
- `frontend/src/domain/workspace` pure commands (reorder, lifecycle, placement, instantiate); `features/editor` store, panels and history; `features/sorting` the single drag provider and adapters; `features/workspace` shell, view, grid and navigation; `widgets/` one folder per widget type behind the registry; `frontend/e2e` the browser scripts.

## 5. Known limitations

- **Scope.** Single-user editing per account with conflict detection, not collaboration. Gallery images are bundled assets, not uploads; Analytics and Calendar use local sample data. No password recovery or email verification. SQLite only (PostgreSQL and hosting automation are not part of this release).
- **Editing needs 1024 px or wider.** Narrower windows show a read-only Preview with an explanation.
- **Accessibility.** Keyboard sorting, Move buttons, focus rings, names and spoken status are covered by the audit, but there was no test with a real screen reader. At 1280 px and wider the outline panel is on the left visually but after the canvas in tab order.
- **History.** 30 steps, in memory only: it does not survive a reload, and there is no list of steps.
- **Drag in Edit mode** is verified with Edge (Chromium). Other browsers were not tested.
- **Build advisory.** The production bundle triggers Vite's chunk-size warning (the drag-and-drop library); it was left alone rather than adding code splitting.
- **Unexplained test flake.** An intermittent partial Vitest run (about 505 of 674 tests, seen during FS-017 and once during FS-024) could not be reproduced and is recorded here (it was not written into `tasks.md` at the time). It did not occur in any of the final full runs; if it appears, re-run `npm test` on its own and capture the whole output before changing anything.
- **Playwright names.** The browser scripts match accessible names by substring, so new controls whose names begin with an existing name (for example another button starting with "Save") need exact matching in the scripts.

## 6. Management demonstration (about ten minutes)

Start both servers and open http://localhost:5173 in a window at least 1440 px wide.

1. **Sign up** with any email and a long password. You land in a ready Productivity workspace. Point out Edit and Preview and the component outline.
2. **Build.** In the Library add a Calendar. Drag a widget by its handle and resize it. Type in the Notes widget. In Theme change the primary color and font; in the outline switch the navigation between top, left and right.
3. **Reorder anything.** Drag a section by its grip, then do the same with the keyboard (focus the grip, Space, arrow, Space) and mention the spoken status. Reorder tasks. Use Move to Secondary on a navigation item. Show that dragging a task onto an image gallery does nothing.
4. **Undo.** Press Ctrl+Z and Ctrl+Shift+Z; one typed edit or one drag is one step.
5. **Hide, show, remove** a widget, switch to Preview and back: nothing is lost, nothing is saved yet (the status says "Unsaved changes").
6. **Save, log out, log in.** Everything is back. Change the theme and press Cancel: the saved look returns.
7. **Templates.** Save the current design as "My design". Apply Creative, then Cancel. Apply Analytics, then Save. Restore default, then Cancel. Resize the window to 768 and 390 px to show the responsive preview and the explanation of why editing is unavailable.
8. **Isolation and safety.** In a private window register a second account: it has its own workspace and cannot see "My design". Back in the first account open a second tab, save a change in the first, then change and save in the second: it gets a conflict instead of overwriting.

To show the same flow automatically, run `npm run test:browser` (see the README); the last script, `acceptance.mjs`, performs steps 1 to 8 and the unknown-widget and newer-schema checks.
