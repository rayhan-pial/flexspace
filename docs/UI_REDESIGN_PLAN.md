# FlexSpace UI redesign plan

Status: planning only, 2026-11-24. No application source changes are part of this handoff. Read [UI design specification](UI_DESIGN_SPEC.md), execute [redesign tasks](UI_REDESIGN_TASKS.md), and use the [acceptance checklist](UI_ACCEPTANCE_CHECKLIST.md).

## 1. Evidence and current state

The repository contains a complete React/FastAPI application, six widget implementations, shared sorting, schema validation, and extensive test coverage. [handoff.md](handoff.md) and [tasks.md](tasks.md) record completion of FS-001–FS-028, including Undo/Redo. The handoff records **264 backend tests, 754 frontend tests in 51 files, clean typecheck/lint, a successful build, and 15 passing browser scripts on 2026-11-23**, including a fresh-copy run. The build retained a chunk-size advisory. These are recorded implementation results, not tests rerun during this design audit.

Preserve the original brief, architecture, implementation plan, task history, contracts, and handoff. The original brief's empty-repository description is historical; it does not describe the current application. Source inspection also reveals that README/handoff “read-only preview” wording is broader than actual behavior: task checks and Notes edits remain possible in Preview, including mobile. Preserve those interactions and make the save guidance clear.

The supplied concept is retained as [design inspiration](design/flexspace-ui-concept.png), not a functionality specification. Its rounded surfaces, hierarchy, indigo identity, inspector grouping, and template previews are useful. Its full-name field, password recovery, remember-me, notification/search controls, radius slider, theme-mode selector, and percentage-growth chart are not evidence of supported features.

## 2. Current UI audit

Paths below are relative to `frontend/src/`.

| Area and evidence | Reuse | Redesign need |
| --- | --- | --- |
| `features/workspace/WorkspaceGate.tsx` | Protected loading, account identity, logout/dirty confirmation, invalid-schema errors | Current simple brand/account header becomes compact persistent application chrome. |
| `features/workspace/EditorShell.tsx` | Editor lifecycle, history hooks, single `SortProvider`, measured canvas composition | Header, toolbar, large title/revision card, and panels consume canvas space; consolidate hierarchy. |
| `features/editor/EditorToolbar.tsx` | Save/Cancel/Undo/Redo, errors, conflict recovery, mode controls, disabled states | Standardize controls and statuses; keep essential actions reachable and shorten routine copy. |
| `features/editor/EditorPanels.tsx` | Existing outline, library, properties, theme, templates | Replace competing tab stacks with purposeful destinations and one contextual inspector; avoid a fourth permanent pane. |
| `features/workspace/WorkspaceView.tsx`, `theme.ts`, `appearance.ts` | JSON traversal, workspace theme variables, safe widget overrides | Existing theme boundary is sound. Preserve it while adding a separate editor token system. |
| `features/workspace/SimpleNav.tsx` | Saved placement, primary/secondary groups, selection, section targets, sortable navigation | Style as user-owned workspace navigation, visually distinct from the permanent application rail. |
| `features/workspace/registry.ts`, `WidgetRenderer.tsx`, `WidgetShell.tsx` | Six trusted renderers, safe unknown fallback, appearance, stable IDs, selection, handles | Refine shared card/header rhythm and type identity before polishing widget bodies. |
| `features/editor/WidgetProperties.tsx`, `InspectorPanel.tsx`, `LifecycleActions.tsx` | Typed commands, property descriptors, custom inspectors, hide/show/remove | Group existing controls into Content, Appearance, Layout, Visibility, and supported actions. |
| `features/editor/LibraryPanel.tsx` | Registry types, target-section resolution, add/select logic | Six text buttons need searchable, informative component cards and clear destination feedback. |
| `features/editor/TemplatesPanel.tsx` | Private/system APIs, summaries, snapshot/apply/delete, replacement blockers | Radio rows/text summaries need a gallery and truthful config-derived thumbnails. |
| `features/auth/AuthScreen.tsx` | Email/password validation, pending/errors, sign-in-again and frozen-draft handling | Add strong branding, spacing, and form hierarchy without unsupported authentication fields. |
| `shared/ui/fields.tsx`, `Tabs.tsx`, `ConfirmDialog.tsx` | Labels, validated intermediate input, color picker, tabs, confirmation semantics | Centralize visual primitives; generalize overlay accessibility before adding rich dialogs. |
| `index.css` and repeated utility strings | Tailwind, required grid/resize styles, reduced-motion rules | Introduce shared UI tokens and states; keep persisted geometry unchanged. |

## 3. Frontend changes and protected contracts

Use presentation changes around the existing feature modules. No new routing system, workspace copy, server endpoint, database migration, or schema version is required.

**Application shell:** create a small `features/workspace/ApplicationRail.tsx` and transient editor-view state owned by the shell. Rail destinations are My Workspace, Outline, Components, Templates, and Appearance; account/logout controls stay reachable. Components opens the library modal, Templates opens the gallery modal, and Outline/Appearance select the inspector view. Omit a nonfunctional Settings destination.

At viewport widths ≥1440 px, use a 192 px application rail, flexible canvas, and 304 px inspector. At 1024–1439 px, use a 64 px compact rail; inspector width is 280 px until 1280 px and 304 px thereafter. Existing outline content moves into the contextual area rather than adding another column. Keep actual container-width measurement for the grid.

