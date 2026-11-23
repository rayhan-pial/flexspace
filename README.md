# FlexSpace — Personal Workspace Builder

React + TypeScript + Vite frontend and FastAPI + SQLAlchemy + SQLite backend. Planning docs are in [docs/](docs/); progress is tracked in [docs/tasks.md](docs/tasks.md).

**Current status:** FS-001 (scaffold), FS-002 (config v1 contract) and FS-003 (database) FS-004 (credentials and registration service) FS-005 (session auth and CSRF) FS-006 (workspace read/save API) and FS-007 (template API) complete. The backend (milestone M2) is feature-complete. FS-008 adds the frontend sign-in/registration screens and protected workspace loading. FS-009 adds the editor domain state (saved baseline vs draft, commands, save lifecycle). FS-010 connects explicit Save/Cancel to the API with conflict handling, unsaved-change guards and session-expiry recovery; you can already rename your workspace, Save it, log out and see it again after logging in. FS-011 adds the registry renderer: your workspace's sections and widgets are drawn from the saved JSON, Notes widgets are editable and persist, and widgets the app does not know are kept safely. FS-012 adds the editor shell: an Edit/Preview switch, a component outline, panels for properties/theme/templates (placeholders for now), and selection that stays in sync between the outline and the canvas. Editing needs a window at least 1024 px wide; narrower windows show a Preview. FS-013 adds component and section lifecycle: add any of the six widget types from the Library, hide/show and remove widgets, and add, rename, hide/show or remove sections (removing a section clears navigation items that pointed at it). Cancel undoes all of it until you Save. FS-014 adds the Properties inspector (titles, note text, per-widget colours and font size), a Theme tab (colours, font family and size applied live) and navigation settings (placement top/left/right, plus each link's label, target and icon). FS-015 adds drag and resize: in Edit mode on a desktop-width window, drag a widget by its grip handle and resize it from its bottom-right corner (or focus the handle and use the arrow keys; Shift+arrow resizes). Moves persist with Save. FS-016 completes the Welcome widget (greeting and subtitle, edited in Properties) and the Tasks widget (add, rename, check and delete tasks; checking also works in Preview). FS-017 completes the Gallery widget (pick from six bundled images, with alt text and captions) and the Analytics widget (labelled numbers with bars); both are edited in the Properties panel. FS-018 completes the Calendar widget (a month grid you can browse freely, plus an agenda; the starting month and the events are edited in Properties) and adds a limit warning to Notes. All six widget types now work. FS-019 makes the navigation reorderable: in Edit mode drag an item by its grip (or focus the grip and use Space and the arrow keys, or use Move up, Move down and Move to Secondary in the item's properties) to reorder it or move it between the Primary and Secondary groups, including an empty one. FS-020 does the same for sections (drag the grip beside a section title) and for the cards of stack sections, which can also be moved into other stack sections, including empty ones; unsupported widgets can only be reordered inside their own section. FS-021 makes task rows and gallery tiles sortable too: drag a task or image by its grip to reorder it, or into another Tasks or Gallery widget (including an empty one); a task can never end up in a gallery or the reverse. The Properties panel has matching Move buttons. FS-022 does the same for the metric cards of an Analytics widget and the agenda of a Calendar, which can be reordered inside their own widget only (the calendar's day grid always stays in date order). FS-023 ties the outline to the dashboard grid: drag a widget in the outline (or use Move up and Move down in its properties) and the visible widgets of that section are repacked in that order; move a widget on the canvas and the outline follows. Below desktop width the page shows that same order. FS-024 replaces the starter content with three designs, Productivity, Analytics and Creative: the Templates tab previews each one, applies it to your draft (you still choose Save, and Cancel brings back what you had) and has Restore default. Existing accounts and saved workspaces are never touched; the deploy script refreshes only the ready-made templates. FS-025 lets you save your current draft as a private template (name it, and it appears under Your templates), apply it later, or delete it; saving a template never changes or saves your workspace, and other accounts cannot see it. FS-026 polishes presentation: the editor fits from 1024 px with panels that scroll on their own, nothing scrolls sideways down to phone width (below 1024 px you get a read-only preview with an explanation), every control shows keyboard focus, dragging can be done with Space and the arrow keys with spoken status messages, and animations stop when your system asks for reduced motion. FS-027 adds Undo and Redo (up to 30 steps) in Edit mode: a typed edit, a colour drag, a drag-and-drop or a template is one step, the shortcuts are Ctrl+Z and Ctrl+Shift+Z, and nothing is saved or sent until you press Save (Cancel clears the history).

## Prerequisites

