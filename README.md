# FlexSpace — Personal Workspace Builder

React + TypeScript + Vite frontend and FastAPI + SQLAlchemy + SQLite backend. Planning docs are in [docs/](docs/); progress is tracked in [docs/tasks.md](docs/tasks.md).

**Current status:** FS-001 (scaffold), FS-002 (config v1 contract) and FS-003 (database) FS-004 (credentials and registration service) FS-005 (session auth and CSRF) FS-006 (workspace read/save API) and FS-007 (template API) complete. The backend (milestone M2) is feature-complete. FS-008 adds the frontend sign-in/registration screens and protected workspace loading. FS-009 adds the editor domain state (saved baseline vs draft, commands, save lifecycle). No editor features yet.

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