**Theme boundary:** introduce `--ui-*` variables for application chrome; retain existing `--fs-*` variables scoped to `.fs-themed`. Workspace colors/fonts never style toolbars, dialogs, form labels, or account controls. Renderer portals and template previews must retain the correct boundary. Shared primitives may expose deliberate workspace variants rather than inheriting editor colors accidentally.

**Preview:** remove rail, inspectors, builder actions, selection, and handles. Keep a minimal application-owned return/account/save-status strip outside the themed workspace. Switching modes neither saves nor discards. Preserve task checks and Notes edits; dirty users receive honest guidance about desktop Save/Cancel. Do not add mobile autosave or imply that opening another device transfers an unsaved in-memory draft.

**Navigation:** `SimpleNav` remains data-owned, while the application rail remains code-owned. Preserve adaptive side-navigation thresholds: 1400 px in Edit and 1024 px in Preview. Below those thresholds side-configured navigation reflows horizontally; do not claim an always-visible side column.

Freeze these behavior boundaries through every phase:

- `features/editor/editorStore.ts`, `workspaceSync.ts`, `applyTemplate.ts`: owner/epoch guards, immutable saved/draft state, history transactions, conflicts, in-flight-save behavior, replacement confirmations.
- `features/auth/sessionStore.ts` and `api/*`: sessions, CSRF, per-user isolation and response handling.
- `domain/workspace/*`, `contracts/`, registry dispatch: current JSON, defaults, limits, unknown preservation, schema errors and ID remapping.
- `features/sorting/SortProvider.tsx`, `SortableSection.tsx`, `workspaceAdapter.ts`, `resolveDrop.ts`: one provider, transient preview, compatible type rules, cancellation and atomic commit.
- `features/workspace/GridSection.tsx`: 12 columns, 32 px rows, 16 px gaps; separate move/resize handles; commit-on-stop; responsive presentation does not write geometry.

The existing `GridHandle.tsx` already supports arrow/Shift-arrow keyboard move/resize. It lacks a drag-free single-pointer alternative. UI-007 can show a Layout readout; UI-014 adds small inspector position/size buttons using the existing `nudgeWidget` domain operation. These are new frontend controls over existing geometry, with validation/gesture/history behavior preserved and no schema change.

## 4. Dependencies and unsupported controls

Keep existing React, Tailwind, Lucide, react-colorful, grid, and dnd-kit versions. Extend `shared/ui/` with a small Button/IconButton, field styles, status surface, and general dialog/overlay composition as needed. These are proposed files/components; inspect existing names before creating them.

[shadcn/ui](https://ui.shadcn.com/docs) offers editable component source and useful visual defaults. [Radix Dialog](https://www.radix-ui.com/primitives/docs/components/dialog) supplies modal focus management, announcements, and keyboard behavior. Their benefits are relevant, but adopting them now also adds dependencies, source conventions, styling adaptation, and regression work across existing forms/dialogs. Recommendation: **do not introduce either in this redesign**. First generalize the small existing overlay layer and test focus containment/restoration, Escape, background inertness, scroll locking, and stacked confirmation behavior. `ConfirmDialog` currently assumes two focusable action buttons; do not reuse that trap unchanged for a gallery or library. Revisit a narrow dialog dependency only if the existing approach cannot pass those accessibility checks.

Use fixed component radius/spacing tokens, not new persisted properties. No dark/system mode, background-image uploader, arbitrary styling, time-series analytics, account-profile form, or new authentication workflow. Appearance edits remain the four supported theme colors, allowlisted font family/base size, supported widget overrides, and navigation placement.

## 5. Incremental phases

| Phase | Tasks | Exit evidence |
| --- | --- | --- |
| P0: establish baseline | UI-001 | Current routes, user flows, screenshots, check commands, scratch-data setup and existing failures recorded. |
| P1: visual foundation | UI-002–UI-004 | Separate tokens, reusable controls, accessible overlays pass targeted checks without behavior changes. |
| P2: editor shell | UI-005–UI-007 | Three-area desktop shell, clean Preview, contextual inspector and all existing actions work. |
| P3: discovery panels | UI-008–UI-010 | Component library, supported Appearance controls, and real template gallery use existing commands/services. |
| P4: widgets and gestures | UI-011–UI-014 | Six polished widgets retain content; every supported sorting family and grid resize has consistent states. |
| P5: remaining surfaces | UI-015–UI-017 | Authentication, responsive behavior, keyboard access and final visual polish are coherent. |
| P6: regression and demo | UI-018 | Integrated functional, persistence, visual and accessibility evidence is complete. |

Claude should start with **P0 / UI-001**. Capture the functional baseline before changing tokens or moving controls. Keep each task's evidence in the new redesign task list; preserve the original FS completion history.

## 6. Regression prevention

Prioritize theme leakage, canvas width changes, nested drag conflicts, inaccessible modal layering, hidden inspector controls, changed browser locators, and accidental state resets during panel changes. Keep stable data IDs and meaningful accessible names. Existing tests may need selector updates for intentional presentation changes; assert the same behavior instead of deleting coverage.

Run targeted checks after each task and broader integration checks at phase boundaries. Final verification includes typecheck, lint, build, frontend tests, backend tests, and all existing browser scripts against a scratch database. Add screenshots and manual review for visual quality; a passing build is insufficient evidence of layout/accessibility. No screenshot or prior recorded test run proves the redesigned application works.
