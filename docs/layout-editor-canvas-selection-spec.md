# Layout Editor Canvas Hover And Selection Specification

Status: Proposed implementation specification

Last updated: 2026-07-21

## Purpose

The layout editor canvas must let users discover and select authored layout
elements directly, using interaction rules familiar from layered graphics
editors.

This document defines exactly:

- which element is highlighted while the pointer hovers the canvas
- which element is selected by a primary click
- how nesting and containers change the result
- how overlapping elements are ordered
- how RouteVN-specific rendered output maps back to an authored element
- how canvas selection synchronizes with the existing node explorer and detail
  panel

This is a behavior specification, not an implementation plan. The normative
terms **MUST**, **MUST NOT**, **SHOULD**, and **MAY** describe requirements.

## Scope

The first implementation covers single selection in the layout editor's design
canvas:

- pointer hover
- primary click or tap
- double-click to descend through nested containers
- deep select with `Command` on macOS or `Control` on Windows and Linux
- selection clearing from empty canvas space
- synchronization with the node explorer and detail panel

The separate interactive Preview surface is not changed by this specification.

The following advanced canvas features are intentionally deferred:

- multiple selection and `Shift`-click
- selection marquee
- a right-click **Select layer** menu
- canvas keyboard traversal with `Enter`, `Shift+Enter`, `Tab`, and
  `Shift+Tab`
- locked elements
- a user preference to disable hover highlighting
- outline mode

The node explorer remains the way to select an element behind another element
until **Select layer** is implemented. It also remains the complete keyboard
selection path.

## Interaction Baseline

The canvas interaction model establishes these rules:

1. An ordinary canvas click selects a parent by default when the visible object
   is nested in a frame or group.
2. Double-clicking descends one level of nesting. Repeating the action descends
   again.
3. Holding `Command` on macOS or `Control` on Windows performs a deep select.
   This highlights and selects the deepest visible layer under the pointer.
4. Layer order controls visual overlap: layers drawn above other layers are in
   front of them.
5. A right-click **Select layer** menu provides an explicit way to choose from
   layers underneath one pointer position.
6. Hidden and locked layers do not participate in normal canvas selection.
7. Clicking empty canvas space or pressing `Escape` clears selection.

The baseline does not prescribe every low-level hit-testing detail or define
RouteVN concepts such as repeated preview instances and fragment references.
Those behaviors are explicit RouteVN product decisions below.

## Terms

### Authored item

An item stored in the current layout's `elements.items` and shown in the node
explorer. Selection is always expressed as the id of one authored item.

### Render occurrence

One concrete, parsed graphics element visible in the current canvas preview.
One authored item can produce zero, one, or many render occurrences.

Examples:

- a normal rectangle produces one occurrence
- a conditionally hidden item produces zero occurrences
- a repeated save slot can produce several occurrences
- a fragment reference produces a wrapper plus graphics compiled from another
  layout

### Selection owner

The authored item that owns a render occurrence for editor selection. Renderer
internals and compiled elements that are not independently editable map to an
authored owner or have no owner.

### Hit path

The ordered authored hierarchy for the frontmost render occurrence under the
pointer, from a top-level item to the deepest selectable descendant.

For this hierarchy:

```text
Container A
└── Container B
    └── Text C
```

the hit path over the text is `[A, B, C]`.

### Frontmost

Closest to the user in actual rendered paint order. This term is about visual
stacking, not hierarchy depth.

### Top-level

An authored item whose parent is the layout root. This term is about hierarchy,
not visual stacking.

## Selectable Surface

The editor MUST build selection candidates from the same fully resolved and
parsed render tree used to draw the canvas. It MUST NOT derive selection from
the repository tree alone, because layout, conditions, fragments, repetition,
anchors, scaling, rotation, and clipping can change the visible result.

An occurrence participates in hit testing when all of the following are true:

- it has a selection owner in the current layout
- it is present after template and condition evaluation
- neither its owner nor an authored ancestor has `hidden: true`
- it has a non-empty rendered hit region, or it is an ancestor of a hit
  descendant
- the pointer lies inside the canvas and inside every clipping ancestor

Hit regions use the occurrence's final transformed layout bounds:

- anchors, scale, rotation, container transforms, and directed layout MUST be
  applied
