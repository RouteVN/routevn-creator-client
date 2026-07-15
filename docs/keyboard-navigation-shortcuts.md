# Keyboard Navigation Shortcuts

This document records the keyboard shortcuts that navigate between project
pages or move through app-owned navigation surfaces. It documents current
behavior; it is not a proposed key map.

Editing and manipulation shortcuts, such as moving a layout item or reordering
a scene line, are outside this document unless they also change the active
selection or navigation mode.

## Global Project Navigation

Global project navigation uses a two- or three-key sequence. Press `g`, release
it, then enter the one- or two-letter destination code. Each next key must be
pressed within 1.5 seconds.

| Shortcut | Destination      | Route                          |
| -------- | ---------------- | ------------------------------ |
| `g p r`  | Project          | `/project`                     |
| `g i`    | Images           | `/project/images`              |
| `g s p`  | Spritesheets     | `/project/spritesheets`        |
| `g c h`  | Characters       | `/project/characters`          |
| `g s o`  | Sounds           | `/project/sounds`              |
| `g t r`  | Transforms       | `/project/transforms`          |
| `g a n`  | Animations       | `/project/animations`          |
| `g p a`  | Particles        | `/project/particles`           |
| `g v i`  | Videos           | `/project/videos`              |
| `g c o`  | Colors           | `/project/colors`              |
| `g f`    | Fonts            | `/project/fonts`               |
| `g t s`  | Text Styles      | `/project/text-styles`         |
| `g l`    | Layouts          | `/project/layouts`             |
| `g c t`  | Controls         | `/project/controls`            |
| `g v a`  | Variables        | `/project/variables`           |
| `g s c`  | Scenes           | `/project/scenes`              |
| `g r`    | Release Versions | `/project/releases/versions`   |
| `g w s`  | Web Server       | `/project/releases/web-server` |
| `g a b`  | About            | `/project/about`               |
| `g a p`  | Appearance       | `/project/appearance`          |

The sequence:

- works only while a project route is active;
- is case-insensitive;
- ignores repeated keydown events;
- ignores chords using `Ctrl`, `Command`, or `Alt`;
- does not run while an input, textarea, select, Rettangoli input, or
  contenteditable element owns the key event;
- preserves the current route query payload and replaces the current history
  entry.

An unsupported key ends the pending sequence without navigating. A recognized
prefix waits for one additional destination key.

Implementation:
[`src/pages/app/app.handlers.js`](../src/pages/app/app.handlers.js)

### Contextual Destinations Without A Global Shortcut

Every visible project navigation destination has a global shortcut. These
context-specific destinations require a selected resource and therefore have
no direct global shortcut:

- Character Sprites: `/project/character-sprites`
- Scene Editor: `/project/scene-editor`
- Animation Editor: `/project/animation-editor`
- Layout Editor: `/project/layout-editor`

## Resource Explorer Navigation

The shared resource explorer keyboard scope supports:

| Shortcut            | Action                                   |
| ------------------- | ---------------------------------------- |
| `ArrowDown` or `j`  | Select the next explorer item            |
| `ArrowUp` or `k`    | Select the previous explorer item        |
| `ArrowRight` or `l` | Expand the selected folder               |
| `ArrowLeft` or `h`  | Collapse the selected folder             |
| `Ctrl+D`            | Move forward by up to 10 explorer items  |
| `Ctrl+U`            | Move backward by up to 10 explorer items |

If there is no selection yet, a movement shortcut selects the first available
item. Movement clamps at the start and end of the explorer.

These bindings are active on the shared keyboard scope used by Animations,
Character Sprites, Characters, Colors, Controls, Fonts, Images, Layouts,
Particles, Scenes, Sounds, Spritesheets, Text Styles, Transforms, Variables,
and Videos.

`Enter` has an additional page-specific action on:

| Page              | Action                                          |
| ----------------- | ----------------------------------------------- |
| Images            | Open the selected image preview                 |
| Character Sprites | Open the selected sprite or spritesheet preview |

The explorer shortcuts do not run from editable controls. `Alt` and `Command`
shortcuts are left to the platform, as are `Ctrl` shortcuts other than
`Ctrl+D` and `Ctrl+U`.

Implementation:
[`src/internal/ui/fileExplorerKeyboardScope.js`](../src/internal/ui/fileExplorerKeyboardScope.js)

## Resource Grid Zoom

The resource grid supports these view shortcuts where zoom controls are
enabled:

| Shortcut | Action                       |
| -------- | ---------------------------- |
| `+`      | Zoom in / show fewer columns |
| `-`      | Zoom out / show more columns |

They are available on Animations, Character Sprites, Colors, Controls, Fonts,
Images, Layouts, Particles, Sounds, Spritesheets, Text Styles, Transforms, and
Videos. They do not run from editable controls or with `Ctrl`, `Command`, or
`Alt`.

Implementation:
[`src/internal/ui/resourcePages/zoomShortcuts.js`](../src/internal/ui/resourcePages/zoomShortcuts.js)

## Image And Character Sprite Preview

The full-screen preview on Images and Character Sprites supports:

| Shortcut            | Action                           |
| ------------------- | -------------------------------- |
| `ArrowDown` or `j`  | Show the next item               |
| `ArrowUp` or `k`    | Show the previous item           |
| `Ctrl+D`            | Move forward by up to 10 items   |
| `Ctrl+U`            | Move backward by up to 10 items  |
| `ArrowLeft` or `h`  | Use canvas-relative display mode |
| `ArrowRight` or `l` | Use fit-to-preview display mode  |
| `Escape` or `Enter` | Close the preview                |

In this surface, left/right and `h`/`l` change the display mode; they do not
move to the previous or next item.

Implementation:
[`src/internal/ui/resourcePages/imagePreviewOverlay.js`](../src/internal/ui/resourcePages/imagePreviewOverlay.js)

## Scene Editor Line Navigation

The Scene Editor has block mode for line-level navigation and text mode for
editing the selected line.

| Shortcut           | Mode  | Action                                                  |
| ------------------ | ----- | ------------------------------------------------------- |
| `ArrowDown` or `j` | Block | Select the next line                                    |
| `ArrowUp` or `k`   | Block | Select the previous line                                |
| `Enter`            | Block | Enter text mode at the end of the selected line         |
| `i` or `Shift+I`   | Block | Enter text mode at the start of the selected line       |
| `Shift+A`          | Block | Enter text mode at the end of the selected line         |
| `Escape`           | Text  | Return to block mode on the current line                |
| `ArrowUp`          | Text  | Move to the previous section at the first line boundary |
| `ArrowDown`        | Text  | Move to the next section at the last line boundary      |

Implementation:
[`src/primitives/lexicalSceneDocumentEditor.js`](../src/primitives/lexicalSceneDocumentEditor.js)

## Maintenance Rule

When adding, removing, or changing a navigation shortcut:

1. update the implementation and its focused behavior tests;
2. update this document in the same change;
3. add or update VT coverage when focus or user-visible navigation behavior is
   involved.
