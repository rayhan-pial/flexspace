# FlexSpace — Personal Workspace Builder

React + TypeScript + Vite frontend and FastAPI + SQLAlchemy + SQLite backend. Sign up, get a workspace, and shape it: add widgets, drag and resize them, reorder everything, restyle it, start from a ready-made design, and keep your own templates. Nothing is saved until you press Save.

**Status:** all 28 planned tasks (FS-001 to FS-028) are complete, including optional Undo/Redo. See [docs/handoff.md](docs/handoff.md) for what was built, the acceptance evidence, known limitations and a short demonstration script. Planning docs are in [docs/](docs/) and per-task evidence is in [docs/tasks.md](docs/tasks.md).

## What you can do

- **Edit and Preview.** Edit (desktop, 1024 px or wider) shows an application rail (My workspace, Outline, Components, Templates, Appearance), the canvas, and one inspector that shows the view you pick. Preview shows the workspace as you would use it. Narrower windows show a read-only preview.
- **Build.** Add any of six widgets (Welcome, Tasks, Notes, Gallery, Analytics, Calendar), hide, show or remove them, add sections, and choose top, left or right navigation. Unknown widget types from other versions are kept safely.
- **Arrange.** Drag and resize dashboard widgets; reorder navigation, sections, stack cards, tasks, images, metrics and agenda entries by dragging, with the keyboard (Space and arrows) or with Move buttons; move compatible items between containers. Spoken status messages announce each move.
- **Style.** Theme colors, font and size, per-widget colors, titles and content.
- **Templates.** Preview and apply Productivity, Analytics or Creative, restore the default, and save, apply or delete your own private templates. Applying only changes the draft.
- **Save deliberately.** Save, Cancel (back to the last saved version), a conflict prompt when another tab saved first, and recovery from an expired session. Undo and Redo (30 steps, Ctrl+Z / Ctrl+Shift+Z) change only the draft.

## Prerequisites

- Node.js 20+ LTS (tested on 24) and npm
- Python 3.12+ (tested on 3.12.8)
- For the real-browser suite only: Microsoft Edge or another Chromium-family browser

## Set up from a fresh clone (PowerShell, from the repo root)

```powershell
# Backend: virtual environment, pinned dependencies, local settings
py -3.12 -m venv backend\.venv
# If `py -3.12` says "No suitable Python runtime found", run `py --list`, then create the venv with any
# listed 3.12+ interpreter (for example `py -V:Astral/CPython3.12.8 -m venv backend\.venv`) or with the
# full path of a 3.12+ python.exe: `C:\path\to\python.exe -m venv backend\.venv`
backend\.venv\Scripts\python -m pip install -r backend\requirements-dev.txt
Copy-Item backend\.env.example backend\.env

# Create/upgrade the SQLite database (Alembic migrations) and seed the 3 system templates (safe to re-run)
cd backend; .venv\Scripts\python scripts\init_db.py; cd ..

# Frontend: exact versions from the lockfile
cd frontend; npm ci; cd ..
```

`backend\.env` and the `*.db` files are git-ignored; no credentials or database are committed. After pulling a change that edits the system templates, re-run `init_db.py`: it refreshes only the ready-made templates by key and never touches user workspaces or custom templates.

## Run (two terminals)

```powershell
# Terminal 1 - API on http://127.0.0.1:8000
cd backend
.venv\Scripts\python -m uvicorn app.main:app --reload

# Terminal 2 - SPA on http://localhost:5173 (proxies /api to the backend)
cd frontend
npm run dev
```

Open http://localhost:5173 and create an account. Use `http://localhost:5173` or `http://127.0.0.1:5173` (both are allowed origins) and keep `FLEXSPACE_COOKIE_SECURE=false` in `backend/.env` for plain-HTTP development.

## Test and check

```powershell
# Backend: 264 tests on temporary SQLite databases
cd backend; .venv\Scripts\python -m pytest; cd ..

# Frontend: type check, lint, 754 unit/UI tests, production build
cd frontend
npm run typecheck
npm run lint
npm test
npm run build
```

Use PowerShell for these commands; running Vitest from Git Bash with an absolute `/c/...` path can break module resolution.

### Real-browser suite (15 scripts)

`npm run test:browser` drives a real Chromium-family browser through every feature, including the brief's full demonstration run with two accounts and two tabs (`e2e/acceptance.mjs`). It registers throwaway accounts, so use a scratch database, and it needs the API and the dev server running:

```powershell
# Terminal 1 - API with a scratch database
cd backend
$env:FLEXSPACE_DATABASE_URL = 'sqlite:///./e2e.db'; $env:FLEXSPACE_COOKIE_SECURE = 'false'
.venv\Scripts\python scripts\init_db.py
.venv\Scripts\python -m uvicorn app.main:app

# Terminal 2 - SPA
cd frontend; npm run dev

# Terminal 3 - the browser suite (defaults to Edge; set E2E_BROWSER to another Chrome/Edge executable)
cd frontend; npm run test:browser
```

Each script prints one `OK:` line when it passes, and saves `e2e-failure.png` (git-ignored) when it fails. Delete `backend\e2e.db*` afterwards.

## Config contract

The workspace JSON v1 contract, shared fixtures and exported JSON Schema live in [contracts/](contracts/README.md). Regenerate the schema after changing backend models: `cd backend; .venv\Scripts\python scripts\export_schema.py`.

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
