# FlexSpace UI design specification

Status: implementation contract, revised 2026-11-25 after independent review and user feedback. This revision changes documentation only. Start corrective work at [UI-019](UI_REDESIGN_TASKS.md#ui-019--protect-new-edits-during-reload-latest); UI-001–UI-018 are historical implementation records, not full acceptance. Read the [audit and phases](UI_REDESIGN_PLAN.md) and [acceptance checklist](UI_ACCEPTANCE_CHECKLIST.md). Preserve JSON v1, ownership, persistence and valid data; the explicit interaction changes below supersede the old collision-blocking and implicit-Add behavior.

## 1. Direction and reference

Build a calm, recognizable workspace builder: an indigo-accented product rail, generous canvas, precise inspector, quiet surfaces, clear typography, and visible manipulation affordances. The workspace should occupy most of the screen; secondary configuration should appear when needed. Light editor chrome is the default. Use readable system sans-serif (already installed); no font dependency or remote font request is needed for the demonstration.

The supplied [concept image](design/flexspace-ui-concept.png) has been inspected and copied unchanged into documentation. It is inspiration for hierarchy, surfaces, a welcome feature, template cards, and grouped properties. It is neither a current screenshot nor evidence of working features. Adopt its structure without copying its tiny text, crowded controls, pervasive purple gradients, or fabricated capabilities.

| Reference element | Redesign decision |
| --- | --- |
| Three-area editor, violet accents, white cards | Adopt with the responsive dimensions below. |
| Large greeting and distinctive template cards | Use real widget content/configurations; decorative treatment remains subordinate to saved theme overrides. |
| Navbar reorder example | Extend the same visual language to every actually supported sorter. |
| Border-radius/spacing controls, theme Light/Dark/System switch | Omit persisted controls: schema v1 has no such fields. Radius/spacing are fixed presentation tokens. Existing dark-colored workspace themes still work. |
| Full name, forgot password, remember me | Omit; existing authentication supports email/password and a fixed session policy. |
| Search/notifications/profile initials, duplicate widget, device simulators | Do not add nonfunctional buttons or imply new services. Library search is local; use real account email and responsive browser sizes. Widget duplication/device simulation are outside this redesign. |
| Analytics time-series curve, date filter, growth percentage | Keep actual label/value metrics and bars; there is no historical series, filter, or delta in the data model. |

## 2. Two visual systems, one workspace model

- **Application chrome:** new `--ui-*` tokens, scoped editor classes, fixed system font. Includes account controls, rail, toolbar, inspector, library/templates dialogs, editing handles, and status messages.
- **Personal workspace:** retain `themeVariables()` and the `.fs-themed` boundary in `WorkspaceView.tsx`, its existing `--fs-*` variables, and per-widget `safeAppearanceStyle()`. JSON remains the source for user colors, font key/size, content, visibility, order, and geometry.
- **Full workspace coverage:** the themed canvas stage fills the available workspace column, including its minimum viewport height, outer canvas gutters, empty space, section gaps, and the user's top/left/right navigation. A small rounded themed island inside an otherwise fixed-color canvas is insufficient. The editor rail, toolbar, inspector and dialogs remain outside this boundary; do not apply user colors to the whole browser body.
- Map workspace background to `--fs-background`, widget and elevated user-navigation surfaces to `--fs-surface`, body/headings/inactive navigation labels to `--fs-text`, and active links/highlights to `--fs-primary`. Navigation labels must not all be forced to the primary color. Preserve deliberate per-widget overrides, and label them “Custom color” versus “Inherit workspace”; changing a palette never silently erases overrides.
- Never apply the saved workspace theme on `body`, `WorkspaceGate`, `EditorShell`, or a dialog portal. Overlay roots explicitly use application tokens. Shared controls rendered within user content must distinguish editing chrome from themed content.
- UI panel state (open destination, library search, expanded group) is local presentation state. It must not enter workspace JSON, affect dirty state, or recreate the draft/store. Keep the single sorting provider around canvas and sortable outline.
- Test white-on-white and dark/bright workspace customizations: app labels, Save, inspector fields, focus/selection indicators and drag handles remain usable. Honor valid user colors; give a nonblocking contrast warning when a chosen text/background pair is difficult to read. Do not silently replace the saved colors or promise arbitrary user themes meet accessibility contrast.

## 3. Application design tokens

Proposed values, expressed as CSS custom properties under the app root. Static Tailwind utilities reference these values. Do not rewrite the Tailwind setup or grid units.

| Token | Value/use |
| --- | --- |
| `--ui-bg` | `#F8FAFC`, neutral app background |
| `--ui-surface` / `--ui-surface-subtle` | `#FFFFFF` / `#F1F5F9` |
| `--ui-primary` / `--ui-primary-hover` | `#4F46E5` / `#4338CA`; primary text/icon actions and Save |
| `--ui-selected` / `--ui-selected-text` | `#EEF2FF` / `#3730A3` |
| `--ui-text` / `--ui-text-secondary` | `#0F172A` / `#64748B` |
| `--ui-border` / `--ui-control-border` | `#E2E8F0` decorative dividers / `#7C8BA1` where a control boundary needs contrast |
| `--ui-danger` / `--ui-success` / `--ui-warning` | `#B91C1C` / `#166534` / `#92400E`, paired with text/icon status |
| `--ui-radius-control` / `--ui-radius-card` / `--ui-radius-dialog` | 8 / 12 / 16 px |
| Spacing scale | 4, 8, 12, 16, 20, 24, 32, 48 px; 16 px card padding, compact variants at minimum widget size |
| Surface shadow | `0 1px 3px rgb(15 23 42 / 0.06)`; dialog `0 16px 48px rgb(15 23 42 / 0.16)` |
| Typography | App title 24/32 semibold; screen title 20/28; section 16/24 semibold; controls/body 14/20; helper 12/16; numeric KPIs 28/32 semibold, tabular numerals |
| Icons | Lucide, 16–18 px controls, 20 px navigation; consistent stroke weight; decorative icons hidden from assistive technology |
| Focus | 2 px solid indigo outline with 2 px contrasting offset; maintain visibility on both themed and unthemed surfaces |
| Motion | 120–180 ms opacity/color for controls; restrained overlay transition. No layout animation competing with drag engines. Respect existing reduced-motion rules. |

The implementation's darker secondary text (`#5B6B80`) is an approved contrast improvement over the original proposed secondary token. Retain that improvement rather than reverting it merely to match this table.

Application text contrast target is 4.5:1 for normal text and 3:1 for large text; meaningful control/focus boundaries target 3:1. Decorative borders are not sufficient control indicators by themselves. Measure final rendered combinations, including hover/error/selected states, rather than assuming token choices guarantee compliance. Follow [WCAG contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).

## 4. Desktop editor layout

Three areas, with no fourth permanently open builder pane:

```text
App navigation   | Workspace title · status · Undo/Redo · Preview · Cancel · Save
                 | Add Component · Templates · Outline/Inspector toggles
                 |                                   | Context inspector
                 | Personalized navigation + canvas  | Properties / Outline
Account / logout | Sections and real widget renderer | or Workspace appearance
```

| Viewport width | Navigation | Inspector | Canvas behavior |
| --- | --- | --- | --- |
| 1440 px and wider | 192 px labeled rail | 304 px when open | Flexible central column; 24 px gutters; use available width, no arbitrary narrow max-width |
| 1280–1439 px | 64 px icon rail, accessible names/tooltips | 304 px | 16 px gutters; collapse secondary toolbar labels first |
| 1024–1279 px | 64 px icon rail | 280 px | 16 px gutters; inspector can close to widen canvas; library/templates use dialogs |
| Below 1024 px | Editor rail/inspector absent | None | Existing effective Preview and derived stacked content; mobile details in section 10 |

The main column always uses `min-width: 0`; panels never overlay it accidentally. Inspector is a sibling column with its own scroll area, not an absolute overlay. Keep page/canvas scrolling natural; sticky header offsets must leave focused controls visible. On short screens, do not trap content behind a fixed header/footer.

App rail destinations are **My Workspace**, **Outline**, **Components**, **Templates**, **Appearance**, with brand and account/logout. These open existing functionality; no router or new page data model is required. Do not create an empty Settings destination. The compact rail has the same actions with visible focus and accessible labels. Email truncates visually with a full accessible name; do not fabricate a profile name.

Consolidate the current app header, editor toolbar, and large title/revision card visually: one page heading, compact state badge, dominant Save action. Title editing remains available in Edit via a labeled field/explicit rename action. Saved revision belongs in secondary details, not the primary canvas heading. Keep Save's accessible name unambiguous against the separate template-snapshot action.

Use DOM order matching visual reading order: rail → main toolbar/canvas → inspector. Give a skip-to-canvas link and named landmarks. Moving outline into the inspector avoids the existing left-panel-after-canvas focus-order mismatch.

## 5. Inspector and selection

Default to a helpful Properties empty state: “Select a component to customize it,” with access to Outline. Selecting a canvas widget opens its Properties when no gesture is active. Selecting an outline item preserves the Outline view until the user chooses Properties; a drag must never unmount its own source. Appearance opens a workspace-level inspector view with an explicit Back to properties action. Panel changes preserve selection and commit valid active field edits through existing editing-session boundaries.

Inspector header shows component title, type, and section. Organize existing controls as:

| Group | Contents |
| --- | --- |
| Content | Title, registry fields, and the existing widget-specific inspector (tasks, gallery, metrics, agenda). |
| Appearance | Background, text color, font size; clear “Inherit workspace”/reset affordance. |
| Layout | Grid location/size and existing keyboard instructions; UI-014 adds single-click move/resize step controls using `nudgeWidget`. Stack/nav selections show their meaningful placement/order controls instead. |
| Visibility | Existing hide/show and current state; hidden items remain selectable in Outline. |
| Advanced actions | Existing remove/move actions only where supported. Destructive actions remain separated and confirmed as currently required. |

Use semantic fieldsets or native disclosure groups with descriptive labels, compact help and linked errors. Keep supported inputs and command validation intact. Unknown widget types show compatibility information and safe lifecycle controls, not invented property editors. Section and nav-item selections retain their existing dedicated controls. There is no widget padding/radius/gradient editor in schema v1; spacing shown in the inspector is form layout, not a saved workspace option.

## 6. Shared components and widget styling

- Primary, secondary, quiet, and destructive button variants; standard heights 36 px desktop/44 px coarse pointer. Icon-only buttons need labels and keyboard-visible help; essential actions are never hover-only. Visually quiet Move controls remain reachable on focus and touch.
- Unavailable actions use native `disabled` before activation, with a nearby readable reason associated through `aria-describedby`; a disabled button cannot be relied on to expose a hover/focus tooltip. Determine availability by a pure evaluation of the same command/validation used by the action, never by trial writes to Zustand. Re-evaluate after geometry, selection, visibility, history or request state changes. Bounds/minimum/maximum/collision-blocked step controls, first/last Move actions, invalid Add destinations/limits, empty history, template replacement while saving, and Save during a gesture/frozen state all follow this contract. Recovery, Close and Back remain usable whenever safe. In Preview, navigation to a missing/hidden target is disabled with a reason; in Edit it stays selectable to repair its target.
- Inputs/selects have consistent height, labels, validation, focus, pending/disabled styling and character constraints. Keep text/color history grouping and commit-on-blur/Enter behavior. Color fields combine existing react-colorful, a six-digit hex input, swatch, and inheritance reset; pointer cancellation/invalid hex must not corrupt the draft.
- Restyle existing `Tabs`, field components and confirmation dialog first. New rich dialogs use a reusable general dialog primitive with focus entry/containment/return and inert background; the current two-button focus trap is insufficient for a template gallery. Avoid nested modals: perform replacement/delete confirmation within the current dialog content.
- Card headers share title/icon rhythm; widget-type icons/category descriptions are code-owned presentation metadata, not new saved props. Use selection outline plus a selected label for non-color feedback. Keep card `data-*` IDs, accessible headings and handle refs stable.
- Welcome may use a restrained decorative accent motif with readable actual greeting/subtitle; explicit user appearance wins. Tasks retain real checkboxes, completed state and editing. Notes remain a real textarea with readable empty/long-text states.
- Gallery uses existing bundled assets and real captions/alt text, not external stock-image URLs. Analytics retains numeric metric/bar data. Calendar keeps chronological dates and a separately sortable agenda. Do not add metric time filters or live-data claims.
- Fit every widget at existing minimum dimensions. Avoid padding/header changes that clip controls; use compact composition or intentional internal scrolling for long content. Never resize all saved widgets, alter schema, or change the 12-column / 32 px row / 16 px gap system to make a new skin fit.

## 7. Drag, resize, and ordering language

Dedicated, named grip handles; `grab`/`grabbing` cursor; modest raised drag feedback; solid indigo insertion line for semantic lists, translucent bounded rectangle for spatial grids. Grip hit areas are at least 24 × 24 px on desktop and 44 × 44 px for coarse pointers, without overlapping adjacent controls. A valid empty destination has a dashed target and “Drop task here” or the relevant type label. Invalid targets have no insertion indicator; announce a clear reason after an attempted invalid move. No global “drop anywhere” messaging.

| Surface | Interaction and boundaries to preserve |
| --- | --- |
| User nav primary/secondary groups | Semantic reorder in top and side navigation; move between groups. App rail cannot be reordered or targeted. |
| Workspace sections | Root-level semantic order; cannot nest sections. |
| Stack widget cards | Reorder and transfer known cards between stack sections. Unknown types reorder only within their existing section. |
| Dashboard widgets | RGL spatial position/size; semantic order via that grid's outline. No drag transfer between grid sections or between grid and stack. |
| Task rows, gallery tiles | Reorder and transfer to another widget of the same type, including an empty list. |
| Metrics, calendar agenda | Reorder within their own widget only. Calendar date cells remain chronological. |

Do not replace the current shared sorter or re-enable dnd-kit's optimistic DOM-sorting plugin. Preserve transient hover state, stable IDs, one atomic commit, gesture mutual exclusion, and invalid/cancel/outside-drop rollback. Keep grid and semantic handles distinct; task clicks, form inputs, links, resizing and child sorting must not start a parent drag.

**Same-grid occupied-drop behavior (new requirement):** dragging a widget onto an occupied position in the same dashboard section must preview automatic collision pushing and vertical reflow of affected visible widgets, rather than simply refusing the move. The dragged widget keeps its size; neighbors move to valid positions and final rectangles never overlap. On drop, commit the complete resolved visible layout once and synchronize semantic order by `(y, x, id)`; mobile/outline order follows that result. One Undo restores all affected rectangles/order. Reflow is contained to that section; hidden rectangles and other sections are preserved. Semantic lists continue using their existing sortable insertion behavior with a visible insertion indicator.

Prefer the installed React Grid Layout collision-pushing behavior to a new freeform drag engine. Its vertical compactor may also run on mount: do not blindly enable it and change saved geometry during idle rendering. Preserve the exact saved layout until a user gesture; resolve preview geometry transiently, validate the full result on completion, and abandon it on canceled/outside drops or mode change. Keyboard/click move and size controls use the same valid reflow policy through a shared pure planner: occupancy alone must not disable an action when neighboring widgets can make room. Bounds, size limits and genuinely unresolvable results are disabled with a reason. Installed native layout helpers may mutate inputs, so plan on clones, never saved/draft references. Final persisted overlap rejection remains mandatory.

Keyboard semantic sorting keeps Space/arrows/Space and Escape; existing Move up/down/Move to buttons remain simple pointer alternatives. Grid keeps arrow move/Shift+arrow resize and labeled click steps through the validated domain command, updated to share the reflow planner. Show unavailable-step reasons beside disabled controls before activation. Revalidate execution for stale-state changes and report any resulting refusal without a draft change. Keyboard support alone does not provide the separate pointer alternative required by [WCAG dragging guidance](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html).

## 8. Additional screens

**Component library:** a focused dialog opened by Components or Add Component. Keep local title/type search, useful categories, icons, descriptions and Add actions. At the top, provide a labeled **Add to section** selector listing visible, compatible sections with title and Grid/Stack type (disambiguate duplicate titles). Initially select the selected visible section, or the visible owner of the selected widget, otherwise the first visible compatible section in workspace order. Keep an explicit choice stable while the dialog is open; if it becomes hidden/deleted, invalidate it and ask for another choice, never silently switch destinations. Hidden sections are not fallback targets. If none is available, disable Add and offer Open outline/Show section/Add section through existing flows; do not secretly create or unhide a section.

Before Add, show “Add Tasks to Today — Dashboard grid,” using the actual type/destination. One activation creates exactly one widget through the existing domain command. On success close the dialog, open Properties for the new widget, scroll the canvas to its stable ID and focus its card, visibly mark it Selected, and announce “Added Tasks to Today. Unsaved changes.” Coordinate dialog focus restoration so it does not steal focus back from the new card. If the card is below the fold, reveal it; scrolling only a library notice is insufficient. Failure leaves the library open, explains the reason and creates no widget/history entry. Search, destination choice, focus and scrolling are not saved edits. At limits, disable Add with the reason before activation.

**Templates:** a large dialog, max width 960 px within 24 px viewport gutters; a 3/2/1-column gallery as space allows. Tabs **Ready-made** and **My templates** reflect actual API kinds. Each card has a truthful mini-preview, name, short description, and select/details/apply action. Reuse existing request guards, metadata/detail fetching and snapshots. A proposed stateless `TemplateThumbnail` derives a safe miniature from parsed config/summary; it must not mount the main workspace store, run sorting, or change the current draft. Load system details for previews; lazy-load custom details as selected/in view rather than fetching every private config on open. Provide a summary fallback and accessible text for unknown components/loading/error.

Keep “Save current design as template” clearly distinct from workspace Save. Creation captures the current draft, including unsaved edits, without saving the workspace. Replacement/deletion confirmation stays inside the dialog; creating, applying and deleting show their own pending/error states. Restore default still means Productivity. Do not add a redundant Saved tab or public marketplace.

**Appearance:** inspector view with Color and Typography groups, sample swatches and live canvas feedback. Offer only the four existing theme colors, `system/serif/mono`, and 12–20 px base font size. Label the palette section **Suggested workspace palettes**, with “Changes your workspace background, navigation and cards. Editor controls keep their own colors.” Show the current/applied palette state and retain a clear Back to properties action. A palette applies those four fields atomically, covers the full workspace stage and user navigation in Edit/Preview, and is one history action; it is not a new system/light/dark mode. Explain custom widget overrides and provide their existing reset-to-inherit action. Contrast feedback is advisory; global Save/Cancel remain the source of persistence. No separate editor-theme preference is introduced by this revision.

**Authentication:** centered card around 400 px wide, simple brand, concise title and email/password form. A subtle static indigo backdrop may frame the card; no fake dashboard activity or services. Preserve autocomplete, validation, pending state, registration password guidance and reauthentication/frozen-draft warnings. Show/hide password may be a labeled local presentation control. No new API fields, session policy, password recovery or social login.

**Preview:** hide rail, component tools, inspector, all handles, selection rings, library/templates/theme actions and Undo/Redo. Retain a minimal app strip outside `.fs-themed` for Edit workspace (desktop), save/unsaved status, real account/logout, and session/conflict notices when relevant. Workspace navigation remains part of the personalized content. Task checks and Notes still update the same draft; switching modes never writes/discards. Save/Cancel remain available in desktop Edit only, as currently implemented. Do not simulate saved state or automatically save Preview interactions.

## 9. State and feedback

| State | Presentation and behavior |
| --- | --- |
| Initial load | Shape-matched skeleton or concise loading status; prevent blank editable defaults before real config arrives. |
| Saved / dirty / saving | Text plus icon in compact status; dominant Save disabled when clean or blocked; no Save during a live gesture; retain current newer-edit-during-save behavior. |
| Network/validation failure | Persistent inline error near toolbar/field with meaningful retry path, keep draft. Never replace it with a success-only toast. |
| Stale revision | Clearly explain changes remain unsaved; retain Keep editing and confirmed Reload latest. |
| Reload in progress | After discard confirmation, show a busy state and either prevent edits until reload completes or guard newer edits with an edit revision/snapshot. A delayed response must never silently overwrite edits typed after confirmation. Preserve owner/epoch guards and allow retry after failure. |
| Logout pending/failure | Hide private content while revocation is pending, prevent duplicate logout, and confirm success only after revocation or a confirmed already-expired session. On network/5xx failure explicitly say sign-out could not be confirmed and provide Retry; never silently present successful logout while a valid cookie remains. Keep dirty-discard authorization and auth-generation guards. |
| Session expired | Existing auth boundary hides private content; same-user recovery/different-user clearing is preserved. |
| Empty workspace/section/list | Name the missing content and offer the relevant existing add/show action only in Edit; Preview uses a calm explanation. |
| Unsupported schema/type | Schema blocks the writable editor; unknown type keeps a normal-position safe placeholder and preserved data. |

Panel opening/closing, local search, hover, layout measurement and width changes must not mark a workspace dirty or append history. Do not remount the editor store or discard valid focused-field edits to produce transitions.

## 10. Responsive and accessibility contract

Retain `useEffectiveMode` at 1024 px: below it, no advanced editing tools/drag handles; widening returns to the user's previously chosen mode. Actual current task/Notes content interactions remain available in Preview, including narrow widths. Clearly say “Layout and property editing requires desktop; return to desktop Edit to save or cancel.” An unsaved draft remains in the current browser memory only; opening another device does not transfer it. Do not advertise mobile as read-only or silently remove those interactions.

Existing workspace side-navigation adaptation remains: side layout at 1400 px viewport in Edit and 1024 px in Preview; below those widths render the same items horizontally/stacked. Saved `left/right` placement remains unchanged. A reduced canvas width is not a new persisted layout breakpoint. Test all three placements with inspector open/closed.

At 1920/1440/1280/1024/768/390 px, require legible wrapping, no page-level horizontal overflow and reachable actions. At 200% browser zoom let effective viewport rules apply; do not force three desktop panes into the available width. Respect reduced motion and coarse-pointer target sizes; test long labels and maximum widget content.

Dialogs need accessible title, initial focus, Tab containment, Escape policy, focus return and truly inert background, following the [WAI modal pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/). Canceling a drag with Escape must not also close an unrelated panel. Native labeled controls remain preferred; never hide focus rings or remove Move alternatives for aesthetics. Validate keyboard traversal and perform a real screen-reader smoke test before demo sign-off; prior automated focus checks are not proof of assistive-technology compatibility.

## 11. Implementation boundaries

No schema or API changes are required. UI-028 permits a narrow backend template-ordering/test correction; do not rewrite backend/auth or modify system-template seed content. Do not silently migrate saved layouts just for styling. Preserve registry, owner/state synchronization, history, provider boundaries and JSON invariants; update domain planning only for the explicitly revised reflow/capability/recovery contracts. Prefer the existing dependencies and reusable primitives. UI-001 established the old baseline; begin the corrective implementation at [UI-019](UI_REDESIGN_TASKS.md#ui-019--protect-new-edits-during-reload-latest), then follow the Pending tasks through UI-030. No new task is complete merely because the older test suites pass.
