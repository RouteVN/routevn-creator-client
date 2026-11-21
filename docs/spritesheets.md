# Spritesheets

A spritesheet resource is one PNG sheet, a PixiJS atlas describing where each
frame sits in it, and named animations that play those frames. Users make one
from a PNG and JSON exported by a sprite tool, or empty, and fill it with
pictures in the spritesheet editor.

## Data

A spritesheet item stores:

- `fileId`: the PNG sheet. An empty spritesheet has none until its first
  pictures are saved.
- `jsonData`: the PixiJS atlas: `frames` keyed by frame name, and `meta`.
- `animations`: `{ [name]: { frames, fps, loop } }`. `frames` are atlas frame
  indexes, and a frame repeated `n` times is held for `n` ticks.
- `width` and `height`: the default size of a sprite showing it. A scene
  element's own size wins.
- `frameSource`: set when the editor made the sheet. `frames[i].fileId` is the
  picture of atlas frame `i`, so the editor reopens it without cutting the
  sheet. `frameWidth` and `frameHeight` are the largest frame cell.

Route Engine and Route Graphics find animation frame `i` at
`Object.keys(jsonData.frames)[i]`. JavaScript lists integer-like keys such as
`"0"` and `"10"` first, in number order, whatever order they were added in. A
sheet the editor saves therefore never names a frame with a bare number: a
picture named `0.png` is the atlas frame `0.png`, not `0`.

`frameSource` and spritesheets without `fileId` need
`@routevn/creator-model` 1.20.0 (schema 20). Older app versions ask to update
before opening a project that has either.

## Supported files

Creating from a file takes one JSON and the PNG files it uses. The import
reads:

| Format                               | How it is recognized                                                                          |
| ------------------------------------ | --------------------------------------------------------------------------------------------- |
| PixiJS and TexturePacker JSON (Hash) | `frames` is an object keyed by frame name                                                     |
| TexturePacker JSON (Array)           | `frames` is an array with `filename` on each frame                                            |
| Phaser 3, one image                  | `textures[0].frames`                                                                          |
| Phaser 3, several images             | `textures` lists several images; every PNG must be picked, and they are merged into one sheet |
| Aseprite                             | `meta.frameTags`                                                                              |

Rotated frames (stored 90 degrees clockwise) and trimmed frames
(`spriteSourceSize` within `sourceSize`) are read in every format. Aseprite
per-frame durations are not read: every animation starts at 12 FPS.

The animations come from, in order:

1. The JSON's `animations`, keyed by name, listing frame names.
2. Aseprite tags, with `forward`, `reverse`, `pingpong` and `pingpong_reverse`
   directions.
3. The frame names. Frames in a folder are one animation named after the
   folder (`run/0001`, `run/0002` is `run`), unless the folder holds several
   sequences (`hero/walk_01` and `hero/run_01` are `hero/walk` and
   `hero/run`). Other frames group by their name before a trailing number
   (`walk_01.png` and `walk_02.png` are `walk`), in number order. Once a
   sheet has such a sequence, every other frame becomes a one-frame
   animation of its own, so each can still be shown.
4. Otherwise, one `default` animation of every frame, in sheet order.

Editing a spritesheet can replace its PNG, its JSON, or both. A JSON alone
replaces the atlas of a spritesheet that already has a sheet, but a JSON for
several images needs its PNG files, and an empty spritesheet needs the PNG and
JSON together. A JSON for several images may be picked first: the dialog
names the PNG files it needs, keeps the JSON, and does not save until they
are picked. Replacing either file of a sheet the editor made asks first, and
removes its `frameSource`: the editor then cuts the new sheet like any other.

## Spritesheet editor

The editor shows the frames of one animation at a time, with a preview. Users
add pictures (the Add Pictures button, or by dropping them on the frames
list), drag frames into order, set each frame's hold (1–99 ticks), and set the
animation's FPS (1–120). The frame size shown is the largest picture of the
animation shown; it is not editable.

Changes save automatically one second after the last edit, and before leaving
the page. Undo and redo cover the edits made since the page opened.

Opening an existing spritesheet only reads it: an editor-made sheet loads its
`frameSource` pictures, and any other sheet is cut into one picture per atlas
frame, in memory. Nothing is saved until the user changes something. A
frame's name is its picture's file name or atlas key without an image
extension; other dots stay (`walk.001`). An animation's speed is its `fps`,
or `animationSpeed × 60` for animations saved with the older field, or 24
when it has neither.

### What a save writes

- Edits that only use frames already in the sheet (reordering, holds,
  removing a frame from an animation, FPS) save just `animations`. The sheet,
  its atlas, and its files stay as they are, so a spritesheet uploaded as PNG
  and JSON keeps its original files and stays readable by older app versions.
  A removed frame stays in the sheet.