- clipping MUST limit where an occurrence can be hit
- a rotated item MUST be tested in its rotated geometry, not only its
  axis-aligned bounding box
- sprite transparency and text glyph gaps MUST NOT create click-through holes;
  the full transformed layout bounds are the hit region
- opacity, including zero opacity, does not make an occurrence hidden; an item
  that still renders remains selectable by bounds
- the selection outline, hover outline, anchor marker, and resize handles MUST
  NOT become selection candidates

For a container:

- positive resolved width and height define a full rectangular hit region
- if it has no positive resolved bounds, its effective hit region is the union
  of its selectable descendants
- an empty container with no positive bounds cannot be selected from the
  canvas and remains selectable from the node explorer
- hitting a descendant also puts every selectable authored container ancestor
  on the hit path

After a target is resolved, its highlight shows the occurrence's full
transformed bounds, even when only part of those bounds was hittable because of
clipping. The outer canvas still clips all editor chrome.

## Selection-Owner Mapping

The compile/render path MUST provide explicit selection metadata. Selection
ownership MUST NOT be recovered by heuristically parsing rendered ids such as
`-instance-0` or `fragment--child`.

The mapping rules are:

| Rendered content                                                                       | Selection owner                                             |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Normal layout element                                                                  | The authored item with the same semantic identity           |
| Repeated container occurrence                                                          | The repeated container's authored source item               |
| Descendant inside a repeated occurrence                                                | That descendant's authored source item                      |
| Child compiled from a `fragment-ref`                                                   | The outermost `fragment-ref` authored in the current layout |
| Slider bar, thumb, input internals, particle internals, or other plugin-owned graphics | The authored item that produced the control                 |
| Synthetic preview background                                                           | None                                                        |
| Hover/selection overlay and handles                                                    | None                                                        |

Fragment content is atomic in the containing layout editor. Even deep select
stops at the current layout's `fragment-ref`; editing the referenced layout's
children requires opening that layout.

For repeated content, the authored id and the occurrence identity are separate:

- selecting any occurrence selects the one authored source item in the node
  explorer and detail panel
- the canvas remembers the clicked occurrence as transient UI state and keeps
  the selection outline on that occurrence
- edits apply to the authored source and therefore affect every occurrence
- selecting the item from the node explorer, where there is no occurrence
  context, uses the first currently rendered occurrence in deterministic render
  order
- if the remembered occurrence disappears after preview data changes, the
  first remaining occurrence becomes primary; if none remain, selection stays
  in the node explorer/detail panel but no canvas outline is shown

## Hit Resolution And Stacking

At a pointer position, the editor MUST resolve candidates in this order:

1. Gather all selectable rendered occurrences whose hit region contains the
   point.
2. Order them from front to back using the graphics renderer's actual recursive
   paint order and stacking contexts.
3. Ignore candidates with no selection owner.
4. Choose the first remaining occurrence as the frontmost occurrence.
5. Map its render ancestry to a de-duplicated authored hit path.
6. Apply the normal, deep, or double-click hierarchy rule to that one path.

The current compiled paint order is authoritative. Code MUST NOT assume that
raw object insertion order or node-explorer display order is always paint
order. This matters because current layout schema versions transform tree order
for normal stacking while directed containers preserve layout order.

Normal and deep selection do not cycle through overlapping siblings. Repeated
clicks at an unchanged position resolve the same frontmost branch. An element
behind that branch is selected through the node explorer until the deferred
**Select layer** menu exists.

If the frontmost item is hidden, conditionally absent, clipped out at the
pointer, or synthetic, it is removed before the winner is chosen. The next
eligible occurrence behind it can then win.

## Hover Behavior

Hover is a prediction of the target that a primary click with the current
modifier keys would select.

### Normal hover

With no deep-select modifier, hover highlights the first item in the frontmost
hit path: the top-level authored item.

Examples:

- hovering a top-level image highlights the image
- hovering text inside a top-level container highlights the top-level container
- hovering a deeply nested child still highlights its top-level ancestor

### Deep-select hover

While `Command` on macOS or `Control` on Windows/Linux is held, hover highlights
the last item in the same frontmost hit path: the deepest selectable authored
item.

Changing the modifier while the pointer is stationary MUST recompute the hover
target immediately.

### Hover presentation

