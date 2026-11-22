# FlexSpace — Personal Workspace Builder

Status: planning only. No application implementation is authorized by this document alone. Read [architecture](architecture.md), then follow [tasks](tasks.md) after implementation is requested.

## Objective and starting point

Create a polished management demonstration where authenticated users build a personal workspace by changing data, without editing React source. A saved workspace must return after logout and login.

Workspace inspected on 2026-11-23: only `README.md` and Git metadata exist; branch `main` tracks `origin/main`. There is no application, dependency manifest, or existing architecture to preserve. This planning step adds only the four requested documents.

## Approved stack

| Area | Required technologies |
| --- | --- |
| Frontend | React, TypeScript, Vite, Tailwind CSS |
| Editing | React Grid Layout, dnd-kit, Zustand, react-colorful, Lucide React |
| Backend | Python, FastAPI, REST, SQLite, SQLAlchemy, Pydantic |
| Design | JSON renderer, component registry, versioned per-user configuration, cookie sessions |

Use a modular monorepo and one backend process. Keep dependency choices practical; do not replace the approved libraries. Version selection and lockfiles belong to implementation task FS-001.

## Product decisions

- Each account owns one workspace. Registration starts with a copy of the Productivity template.
- The renderer displays trusted React components selected by JSON `type` keys. Users edit supported properties and content, never code.
- Edit and Preview use the same draft. Switching modes neither saves nor discards it.
- Save is explicit; Cancel restores the last confirmed saved configuration. No autosave or browser-persisted drafts in this demonstration.
- Preview hides builder panels and handles, retaining an Edit workspace entry point. Navigation and calendar browsing work normally. Task checks and note edits change the draft; an unsaved status directs the user to Edit to Save or Cancel.
- Desktop editing requires a viewport of at least 1024 px. Smaller screens support a responsive workspace preview and normal widget interactions, with an explanation that layout/property editing requires desktop.
- System templates are Productivity, Analytics, and Creative. Custom templates are private snapshots owned by their creator.
- Applying a template or restoring the default changes the draft only. Restore default always means the shipped Productivity template.
- Basic Undo/Redo is a bounded, optional final enhancement; all required behavior must work without it.

## Scope and user stories

| ID | As a user, I want to… | Acceptance criteria |
| --- | --- | --- |
| AC-01 | Register, log in, and log out | Valid registration creates a user and workspace atomically; login sets a protected session cookie; logout invalidates the server session. Invalid credentials produce a generic error. |
| AC-02 | Keep my workspace private | A second account receives its own configuration. Anonymous workspace access returns 401; another user's custom template returns 404. Client-supplied ownership is never trusted. |
| AC-03 | Switch between building and using my workspace | Edit exposes library, properties, theme, templates, handles, and Save/Cancel. Preview removes builder chrome. Mode changes preserve the draft and do not send a workspace write. |
| AC-04 | Add, select, hide, show, and remove widgets | All six registered widget types can be added with unique IDs and sensible defaults. Hidden widgets remain discoverable in the component outline; removal deletes their configuration. Cancel reverses either action. |
| AC-05 | Move and resize dashboard widgets | React Grid Layout provides distinct move/resize handles in Edit. Geometry is valid and survives Save plus login; initial measurement and viewport changes do not create unsaved changes. |
| AC-06 | Reorder every supported repeated group | Navigation in top/left/right placement, workspace sections, stack cards, task rows, gallery items, analytics metrics, and calendar agenda entries all use the same sortable abstraction. Dashboard order is also editable through the outline. Keyboard or Move up/down controls are available. |
| AC-07 | Move compatible items between containers | Move a navigation item between primary/secondary groups, a card between stack sections, a task between Tasks widgets, and an image between Gallery widgets, including an empty target. Invalid type moves and canceled/outside drops make no change. IDs and content are preserved exactly once. |
| AC-08 | Customize appearance and properties | Global colors, approved font family/size, per-widget background/text colors, widget title/content, navigation labels/targets, section titles, and nav placement persist. Unsupported CSS, scripts, and executable properties cannot be entered. |
| AC-09 | Start from a template and reuse my design | All three system templates are distinct, polished, and contain useful sample content. Saving a custom template captures the current draft without saving the workspace. Applying any template changes only the draft and can be canceled. |
| AC-10 | Save deliberately and recover from errors | Dirty status reflects actual draft differences. Save success updates the saved baseline; Cancel restores it. Validation/network errors keep the draft. A stale tab cannot overwrite newer saved data silently. |
| AC-11 | Return to my personalized workspace | After editing text, content, theme, navigation, ordering, and geometry, Save → logout → login reproduces all of them. Canceled changes never appear after login. |
| AC-12 | Use old saved configurations safely | Missing optional fields receive defaults; unknown widget types show a safe placeholder and retain their data. A newer unsupported schema opens no writable editor and is never silently replaced. |
| AC-13 | View a professional responsive application | Test at 1440, 1024, 768, and 390 px. Preview has no page-level horizontal overflow. Loading, empty, saving, error, and selected states are clear; controls have labels and visible focus. |
| AC-14 | Undo a recent edit, if included | One completed gesture or property editing session is one history entry; Undo/Redo never sends network writes. This is optional and must be marked included or deferred. |

## Demonstration widgets

| Widget | Useful initial content | Persisted editable content |
| --- | --- | --- |
| Welcome | Greeting, subtitle, workspace introduction | Title, greeting, subtitle |
| Tasks | A short checklist with completed and open items | Item text, completion, item order |
| Notes | A short project note | Plain text body and title |
| Gallery | Bundled, reliable sample images with captions | Approved image selection, alt text, captions, image order |
| Analytics | Sample KPI cards and a lightweight bar visualization | Metric labels, numeric values, metric order |
| Calendar | Mini calendar and sample agenda | Display month setting, event date/title, agenda order |

Calendar dates remain a chronological calendar; the agenda is the editable repeatable group. Analytics uses local sample data, not a live integration. No file upload is needed; gallery image selection uses bundled asset keys.

## Demonstration acceptance run

1. Register user A and open the Productivity workspace; enter Edit on desktop.
2. Add a widget, move/resize it, edit text and note content, change colors/fonts, and switch navigation between top/left/right.
3. Reorder navigation, sections, stack cards, task rows, gallery images, metrics, and agenda entries. Use the outline to reorder dashboard widgets. Show one compatible cross-container move and one rejected incompatible move.
4. Hide/show a widget, remove another, switch Preview/Edit, and confirm the draft remains intact.
5. Save, log out, and log in; verify the entire workspace is restored.
6. Change the theme and Cancel; reload and verify the saved version remains.
7. Save a private custom template; apply Creative and Cancel; apply Analytics and Save; restore default and Cancel.
8. Log in as B and verify isolation. In two A tabs, show that the second stale save receives a conflict rather than overwriting the first.

## Out of scope

Microservices, Kubernetes, Redis, GraphQL, collaboration, freeform design canvases, arbitrary user code, enterprise permissions/SSO, multiple database services, public template sharing, uploads, live analytics/calendar integrations, password recovery/email verification, and production-scale operations are excluded.

Success means a reliable, visually convincing demonstration with understandable code and reproducible local setup. The demonstration does not require enterprise infrastructure.