- Adding a picture makes a new sheet:
  - Frames are packed in rows, tallest first, with 2 px of padding. Of the
    row widths it tries, the layout with the shortest longer side wins,
    since the device limit applies to that side. Where a frame sits does not
    change its atlas index.
  - Every frame of an animation gets a cell the size of that animation's
    largest picture, and smaller pictures are centered in it. A frame used by
    animations of different sizes takes the largest cell. A frame no
    animation uses keeps its own size. So each animation keeps its frame
    size, and plays at a scene element's size just as it did before.
  - Animation names, FPS and loop settings are kept. Frames no animation uses
    are kept.
  - New pictures are uploaded once, with the sheet and its thumbnail, and
    recorded in `frameSource`.
- `width` and `height` follow the frames when the import filled them in, that
  is, when they equal the size the frames had before the save. A size the user
  set by hand stays.
- A sheet larger than the device's texture limit, or than 4096 × 4096 pixels
  of canvas, is not saved, and the editor says how large it would be.

## Testing

Unit tests, in `bun run test:unit`:

- `tests/internal/spritesheetAtlas.test.js`: atlas formats and animation
  naming.
- `tests/internal/spritesheetFrames.test.js`: sheet layout, cell sizes,
  frame names, and animations-only saves.
- `tests/internal/spritesheetFramesSave.test.js`: what a save writes, default
  size, and empty spritesheets.
- `tests/services/spritesheetFramesService.test.js`: sheet rendering and
  uploads.
- `tests/spritesheetFramesEditor/`: the editor's state, undo, and preview.
- `tests/spritesheetEditor/`: autosave and leaving the page.

### Format test

```bash
bunx playwright install chromium webkit   # once
bun run test:spritesheet-formats
```

`tests/spritesheets/spritesheetFormats.browser.mjs` runs
`tests/support/spritesheetFormatsHarness.js` in Chromium and WebKit, and CI
runs it on every pull request. Each case draws a sheet and its JSON in the
page, in one of the formats above, with a different picture in every frame.
It then:

1. imports the files with the app's import code and checks the animation
   names;
2. checks that each animation plays the right pictures, in order, reading
   frames as the engine does (`Object.keys(jsonData.frames)[i]`);
3. opens the sheet as the editor does and compares every cut-out frame with
   the picture it was drawn from;
4. reorders two frames and checks the animations-only save;
5. adds a picture, saves a new sheet, and checks every animation again; and
6. reopens the saved sheet from its `frameSource` pictures.

The cases cover TexturePacker Hash with `animations`, TexturePacker Array
named by frame names, rotated frames, trimmed frames, Aseprite tags with each
direction, Phaser 3 with one and several images, frames named with bare
numbers, and animations of different sizes. To cover another format, add a
case to `CASES` in the harness that draws its sheet and lists the frames each
animation should play.

The cases are drawn rather than stored, so the repository holds no
third-party art.

### Real exports

```bash
bun run test:spritesheet-samples
```

`tests/spritesheets/spritesheetSamples.browser.mjs` runs sheets exported by
real sprite tools through the same steps, in Chromium and WebKit. It
downloads public examples from the Phaser and PixiJS example repositories, at
pinned commits, into a temporary folder; set `SPRITESHEET_SAMPLES_DIR` to use
a folder that already holds them. The files are never committed. It needs
network access, so CI does not run it: run it before a release that changes
the import, the editor, or how sheets are saved.

| Files                                                                   | Format                                            |
| ----------------------------------------------------------------------- | ------------------------------------------------- |
| PixiJS `spritesheet/fighter`, `mc`                                      | PixiJS JSON (Hash)                                |
| Phaser `animations/knight`                                              | Phaser 3, one image                               |
| Phaser `animations/seacreatures_json`                                   | TexturePacker Hash, animations of different sizes |
| Phaser `animations/aseprite/paladin`, `paladin-array`, `tank`           | Aseprite Hash and Array, with tags                |
| Phaser `atlas/girl`                                                     | TexturePacker Array                               |
| Phaser `atlas/rotated-atlas`                                            | Rotated frames                                    |
| Phaser `atlas/tp3-multi-atlas` with `tp3-multi-atlas-0.png` to `-3.png` | Phaser 3, several images                          |

A real export has no list of the pictures it should show, so each check
compares the sheet with itself: after each save, every animation must play
the same pictures as it did when imported, and the added picture last. The
test also checks how many frames and animations each import makes, and some
of the animations by name. Pictures may differ by 3 steps of premultiplied
color: WebKit shifts partly transparent pixels by about 2 each time a canvas
draws and saves them, while a wrong frame differs by far more.

### In the app

The tests above run the import and save code, not the pages. After changing
the pages, also try a few of the files above in the app:

1. Create a spritesheet from the PNG and JSON, and play each animation on the
   Spritesheets page.
2. Open it in the spritesheet editor, play each animation, reorder two
   frames, and check that the preview and the Spritesheets page agree.
3. Add a picture, wait for the save, reopen the editor, and play the
   animations again.
4. Show the spritesheet in a scene and check its size.