- Show a solid, one-CSS-pixel light-gray (`#b3b3b3`) outline around the
  hovered occurrence with a one-CSS-pixel white outline visible outside it.
- The white hover rectangle MUST be offset to the exterior of the occurrence;
  it MUST NOT produce a second white line inside the gray outline.
- Keep the stroke approximately one CSS pixel at every canvas scale; it MUST
  NOT become nearly invisible when a high-resolution project is scaled down.
- Do not show fill, anchor markers, resize handles, or a layer-name label.
- Draw the hover outline above authored content and below selection handles.
- When hover and selection chrome are both visible and overlap, the complete
  hover outline MUST remain behind the complete selected outline, anchor, and
  resize handles.
- Hover MUST NOT change `selectedItemId`, the node explorer, the detail panel,
  or repository state.
- If hover and selection refer to the same occurrence, show only the stronger
  selection chrome.
- If the selected occurrence appears anywhere on the current normal-hover hit
  path, do not highlight one of its ancestors while the pointer remains over
  the selected occurrence.
- If they refer to different occurrences, keep the selection chrome and show
  the hover outline at the same time.
- Clear hover when the pointer leaves the canvas, no candidate exists, a drag
  starts, the canvas is disabled, or the component unmounts.

Hover updates MUST be cheap. Pointer movement MUST NOT reload assets, query the
repository, or recompile the layout. It MAY submit the cached render tree plus
the hover rectangles through Route Graphics' element-diff render path. Hit
testing SHOULD use an index rebuilt only when the resolved render tree changes,
and visual updates SHOULD be limited to one animation-frame cadence.

## Click Behavior

### Primary click

A primary click with no modifier selects the first item in the frontmost hit
path: the top-level authored item.

The final click target MUST equal the immediately preceding normal-hover target
when neither canvas content nor pointer position changed.

### Deep select

`Command`-click on macOS or `Control`-click on Windows/Linux selects the last
item in the frontmost hit path.

The final target MUST equal the deep-select hover target shown while the
modifier is held.

### Double-click

Double-click descends exactly one authored hierarchy level along the frontmost
hit path.

- With no selection on that path, the first click establishes the top-level
  item and the completed double-click selects the next item in the path.
- If an item on that path was already selected before the double-click gesture,
  the completed double-click selects its immediate child on the path.
- Repeated double-click gestures continue one level at a time.
- At the deepest selectable item, another double-click leaves selection
  unchanged.
- A fragment boundary counts as the deepest level in the containing layout.

The gesture recognizer MUST retain the selection that existed at the start of
the double-click sequence. The ordinary click event emitted before `dblclick`
MUST NOT accidentally reset the depth and prevent repeated descent.

### Selection presentation

- Show a persistent solid, one-CSS-pixel light-gray (`#b3b3b3`) outline
  around the selected occurrence with a one-CSS-pixel white outline visible
  outside it.
- The white selection outline MUST be outside the occurrence and the gray
  outline MUST be inside it, without duplicating either color on both sides of
  the authored boundary.
- Keep the stroke approximately two CSS pixels at every canvas scale.
- Show the existing white anchor marker with its one-CSS-pixel light-gray
  border and only the resize handles supported by the selected authored item.
- Use no selection fill; authored content must remain visible and color-accurate.
- Draw selection chrome above hover chrome and authored content.
- Keep selection chrome visible after the pointer leaves the canvas.
- When an authored item has no current render occurrence, keep explorer/detail
  selection but show no canvas selection chrome.

### Empty space and clearing

A primary click inside the graphics canvas with no selectable candidate MUST:

- clear the page's selected item
- clear the node explorer selection
- clear the detail panel selection
- clear selected occurrence state
- remove hover and selection chrome

The synthetic preview background counts as empty space. Clicking UI outside the
design canvas does not implicitly clear canvas selection. `Escape` SHOULD also
clear selection, unless a higher-priority dialog or input owns the key.

### Pointer gesture boundary

- Only the primary button performs selection.
- Right-click MUST NOT change selection before opening any context menu.
- A resize handle or anchor marker owns its pointer gesture and MUST NOT cause
  a hit test against content behind it.
- The selected occurrence's full move surface owns a drag after movement
  crosses the threshold. Before that threshold, its click and double-click
  resolution MUST use the authored content hit path beneath the editor overlay
  so nested selection remains possible.
