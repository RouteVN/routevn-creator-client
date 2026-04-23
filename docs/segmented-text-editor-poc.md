# Segmented Text Editor POC

## Purpose

This document records the current proof of concept for rich text editing before
we touch `src/pages/sceneEditor`.

The goal of the POC is narrow:

- validate a segmented text editing model
- validate `contenteditable` compatibility with styled spans
- validate caret and selection restoration after rerender
- validate the most common failure mode first: caret jump while typing

This is not the scene editor implementation. It is an isolated experiment that
exists to reduce risk before the real migration.

## Current POC Surface

The POC currently lives in these files:

- `src/pages/segmentedTextPoc/`
- `src/primitives/segmentedTextPoc.js`
- `static/project/segmented-text-poc/index.html`

It is reachable through:

- route: `/project/segmented-text-poc`
- local-project entry button: `Text POC` on `src/pages/projects`

Important constraint:

- the real `sceneEditor` is still plain-text-only
- only the POC uses the segmented editor primitive

## Current Editing Model

The POC uses one editable root:

- one `contenteditable="true"` container
- many non-editable toolbar/debug elements around it
- styled `<span>` children inside the editable root

The runtime data model is not arbitrary HTML. It is a constrained segment
array:

```js
[
  { text: "Segmented editing ", textStyle: { fontWeight: "bold" } },
  { text: "should keep ", textStyle: { fontStyle: "italic" } },
  { text: "format boundaries", textStyle: { fill: "#b45309" } },
]
```

That means the browser is only used as the live editing surface. The browser
DOM is not treated as the authoritative saved representation.

## Current Strategy

The POC currently works like this:

```text
segment model
-> render styled spans into one contenteditable root
-> browser handles live typing / deletion / selection
-> POC parses DOM back into segments after edit
-> adjacent equal-style segments are normalized
-> selection is restored from plain-text offsets
```

Current behavior:

- typing is handled natively by the browser
- formatting actions mutate the segment model, not browser formatting commands
- paste is normalized to plain text
- Enter inserts `\n`
- selection is stored as plain-text offsets, not DOM node references

## Why This POC Uses One Editable Root

The important choice in this POC is not "rich HTML editing everywhere". The
important choice is:

- one editable root
- browser-native text editing inside it
- app-owned structured segment data above it

This is the smallest practical model that lets us validate the risky part:

- typing across style boundaries
- rerender without losing the caret
- formatting a range without flattening segment structure

## Caret Jump Bug

The main bug we hit in the POC was the standard `contenteditable` rerender
failure:

- user types quickly
- app reparses the DOM and rerenders the whole editable surface
- caret restore happens too late
- next keystroke lands at offset `0` or another stale location

In our case, the cause was specifically:

```text
input
-> parse DOM into segments
-> replaceChildren() on the editor
-> wait for requestAnimationFrame
-> restore selection
```

That left a gap where the editable surface had already been replaced but the
selection had not yet been restored.

When typing quickly, the next key event could arrive during that gap and insert
text at the beginning of the content.

## Caret Jump Fix

The current fix in `src/primitives/segmentedTextPoc.js` is:

- restore selection immediately after rerender
- keep the old `requestAnimationFrame` restore only as a fallback path

In short:

```text
replaceChildren()
-> restore selection synchronously when possible
-> use requestAnimationFrame only if immediate restore could not run
```

This was enough to stabilize the cases that were failing in the POC.

## What We Validated

The current POC has been validated for these cases:

- typing at the end of the content
- fast repeated typing at the end of the content
- typing in the middle of a styled segment
- fast repeated typing in the middle of a styled segment
- applying style across multiple segments
- preserving segment boundaries after edit normalization

The key result is:

- a single-root segmented `contenteditable` approach is viable for this app
- the main failure mode so far was selection timing during rerender, not the
  segment model itself

## What Is Still Not Solved

This POC is not a complete rich text editor yet.

Open risks:

- IME and composition behavior under more aggressive rerender paths
- newline and block behavior under heavier editing
- multi-line paste semantics for rich content
- richer text features beyond `fontWeight`, `fontStyle`, and `fill`
- scene-editor-specific structural operations such as split, merge, and section
  sync
- migration of creator-owned dialogue layout refs away from
  `dialogue.content[0].text`

## What This Means For Scene Editor

The POC result does not mean we can simply drop the new primitive into
`sceneEditor`.

The real migration still requires:

- replacing string-based line editing with segment-based line editing
- replacing plain-text split/merge/paste logic with segment-aware operations
- preserving selection across scene-editor rerenders
- updating layout and session code that still assumes
  `dialogue.content[0].text`

But the POC does answer the highest-risk question:

- yes, we can use one structured `contenteditable` root with styled spans
- yes, the caret-jump problem is manageable if selection restore timing is
  handled correctly
