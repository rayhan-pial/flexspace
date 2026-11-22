# Implementation plan

Status: future work for Claude Code. This change contains documentation only. Start with FS-001 after implementation is requested; do not build the whole application in a single pass.

Read [brief](PROJECT_BRIEF.md) → [architecture](architecture.md) → [tasks](tasks.md). Architecture fixes the contract; tasks name bounded changes and evidence. Every milestone should leave a runnable application once the scaffold exists.

## Milestones and dependencies

| Milestone | Ordered tasks | Dependency | Demonstrable exit condition |
| --- | --- | --- | --- |
| M1 — Foundations and contracts | FS-001–FS-003 | None | Frontend/backend start; approved dependencies are locked; config fixtures and database migrations work. |
| M2 — Secure saved workspace | FS-004–FS-007 | M1 | Registration/login/logout, owner isolation, conditional Save, and template APIs pass focused backend checks. |
| M3 — First complete user flow | FS-008–FS-011 | M2 | Login loads a registry-rendered workspace; Notes can be changed, saved, restored, and canceled. Unknown widgets show a safe fallback. |
| M4 — Editor and grid | FS-012–FS-015 | M3 | Builder shell, component lifecycle, properties/theme, and grid move/resize work without accidental dirty state. |
| M5 — All widgets | FS-016–FS-018 | M4 | Six polished widgets have typed editable content and useful sample data. |
| M6 — Reusable ordering | FS-019–FS-023 | M5 | Every supported repeated group is sortable; compatible cross-container moves and grid outline ordering survive Save/login. |
| M7 — Templates and responsive finish | FS-024–FS-026 | M6 | Three distinct presets, private custom templates, reset, responsive Preview, and focused accessibility checks are complete. |
| M8 — Optional history and handoff | FS-027–FS-028 | M7 | Undo/Redo is included or explicitly deferred; required checks and management demonstration pass; setup/run instructions are complete. |

The task numbers provide an executable default order. Per-task dependencies allow independent work later, but do not bypass milestone validation. FS-010 is the early persistence proof; FS-019 and FS-023 are the drag-library integration proofs. Resolve failures there before multiplying adapters.

## Working rules for Claude Code

1. Execute one task at a time. Read its dependencies and linked contracts; inspect the current files before editing. Finish its targeted checks before advancing.
2. Keep domain commands, library adapters, and presentation separate. Reuse one sortable abstraction across navigation, sections, cards, and widget lists.
3. Treat the workspace as owner-scoped draft data. No component-local copy may become a competing persistence source; temporary form/gesture state must commit through commands.
4. Use the official documentation for the locked library versions. Preserve the chosen React Grid Layout v2 and current dnd-kit package families. Record a concrete incompatibility before proposing a stack change.
5. Add tests at the boundary a task changes, especially ownership, atomic moves, Save conflicts, and asynchronous state transitions. Avoid broad repetitive testing after already passing checks unless a new change creates a reason.
6. Update affected planning documents when a necessary contract changes; name the reason and consequence. Do not quietly add extra services or features.
7. Leave commits/pushes to the user's implementation workflow. This repository's existing Git authentication is scoped to `rayhan-ajentica`; verify with `git github-account` before any authorized push. Do not change global account configuration.
8. Keep each task reviewable: report changed areas, validation evidence, remaining limitations, and the next task ID. Mark tasks complete only after their acceptance criteria pass.

## State and integration checkpoints

- **FS-002:** shared fixtures pin JSON shape, limits, missing-field defaults, unknown widgets, and unsupported versions before endpoints/renderer diverge.
- **FS-005/FS-006:** auth cookies, CSRF, per-user queries, and a conditional SQL update protect every later persistence path.
- **FS-009/FS-010:** unit-test saved versus draft, edits during a Save, failed/ambiguous responses, and request invalidation before adding many controls.
- **FS-015:** isolate grid callbacks; mounting, resizing the window, and opening a sidebar must not mark a workspace dirty.
- **FS-019–FS-023:** test one sorter adapter first, then extend to all groups. A canceled drag must not change data, and a nested list gesture must not move its parent grid widget.
- **FS-024/FS-025:** template snapshots use the same normalization, ID remapping, and draft replacement paths as the rest of the editor.

## Risks and planned responses

| Risk | Response and proof |
| --- | --- |
| Old library examples produce incompatible imports/events | Lock compatible versions in FS-001; isolate adapters; validate against current official APIs. |
| React Grid Layout and dnd-kit compete for one gesture | Separate handles, cancel selectors, type-filtered collision targets, and nested-drag browser checks in FS-015/FS-023. |
| Two different definitions of widget order drift | Array order is semantic truth; grid moves synchronize it; outline moves deterministically repack geometry. Verify both directions in FS-023. |
| Save responses overwrite newer edits or another account's state | Capture immutable submitted snapshots and auth generation; reject stale revisions; exercise delayed responses in FS-009/FS-010. |
| JSON becomes a loosely validated dumping ground | Known prop models, bounded payloads, invariant validators, and shared fixtures; unknown types get an opaque safe fallback. |
| Cookie auth works locally but fails under HTTPS or admits CSRF | Same-origin proxy, explicit localhost cookie mode, secure deployment defaults, Origin and synchronizer-token checks in FS-005. |
| Frontend polish consumes time before persistence is proven | Complete the Notes Save/login vertical slice in M3; then refine the six-widget demo. |
| Optional history expands scope | Limit to 30 snapshots and transaction boundaries already used by commands. Defer FS-027 if it destabilizes required flows. |

## Release gate

FS-028 runs the [brief's demonstration acceptance run](PROJECT_BRIEF.md#demonstration-acceptance-run), the frontend production build/type check, focused frontend suite, backend suite on temporary SQLite, and browser acceptance suite. Record exact commands/results and any explicitly deferred optional history. A fresh clone must be runnable from documented PowerShell-friendly steps with no committed secrets/database files. PostgreSQL deployment, hosting automation, and enterprise hardening are not release prerequisites.