- Once movement crosses the editor's drag threshold, hover clears and the
  existing move/resize contract takes precedence.
- A press released after crossing the threshold is a drag, not an additional
  click selection.

## Containers And Nested Items

Every RouteVN authored container type follows the same hierarchy behavior,
including specialized container-reference types.

For a hit path `[A, B, C]`:

| Gesture                              | Result             |
| ------------------------------------ | ------------------ |
| Hover                                | `A` is highlighted |
| Click                                | `A` is selected    |
| First double-click from no selection | `B` is selected    |
| Next double-click                    | `C` is selected    |
| `Command`/`Control` hover            | `C` is highlighted |
| `Command`/`Control` click            | `C` is selected    |

Container direction does not change hierarchy selection. Horizontal and
vertical containers still act as parents. Direction only affects resolved
geometry and, where children overlap, actual paint order.

## Overlap Examples

Assume `Front` and `Back` overlap at the pointer.

### Top-level siblings

```text
Layout root
├── Front
└── Back
```

If `Front` is visually in front, normal and deep hover/click select `Front`.
They never cycle to `Back`.

### Nested front branch

```text
Layout root
├── Front container
│   └── Front child
└── Back item
```

If `Front child` is the frontmost occurrence at the pointer:

- normal hover/click resolves `Front container`
- deep hover/click resolves `Front child`
- no gesture in this scope resolves `Back item`

### Overlapping children in one container

```text
Container A
├── Child Front
└── Child Back
```

At the overlap:

- normal hover/click resolves `Container A`
- deep hover/click resolves `Child Front`
- double-click from `Container A` resolves `Child Front`

The renderer's real paint order determines which child is `Child Front`.

## RouteVN Edge-Case Matrix

| Scenario                                 | Normal hover/click                      | Deep hover/click                                           |
| ---------------------------------------- | --------------------------------------- | ---------------------------------------------------------- |
| Top-level leaf                           | The leaf                                | The leaf                                                   |
| Child nested under two containers        | Top-level container                     | Deepest child                                              |
| Two overlapping top-level leaves         | Frontmost eligible leaf                 | Same frontmost eligible leaf                               |
| Hidden front item over visible back item | Visible back item                       | Visible back item                                          |
| Child clipped out at the pointer         | Next eligible hit behind it, or none    | Same                                                       |
| Zero-opacity but rendered item           | The item or its top-level ancestor      | The item                                                   |
| Empty positive-size container area       | The top-level container on that path    | Deepest container on that path                             |
| Empty zero-size container                | No canvas target                        | No canvas target                                           |
| Synthetic preview background             | No canvas target                        | No canvas target                                           |
| Child rendered from a fragment           | Current layout's `fragment-ref`         | Same `fragment-ref`                                        |
| Third occurrence of a repeated child     | Its top-level source ancestor           | Child's authored source id, with occurrence three retained |
| Slider thumb or bar                      | Slider or its top-level source ancestor | Authored slider                                            |

## Selection Synchronization

The page's `selectedItemId` remains the canonical authored selection. Canvas
selection MUST use the same page-level path as node-explorer selection.

When the canvas selects an item, it MUST:

1. dispatch one canonical selection event containing at least `itemId` and the
   transient occurrence identity
2. update page `selectedItemId`
3. select and reveal that item in the node explorer
4. synchronize the detail panel to the same item
5. render the selection overlay around the chosen occurrence

Selection MUST NOT submit a project command or otherwise persist data.

Hover state and occurrence identity belong to the mounted canvas instance as
plain UI state. They are not project semantics and MUST NOT be stored in the
repository. Handlers MUST NOT keep them in module-scoped mutable state or on a
`refs.__...Runtime` property.

If the selected item is deleted, page selection and occurrence state MUST
clear. If it remains authored but has no current occurrence because it is
hidden or its condition is false, the node explorer and detail panel MAY remain
selected while the canvas shows no selection outline.

## Editor Versus Runtime Interactions

Canvas selection is observational. It MUST NOT disable, replace, cancel, or
stop propagation of Route Graphics interactions.

While the pointer is interacting with the design canvas:

- authored hover and click visuals continue to run
- renderer-managed input, slider, scroll, sound, and pointer behavior continue
  to run
- the editor observes the same pointer gesture to update selection
- selection and hover resolution MUST NOT call `preventDefault()` or
  `stopPropagation()` on an authored-content gesture