- Node.js 20+ LTS (tested on 24) and npm
- Python 3.12+ (tested on 3.12.8)

## Install (PowerShell, from the repo root)

```powershell
# Backend
py -3.12 -m venv backend\.venv        # or use any Python 3.12+ interpreter
backend\.venv\Scripts\python -m pip install -r backend\requirements-dev.txt
Copy-Item backend\.env.example backend\.env

# Create/upgrade the SQLite database and seed the system templates (safe to re-run)
cd backend; .venv\Scripts\python scripts\init_db.py; cd ..

# Frontend
cd frontend; npm install; cd ..
```

## Run (two terminals)

```powershell
# Terminal 1 - API on http://127.0.0.1:8000
cd backend
.venv\Scripts\python -m uvicorn app.main:app --reload

# Terminal 2 - SPA on http://localhost:5173 (proxies /api to the backend)
cd frontend
npm run dev
```

Open http://localhost:5173, create an account and you land in your saved workspace summary (the visual editor arrives in later tasks). Use `http://localhost:5173` or `http://127.0.0.1:5173` (both are allowed origins) and keep `FLEXSPACE_COOKIE_SECURE=false` in `backend/.env` for plain-HTTP development. API docs: http://127.0.0.1:8000/api/docs.

## Test and check

```powershell
# Backend tests
cd backend; .venv\Scripts\python -m pytest

# Frontend: unit tests, type check, lint, production build
cd frontend
npm test
npm run typecheck
npm run lint
npm run build
```

### Real-browser check (grid drag and resize)

`npm run test:browser` drives a real Chromium-family browser through the grid gestures, the Welcome/Tasks, Gallery/Analytics and Calendar/Notes widgets, navigation, section, card, task, image, metric and agenda sorting, Save, reload and logout/login. It registers a throwaway account, so use a scratch database, and it needs the API and the dev server running:

```powershell
# Terminal 1 - API with a scratch database
cd backend
$env:FLEXSPACE_DATABASE_URL = 'sqlite:///./e2e.db'; $env:FLEXSPACE_COOKIE_SECURE = 'false'
.venv\Scripts\python scripts\init_db.py
.venv\Scripts\python -m uvicorn app.main:app

# Terminal 2 - SPA
cd frontend; npm run dev

# Terminal 3 - the browser test (defaults to Edge; set E2E_BROWSER to another Chrome/Edge executable)
cd frontend; npm run test:browser
```

## Config contract

The workspace JSON v1 contract, shared fixtures and exported JSON Schema live in [contracts/](contracts/README.md). Regenerate the schema after changing backend models: `cd backend; .venv\Scripts\python scripts\export_schema.py`.

Use PowerShell for the commands above; running Vitest from Git Bash with an absolute `/c/...` path can break module resolution.

## Authentication API

`POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`. Sessions are HttpOnly SameSite=Lax cookies; every browser POST/PUT/DELETE must send an allowed `Origin`, and authenticated ones also an `X-CSRF-Token` (returned as `csrfToken` by register/login/me). Session cookies are `Secure` by default: `backend/.env.example` sets `FLEXSPACE_COOKIE_SECURE=false` for plain-HTTP localhost, so keep that line when copying it to `.env`. Add your real origin to `FLEXSPACE_ALLOWED_ORIGINS` (JSON list) when deploying.

## Workspace API

`GET /api/workspace` returns `{id, revision, updatedAt, config}` for the signed-in user. `PUT /api/workspace` with `{baseRevision, config}` (plus the CSRF header) validates the config and saves it only if `baseRevision` is still current; otherwise it returns 409 `revision_conflict` with `details.currentRevision`. Configs are limited to 1 MiB. The SQLite database runs in WAL mode, so `*.db-wal` / `*.db-shm` files appear next to it (git-ignored).

## Template API

`GET /api/templates` (system templates plus your own), `GET /api/templates/{id}`, `POST /api/templates` with `{name, config}` (private snapshot of a config; never touches your workspace), `DELETE /api/templates/{id}` (own custom templates only; system templates return 403, other users' templates 404).

## Dependency locking

- Frontend: `frontend/package-lock.json` (React Grid Layout v2, `@dnd-kit/react`, Zustand, react-colorful, lucide-react, Tailwind v4).
- Backend: direct dependencies in `backend/requirements.in`; fully pinned `backend/requirements.txt` generated with `pip-compile`. Regenerate with `pip install pip-tools` then `pip-compile requirements.in -o requirements.txt`.

## Configuration

Backend settings use the `FLEXSPACE_` prefix (see `backend/.env.example`). Set `VITE_BACKEND_URL` to point the Vite proxy at a different backend.
