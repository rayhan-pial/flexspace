# FlexSpace — Personal Workspace Builder

React + TypeScript + Vite frontend and FastAPI + SQLAlchemy + SQLite backend. Planning docs are in [docs/](docs/); progress is tracked in [docs/tasks.md](docs/tasks.md).

**Current status:** FS-001 (scaffold) complete. No editor features yet.

## Prerequisites

- Node.js 20+ LTS (tested on 24) and npm
- Python 3.12+ (tested on 3.12.8)

## Install (PowerShell, from the repo root)

```powershell
# Backend
py -3.12 -m venv backend\.venv        # or use any Python 3.12+ interpreter
backend\.venv\Scripts\python -m pip install -r backend\requirements-dev.txt
Copy-Item backend\.env.example backend\.env

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

Open http://localhost:5173; the card should show "Backend healthy". API docs: http://127.0.0.1:8000/api/docs.

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

## Dependency locking

- Frontend: `frontend/package-lock.json` (React Grid Layout v2, `@dnd-kit/react`, Zustand, react-colorful, lucide-react, Tailwind v4).
- Backend: direct dependencies in `backend/requirements.in`; fully pinned `backend/requirements.txt` generated with `pip-compile`. Regenerate with `pip install pip-tools` then `pip-compile requirements.in -o requirements.txt`.

## Configuration

Backend settings use the `FLEXSPACE_` prefix (see `backend/.env.example`). Set `VITE_BACKEND_URL` to point the Vite proxy at a different backend.