Selection and resize handles are the exception because they are explicit editor
chrome and already own their move/resize gestures. Whether an authored action
payload has a Route Engine consumer remains an existing canvas integration
decision; canvas selection itself neither enables nor suppresses those actions.

## Touch Behavior

Touch has no hover state.

- A single tap uses the normal primary-click rule.
- The tapped item synchronizes with the mobile node explorer and detail view.
- Deep selection by modifier and nested double-tap selection are not required
  for the first touch implementation.
- Nested or obscured items remain selectable through the node explorer on
  touch devices.

## Required State Invariants

At all times:

- there is at most one authored selected item
- there is at most one hovered render occurrence
- a selected occurrence, when present, maps to `selectedItemId`
- hover resolution and click resolution use the same hit index and resolver
- hover never mutates authored selection
- selection never mutates project data
- editor chrome never participates in content hit testing
- selection observation does not suppress authored renderer interactions

## Acceptance Scenarios

The implementation is complete only when automated coverage proves all of the
following:

1. A top-level image highlights on hover and selects on click.
2. Hover and click over a child select its top-level container.
3. One double-click selects the next nested level and repeated double-clicks
   continue one level at a time.
4. `Command`/`Control` changes both stationary hover and click to the deepest
   selectable item.
5. Two overlapping siblings resolve the actual frontmost rendered sibling.
6. Normal and deep clicks do not cycle to an obscured sibling.
7. Hidden, conditionally absent, clipped-out, and synthetic elements are not
   selected.
8. Rotated, scaled, and anchored elements use their final transformed hit
   regions.
9. Transparent sprite pixels and text whitespace still hit the element's
   bounds.
10. A container is selected from its bounds and from hits on its descendants.
11. Fragment content selects the current layout's fragment reference, including
    with deep select.
12. Clicking a repeated occurrence selects its authored source while preserving
    that occurrence for the canvas outline.
13. Node-explorer selection of a repeated source outlines the deterministic
    first occurrence.
14. Blank space clears the canvas, node explorer, and detail-panel selection.
15. Selecting on the canvas reveals the same item in the node explorer and
    opens the same detail content as explorer selection.
16. Hover causes no repository read/write, asset load, or layout recompile; it
    only updates cached Route Graphics elements through the renderer diff.
17. Editor selection preserves authored hover/click visuals and existing
    renderer-managed sounds, inputs, sliders, and scrolling.
18. Selection handles and move/resize drags continue to work without selecting
    content behind the overlay.

Pure resolver tests SHOULD cover hierarchy, paint order, visibility, clipping,
selection-owner mapping, and occurrence fallback. Canvas integration tests
SHOULD cover pointer/modifier sequences and synchronization. VT coverage SHOULD
capture at least normal hover, deep hover, parent selection, deep selection,
and overlap selection with stable pointer positions.

## Implementation Boundaries

This specification fits the existing architecture as follows:

- `layoutEditorCanvas` owns local pointer input, transient hover/occurrence
  state, hit-testing integration, and editor chrome.
- A pure selection resolver owns frontmost ordering, authored hit-path
  construction, and normal/deep/double target resolution.
- The layout compile/render path owns explicit occurrence-to-authored-item
  metadata, including fragment and repetition boundaries.
- The layout editor page owns canonical `selectedItemId`, node-explorer sync,
  detail-panel sync, and deselection orchestration.
- Route Graphics owns low-level transformed hit testing when the renderer must
  expose it; page handlers must not inspect Pixi or browser globals directly.

The resolved render tree and hit index SHOULD be cached per successful canvas
render. Pointer movement should query that cache and update editor chrome only.
The implementation MUST NOT add selection behavior by attaching authored
runtime interaction payloads to every layout element, because doing so mixes
editor intent with game-runtime behavior.

## Deferred Canvas Features

When a **Select layer** context menu is added, it should list unique selection
owners under the pointer in front-to-back order, identify repeated occurrences,
exclude hidden/absent content, and allow choosing an item behind the normal
winner. Its exact menu behavior requires a separate specification because it
also intersects the layout editor's existing create/edit context menu.

Multiple selection and marquee selection also require a separate specification
and a page selection model that can represent more than one authored id. They
must not be partially introduced into this single-selection contract.
