# Workspace config contract (v1)

Source of truth for behaviour: [docs/architecture.md](../docs/architecture.md) section 3. This folder pins it with data both runtimes must agree on.

| Path | Purpose |
| --- | --- |
| `fixtures/valid/*.json` | `{description, input, expected?}`. Both runtimes must normalize `input` to `expected` (or to `input` itself when `expected` is omitted), without mutating it, and normalizing the result again must change nothing. |
| `fixtures/invalid/*.json` | `{description, error, input}`. `error` is `invalid_config` or `unsupported_schema_version`. |
| `workspace-config.schema.json` | JSON Schema exported from the Pydantic models (documentation and drift check; cross-field invariants such as duplicate IDs and layout overlap are enforced in code, not in the schema). |

Run the checks: `cd backend; .venv\Scripts\python -m pytest` and `cd frontend; npm test`. After changing the backend models, regenerate the schema with `cd backend; .venv\Scripts\python scripts\export_schema.py`.

## Details fixed while implementing FS-002

The architecture left these open; they are now part of the contract (constants live in `backend/app/schemas/config.py` and `frontend/src/domain/workspace/constants.ts`).

- **Required vs defaulted.** `schemaVersion` and `title` are required. Missing `theme`/`navigation` fields, `sections`, section/widget `title`, `hidden`, `appearance`, `props`, nav `targetSectionId` (null) and `icon` (`home`), task `done` (false), gallery `alt`/`caption` and calendar `displayMonth` (`2026-01`) are filled. An explicit `null` is not the same as missing, except `layout: null`, which means absent.
- **IDs:** 1-64 characters of `A-Za-z0-9_-`, unique across sections, widgets, nav items and every repeatable item. Layout rectangles reference widget IDs and do not count.
- **Colours:** `#rrggbb` only. Text lengths count Unicode code points (limits: 120 / 2000 / note body 10000).
- **Icons:** `home, layout-dashboard, check-square, notebook, image, bar-chart, calendar, settings, star, folder, users, mail`. **Gallery asset keys:** `aurora, workspace, mountain, studio, forest, city` (FS-017 supplies the images).
- **Minimum grid sizes (w x h):** welcome 3x2, tasks 3x4, notes 3x3, gallery 4x4, analytics 4x3, calendar 4x5; unknown types 1x2. Grid widgets, hidden ones included, each need exactly one rectangle; only visible rectangles may not overlap.
- **Dates:** years 1900-2199; calendar-valid days (leap years honoured).
- **Opaque widgets:** unknown types keep `props` and `appearance` as JSON objects, unvalidated. Their size is bounded only by the 1 MiB document limit, which is enforced at the API boundary in FS-006.
- **Numbers:** integers must be written without a decimal point in Python-parsed JSON (`1.0` is rejected there but indistinguishable from `1` in JavaScript). Clients emit `JSON.stringify` output, so this is not reachable in practice.
