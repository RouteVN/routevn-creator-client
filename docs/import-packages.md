# Asset Package Import

## Purpose

RouteVN Creator imports reusable resources from a strict Asset Package manifest.
The old animation-only and transform-only package formats are not supported.

An Asset Package may contain images, sounds, videos, characters, transforms,
animations, audio effects, particles, spritesheets, colors, fonts, text styles,
layouts, variables, and controls.

## Manifest

The manifest is a partial RouteVN repository:

```json
{
  "schema": "routevn.import-pack.v2",
  "package": {
    "kind": "routevn.creator.asset-package"
  },
  "repository": {
    "files": {
      "items": {
        "file.spark": {
          "id": "file.spark",
          "mimeType": "image/png",
          "source": {
            "url": "./files/file.spark"
          }
        }
      }
    },
    "images": {
      "items": {
        "folder.effects": {
          "id": "folder.effects",
          "type": "folder",
          "name": "Effects"
        },
        "image.spark": {
          "id": "image.spark",
          "type": "image",
          "name": "Spark",
          "fileId": "file.spark"
        }
      },
      "tree": [
        {
          "id": "folder.effects",
          "children": [{ "id": "image.spark" }]
        }
      ]
    },
    "textStyles": {
      "items": {
        "textStyle.title": {
          "id": "textStyle.title",
          "type": "textStyle",
          "name": "Title",
          "fontId": ["font.serif"]
        }
      },
      "tree": [{ "id": "textStyle.title" }]
    }
  },
  "dependencies": {
    "fonts": {
      "items": {
        "font.serif": {
          "id": "font.serif",
          "type": "font",
          "name": "Serif",
          "fileId": "file.serif"
        }
      }
    }
  }
}
```

`repository` holds the resources the pack's author picked. Each collection
uses the normal `{ items, tree }` shape, and folders are regular items with
`type: "folder"`. `dependencies` holds the resources the picks use that the
author did not pick: the same collection keys, each `{ items }` with no tree
and no folders. It is left out when the picks use nothing else.

A resource is in one section only. Every dependency is used by a pick,
directly or through other dependencies, and picks and dependencies may
reference each other. `repository.files` holds the files of both sections.

`links` holds what the resources point to outside the pack, for the importer
to point at their own: the places in the author's story they jump to, such as
a title menu's Start button going to a section, and the layouts their actions
open (`pushOverlay`, `showConfirmDialog`) that the pack does not carry. Each
item is `{ kind, name, sceneName, layoutType }`: `kind` is `section`, `scene`
or `layout`; `name` is its name; a section also gives its scene's name, and a
layout its layout type; each text is at most 200 characters. Fields that jump into the story (`sectionId`,
`sceneId` and their lists), and the `resourceId` of an action that opens such
a layout, hold link keys, such as `"sectionId": "link.oivTjWAhhYG1"`, instead
of the author's ids. A jump to a section leaves out its `sceneId`, as the
section gives the scene; import rejects a section jump that names a scene. A layout the pack carries, because it is picked or
something draws it, is opened as itself. `links` is left out when there are
none.

```json
"links": {
  "items": {
    "link.oivTjWAhhYG1": {
      "kind": "section",
      "name": "Section 1",
      "sceneName": "Title"
    },
    "link.fKr5fa67MQWh": {
      "kind": "layout",
      "name": "Menu Page",
      "layoutType": "general"
    }
  }
}
```

`routevn.import-pack.v1` packages have no `dependencies` or `links`:
everything is in `repository`, and the importer treats every resource as a
pick.

`routevn.import-pack.v3` is v2 with a character's sprite tags. A character,
picked or a dependency, may carry:

- `spriteTags`: the tags of its sprites, as `{ items, tree }`, each tag
  `{ id, type: "tag", name }` with an optional `color`;
- `tagIds` on its sprites, naming those tags;
- `spriteGroups`: its sprite groups, each `{ id, name, tags }`, naming those
  tags.

```json
"character-one": {
  "id": "character-one",
  "type": "character",
  "name": "Character One",
  "sprites": {
    "items": {
      "sprite-happy": {
        "id": "sprite-happy",
        "type": "image",
        "name": "Happy",
        "fileId": "file-sprite-happy",
        "tagIds": ["tag-face"]
      }
    },
    "tree": [{ "id": "sprite-happy", "children": [] }]
  },
  "spriteTags": {
    "items": {
      "tag-face": { "id": "tag-face", "type": "tag", "name": "Face" }
    },
    "tree": [{ "id": "tag-face" }]
  },
  "spriteGroups": [{ "id": "sprite-group-face", "name": "Face", "tags": ["tag-face"] }]
}
```

Import creates the character, then its tags under new ids, then sets the tags
of its sprites and its sprite groups, in the same commit. Sprites and sprite
groups keep their ids, as previews pick a character's sprites by them. A
dependency the importer replaces with one of the project's characters brings
no tags. Every other tag, such as a resource's own `tagIds`, is left out of a
package, and import rejects one that has them.

The creator exports v3 when a character it carries has sprite tags, and v2
otherwise, so a package without them opens in apps that read only v2.

An animation in a package keeps its `thumbnailFileId` and carries no
`thumbnailSourceHash`. App versions on `@routevn/creator-model` before 1.21.0
read these schemas and reject a package whose animation has that field, so the
exporter leaves it out, and the app that imports the animation draws its
thumbnail again. Transforms, particles and layouts keep theirs.

The creator exports only `package.kind`. Catalog metadata such as package id,
name, version, description, publisher, or source may be supplied by a publishing
system, but is not required in a creator-generated manifest.

## IDs and references

Every file, folder, and resource id in the manifest is package-local. The
importer generates project ids and rewrites only schema-defined file and
resource reference fields.

Required resource dependencies must be present. During review, selected
dependencies remain selected and cannot be deselected while a selected resource
requires them. Missing required dependencies reject the package.

Scene, section, and line ids are project-owned. In a v2 package, a scene or
section reference must name one of the package's links, of the same kind, and so may the `resourceId` of a `pushOverlay` or `showConfirmDialog` action naming a layout link; import sets each to the
section, scene or layout the user chose, or removes the action holding it when
the user left the link unset. Other references to scenes or sections, and any
`lineId` or `lineIds`, reject the package.

## Files

File-backed resources reference records in `repository.files.items`.
`source.url` may be absolute or relative to the final manifest URL. Optional
`size` and `sha256` values are validated when supplied.

The creator downloads a ZIP with this layout:

```text
asset-package.json
files/<package-local-file-id>
```

After extraction, the directory can be served directly by a static file server.

Files are fetched with request timeouts, per-file and total byte limits,
content-type checks, and optional SHA-256 verification. They are validated
against the owning resource type before staging.

## Folder trees and dependencies

A project can have several asset packs. They are project resources, in the
`assetPacks` collection: Releases → Asset Packs lists them with folders, like
the other resource pages, and opening one shows its editor. A pack is
`{ type: "assetPack", name, description, resources }`, where `resources` lists,
for each resource type, the folders picked, at any depth, in the order picked.
The model checks every folder id: it must name an existing folder of that
type's collection. A picked folder may be moved, into another folder too, and
stays picked; deleting a picked folder, or a folder holding one, is refused,
and the message names the pack that keeps it. A project that kept one asset
package before packs could be several gets it as its first pack, in a
"Default" folder, the first time Asset Packs opens. Folders that selection
names that the project no longer has are left out, and a selection left with
none only is cleared. When the pack cannot be made, the page says why and
keeps the selection, to try again the next time it opens.

An asset pack's editor has two sections. Picked resources lists only
the folders in the pack, by type, each with every resource in it and in the
folders inside it, with its name; a folder inside another is named with its
path ("Backgrounds > Night"), and a pick inside another pick is listed only
with that one. Folders are added and removed in the picker. Previews are drawn
as on the type's own page: images and thumbnails on the transparency grid,
sound waveforms, font glyphs, text style samples and color swatches, or the
type's icon. Dependencies lists what the picks use (see below). Pick resources
opens a picker that shows one resource type at a time: a list of the types
with resources, each with how many of its folders are picked, and the chosen
type's folders at any depth, in the project's tree order and indented under
the folder they sit in, each with a checkbox and the resources directly in
it, so a resource shows once. The picker offers a folder that holds
resources, in it or in a folder inside it, or that is picked, so it can be
unticked. Clicking anywhere on a folder ticks or unticks it, with everything
inside it. A folder inside a ticked one shows as included: ticked, and not
ticked or unticked on its own. A pick of its own stays, so unticking the
folder it sits in leaves it picked. A type with no
folders says so. The picker opens on the type it showed last, or the first
type with folders. Ticks apply to the page, and are saved, when Done is pressed;
closing the picker otherwise leaves the selection as it was. Done does nothing
more while it saves. A save changes only the types picked differently since
the editor opened the pack or last saved it, so a type someone else changed
meanwhile, and the editor did not, stays as they left it. A failed save says
why in an alert, and the editor goes back to the saved picks.
Picked resources lists the types in the pack's own order, the order of its
`resources`. Each type's heading has a three-dot menu with Move Up and Move
Down, which saves at once and is not offered when the pack has one type. A type
newly picked goes last, and so does one picked again after it was unpicked; a
pack saved before types could be moved keeps its order until one is. The
exported package lists its picked types in this order, and the import review
lists them in it too. Within a type, the page and the pack keep folders in the
order they were picked: a newly ticked folder goes last, and the picker shows
each ticked folder's place, counting a folder included in another only with
it. Resources outside a folder cannot be picked. Export stays disabled until a resource is picked, or while
the selection uses a resource that no longer exists or jumps to a line of the
story; the page names the resource at fault.

Selecting a folder includes its complete subtree and preserves folder and item
order; everything in the chosen folders is a pick. Each picked folder is a
top-level folder of the package, in pick order, even one that sits inside
another folder in the project: the folders it sits in are not carried. A
folder picked inside another pick comes with that pick and is not repeated.
Export adds what the picks use, directly or through each
other, to `dependencies`, without the folders it sits in. A resource in a
chosen folder stays a pick even when another pick uses it, so an author shows
a color or font on the pack page by choosing its folder too. The export page
lists these under Dependencies, laid out as the picks: each type's in one box
of tiles, with the picks that use each in its tooltip. Where the picks, or
what they use, jump into the story, and the layouts they open that the pack
does not carry, become links, listed under Links with the resources that jump
there or open them.

Import recreates the selected resources' complete package folder ancestry in
the matching project collections, after the project's own folders and
resources, in package order. The dependencies the selected picks use come
along: each type's go into one new top-level folder after the pack's own,
named after the pack, and numbered ("Fantasy UI 2") when the project or the
pack already has a top-level folder by that name. A dependency no selected
pick uses is not imported. Import does not ask for replacement destination
folders or media substitutions.

Choose Resources lists, under Dependencies, each dependency the selected
resources bring, with a choice of the project's resources of its type, and for
a layout, of its layout type. Each must be chosen, the pack's own or one of the project's: it starts at
the project's resource of the same name, or else unchosen, and Import is
refused until every one is chosen. A dependency replaced with the project's
resource is not imported: every reference to it points at that resource
instead, and what only it used is left out too. Import checks that each
replacement still exists and is of the dependency's type.

When the selected resources, or the dependencies they bring, use links,
Choose Resources lists each under Links, with the resources that use it and a
choice of the project's sections, scenes or layouts; a layout link offers the
layouts of its layout's type. A link starts at the project's section with the
same section and scene names, or its scene or layout with the same name, and
otherwise unchosen; Import is refused until every one is chosen. Import checks that each choice still exists and, for a layout, has the link's layout type, writes it into every jump or open action through the link, and checks each resource again.

Files, folders, and resources are committed in one atomic command batch. A
pre-commit failure discards staged files. If commit confirmation is interrupted,
staged files are retained so a retry can recognize an already committed plan.

## Preview media

Resources may reference package-only preview files through
`previewMediaFileId` and `thumbnailMediaFileId`. Supported preview MIME types
are JPEG, PNG, WebP, MP4, and WebM.

Preview files are fetched lazily through the same bounded client as imported
files. Preview-only fields and files are not persisted in the destination
project unless another retained resource field references the file. The
previews read for an open pack are capped together at the total download
limit, counted apart from the import: an import counts only the files it
brings in, and uses a file already read for its preview without reading it
again. Leaving a pack without importing it, with Back, by opening another pack
or by closing the store, frees its previews.

Creator-generated previews include:

- animations: one full cycle on a black background, plus a preview-derived
  thumbnail video scaled to fit within 640 by 360
- particles: full-resolution and lower-resolution videos
- spritesheets: one full cycle of the first animation at its configured FPS,
  in full-resolution and lower-resolution videos
- sounds: a 640 by 360 waveform PNG, shown in the asset grid and the resource
  choice list
- fonts: a 1920 by 1080 glyph preview and a 640 by 360 thumbnail
- text styles: a 960 by 270 preview and a 427 by 120 thumbnail
- layouts: a PNG of the layout at the project's resolution, drawn with its
  saved preview data and shown full screen; the asset grid and the resource
  choice list keep the layout's small `thumbnailFileId` image, which is also
  what the full-screen preview shows for a package without this PNG. A layout
  that cannot be drawn, such as one using a file the project no longer has, is
  exported without it, and so are the layouts not yet drawn when the renderer
  cannot start

Generated video MIME type is MP4 or WebM depending on the desktop WebView's
canvas recording support. Generated previews exist only in the exported ZIP.

Still image previews, in the pack page's asset grid, the resource choice list
and full screen, sit on the Images page's transparency grid, so transparent
areas show as checkers rather than black.

Video previews play muted and loop, holding the last frame for half a second
before playing again. In the pack page's asset grid and the
resource choice list, each video shows the frame a third of the way through
and plays from the start only while a mouse is over its card or the card has
keyboard focus; touch devices show the still frame. The full-screen preview
plays at once. A video stops while it is off screen or covered by the
full-screen preview. WebKit, which the macOS and iOS apps use, can stop a
WebM video at its end while still reporting it as playing, without an ended
event, so the player treats a video held on its last frame as ended.

A sound's full-screen preview plays the sound itself instead of its waveform:
its audio file loads like a preview file, and the Sounds page's player, under
a music icon, starts it at once. Clicking the player plays, pauses or seeks
instead of closing the preview; its close button and Escape close it, and the
sound stops when the preview closes. A sound without an MP3, WAV or Ogg audio
file shows its waveform instead.

A color has no preview file; it previews as a swatch of its `#RRGGBB` value,
which the plan already requires of a color, with the value, such as
`#FFD84D`, under its name, on its card and full screen.

## Import sources

A package can come from three places. All three end at the same Choose
Resources page and the same import (see Import flow).

- **Import**, in a resource page's three-dot menu, opens the RouteVN asset
  store (see Asset store).
- **Import from Zip File**, under Import Asset Pack on the Config page, opens the device's file picker for a package ZIP,
  such as one exported from Releases → Asset Packs. Cancelling the picker does
  nothing. The dialog opens saying that it is reading the package, then shows
  Choose Resources. A file that is not a package closes the dialog, and a
  toast says why. Nothing is requested from the network.
- **Import from URL**, under Import Asset Pack on the Config page, opens a form with one field, Pack URL, and Import and
  Cancel. The link may lead to a package ZIP or to a package manifest (see
  Reading a package from a link). Import reads the package and shows Choose
  Resources. A link that is empty, malformed or not HTTPS is refused before
  anything is requested, and a package that cannot be read returns to the
  form; both say why above the field, which keeps what was typed.

The dialog's header names the source: Asset Store, Import from Zip File or
Import from URL. While a package from a file or a link is read, Cancel stops
it: a link returns to its form, and a file closes the dialog. For these two
sources Choose Resources shows the package's name from its manifest, or else
the file's name or the last part of the link, without the extension, and Back
closes the dialog, as there is no pack page to return to. The folders its
dependencies go into are named the same way, where the asset store uses the
pack's title. Closing the dialog, by Back or otherwise, frees what was read.

## Asset store

Import opens the RouteVN asset store in a large dialog, 32 px from each window
edge and at most 1600 px wide, or full screen in windows up to 768 px wide, under a header that stays in
place with its title and a close button at its right: a sidebar with a Search
field, and free packs, newest first, 20 at a time, each card with its
cover, title, summary (at most two lines, ending in an ellipsis when cut, and
left out when the pack has none) and creator. Search matches pack titles and creator names once
typing pauses for 300 ms; closing the store drops a search still waiting. The store has no asset type filter for now: it
lists every pack, whichever page it was opened from. Choosing a pack opens its
page: its description, the current
version's release notes under "What's new", with their line breaks, when it has
any, and every asset in the pack, read from its manifest. Only the author's picks show; dependencies do not. Assets are grouped as on the resource pages: a group for each
type's own assets and one for each folder, labelled with its path such as
Images > Masks, collapsible, with each asset on a card that shows its name.
Beside them, a pack info panel holds the cover, the summary under it, the
creator, version, release and update dates, and Import, and stays in view
while the page scrolls; narrower windows show the panel above the description.
The page opens at once with what the pack's card carries: title, summary,
cover, creator and release date. The pack's details then replace what the card
showed, adding the description, version, release notes and last update. The
assets come last, from the package's manifest, which the details carry; Import
waits for them. Back while
the page loads cancels its requests. Clicking an asset previews it full screen,
with its whole description, using its full-size preview file when the pack has
one. The pack's creator opens the creator page: avatar, name, bio, profile
links, which open in the system browser, and the creator's packs, newest first,
which load with the profile in one request. Import on a pack page continues with
the import flow below, whose resource choice sits in a centered column up to
1200 px wide, as the pack page does. Back, the square button beside each page's title, steps
from the resource choice to the pack page, keeping the choices made there, from
a pack page to the list or creator page it was opened from, and from the creator
page to the pack page it was opened from, or to the list. A page that no longer
shows what it showed, such as a pack page left with Back or replaced by another
pack opened from the creator page, is skipped, so Back always reaches the list.
Back from a pack page drops the choices made for it, and the pack loads again
when reopened; going to its creator's page and back, or reopening it from
there, keeps them. The app has no
purchases, so it requests and shows free packs only; the creator page leaves out
the creator's other packs, and a creator with none free shows that they have no
packs yet.

The client calls four JSON-RPC methods at `https://api1.routevn.com/asset-store/rpc`,
with the `X-RouteVN-RPC: 1` header and no credentials:

| Method                               | Params                                                            | Used for                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------ | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `assetStore.listAssetPacks`          | `{query, pricingType: "FREE", assetTypes, page: {cursor, limit}}` | Pack cards. Each item carries `data`, with the title, `summary` (one line of 0 to 300 characters, trimmed; `""` when missing or not text), cover, pricing, `assetCounts` and listing date, and its `creator`; `files` maps cover and avatar IDs to URLs. `assetTypes` is `null` or a list of asset types, such as `IMAGES`. `assetCounts` maps each asset type the pack has to its count, such as `{"IMAGES": 30, "SOUNDS": 20}`; types the app does not know and counts that are not positive are left out.                                                                        |
| `assetStore.getAssetPackById`        | `{assetPackId, device}`                                           | The pack page's details: the card fields, including `summary`, the rich-text description, the version, its plain-text `releaseNotes` and last update; `manifest`, the package's `asset-package.json`; and `mediaFiles`, `[{id, url}]`, a public URL for each of the package's image, audio and video files, by its ID in the manifest. The description shows as plain paragraphs and its images, each by its `files` URL; a malformed block is left out. The answer may be up to 4 MiB. It also carries `data.package` for older versions of the app, which this one does not read. |
| `assetStore.getAssetPackDownloadUrl` | `{assetPackId, device}`                                           | Import: `downloadUrl`, a signed URL of the package's ZIP that allows byte ranges and stops working at `expiresAt`; `size`, its byte size; `directoryOffset` and `directorySize`, where its central directory starts and how long it is; and `versionName`.                                                                                                                                                                                                                                                                                                                          |
| `assetStore.getCreatorById`          | `{creatorId}`                                                     | The creator page: the profile and `assetPacks`, up to 100 of the creator's packs, newest first, each with the card fields and no `creator` of its own; `files` maps the avatar and covers to URLs.                                                                                                                                                                                                                                                                                                                                                                                  |

A read that carries `device` counts, and one without it counts nothing; the
API answers the same either way. Opening a pack's page sends `device` with its
`assetStore.getAssetPackById` read, which counts one view of the pack. Starting
an import, once the chosen resources pass their checks, sends `device` with
`assetStore.getAssetPackDownloadUrl`, which counts one download, however many
of the pack's files the import reads; each import started is one download. The
import reads the package from the URL it answers, so it waits for it, and a
failed one stops the import with a message. The pack list, creator pages and a
fresh package URL during an import leave `device` out, and so does showing a
pack page again without reading the pack, such as reopening it from its
creator's page. `device` says what the view or download was made on:

| Field        | Value                                                                                                                                                                  |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`         | The app's device ID, the one update checks send, kept in the app database (see [Client updates](client-updates.md#device-metadata)); the web app keeps one in its own. |
| `language`   | The device's first preferred language, by the update checks' rule; `unknown` when it can't be read.                                                                    |
| `uiLanguage` | The app's active language.                                                                                                                                             |
| `os`         | `android`, `ios`, `windows`, `macos` or `linux`, from the web view's user agent. An iPad that asks for desktop sites is `ios`.                                         |
| `formFactor` | `phone`, `tablet` or `desktop`: the desktop app is always `desktop`; elsewhere it comes from the user agent.                                                           |
| `client`     | `web` in a browser, `desktopApp` in the desktop app, `mobileApp` in the Android and iOS apps.                                                                          |
| `channel`    | Where the installed app came from: `direct`, `steam`, `google-play`, `app-store` or `galaxy-store`. The web app sends none.                                            |
| `app`        | `routevn-creator`.                                                                                                                                                     |
| `appVersion` | The app's version, such as `1.22.1`.                                                                                                                                   |

A fact that can't be read is left out. When the device ID can't be read, the
read goes out without `device`, and the page or the import goes on as usual. Neither sends `source`: nothing outside the app leads to a pack's
page.

Development builds call `http://127.0.0.1:3100/asset-store/rpc` instead. Set
`VITE_ROUTEVN_ASSET_STORE_RPC_URL` when starting the watch server to use another
local API. A list that fails to load shows Try Again, and a pack or creator that
is no longer listed shows its own message. Images whose IDs `files` does not
map to a usable URL are left out.

## Reading a published package

The asset store publishes each pack's package as the ZIP its publisher
uploaded. A pack page reads nothing from it: the pack's details carry its
manifest and a public URL for each image, audio and video file, and a preview
fetches its file whole from that URL as its card scrolls into view or its asset
opens full screen. Import reads the ZIP in place, never downloading it whole,
from the signed URL `assetStore.getAssetPackDownloadUrl` answers. Every entry
is stored (uncompressed); the API refuses anything else at upload. Import
reads:

1. the central directory, the ZIP's table of contents, with one byte range at
   the `directoryOffset` and `directorySize` the API sends;
2. `asset-package.json`, the manifest, as one more range: its local header and
   data. It must be the manifest the pack page showed; otherwise the pack was
   updated since, and the import stops and asks to open the pack again;
3. each file it needs that a preview has not already fetched, as one range per
   file: the entry named by the file's `source.url` without its leading `./`,
   such as `files/<id>`. A second range follows only when an entry's local
   header is longer than its directory record says.

A signed URL stops working at `expiresAt`. Import asks for a fresh one, without
`device`, 30 seconds before then, and when the server refuses the URL it has.
It takes a URL to last at least one minute and at most ten, whatever the
device's clock says of `expiresAt`. A fresh URL must name a package of the same
size and directory place, or the import stops as when the manifest differs.

Every request names both ends of its range (`Range: bytes=<start>-<end>`), so a
cross-origin read needs no CORS preflight, and nothing depends on reading the
response's `Content-Range`. A server that answers with the whole file instead
of a 206 range is refused. Size limits and `sha256` checks apply as they do to
files fetched by URL.

## Reading a package ZIP file

A package ZIP picked from the device is read in place too, a slice of the file
at a time, so a large package is never held in memory whole. The app has no
directory location for it, so it first reads the ZIP's end record, which is in
the file's last 65,557 bytes (the 22-byte record and the longest comment a ZIP
can carry), and takes the central directory's offset and size from it. Those
last bytes are kept, as they usually hold the directory too. The manifest and
each file are then entries, read as from a published package, with the same
size limits and `sha256` checks.

The ZIP must be laid out as the app exports it: `asset-package.json` and
`files/<id>` at its top level, every entry stored (uncompressed). A ZIP that
was unpacked and compressed again, a ZIP64 archive, a ZIP split over several
disks and a ZIP with other data before its first entry are refused as not
readable.

## Reading a package from a link

A link typed in Import from URL may lead to a package ZIP or to a manifest.
The app does not go by how the link is written, as a download link often has
no file extension. It sends one request for the link from its first byte
(`Range: bytes=0-`, which needs no CORS preflight) and looks at how the body
starts:

- A body that starts as a ZIP is a package ZIP.
  - When the server answers with a 206 and the ZIP's size is known, from
    `Content-Range` when the server shows it, and otherwise from
    `Content-Length`, the rest of the body is dropped and the ZIP is read in
    place with byte ranges: its last bytes for the end record and directory,
    as for a ZIP file, then a range for each entry, as for a published
    package.
  - Otherwise the server does not serve ranges, and the body is the whole
    ZIP: the same response is read to its end, within the total download
    limit and five minutes, and its entries are read from memory.
- Anything else is read as a manifest: the link is requested again as JSON,
  and each file's `source.url` resolves against it. A link that returns
  neither, such as a sign-in or sharing page, is refused as not being a
  package.

A ZIP at a link has the same layout requirements as a ZIP file.

## Import flow

1. Choose a pack in the asset store, pick a package ZIP file, or enter a
   package's URL, then read and strictly validate the package's manifest.
2. Show a selection page when the package contains multiple picks.
3. Keep the picks that selected picks use, directly or through dependencies,
   selected and locked; add the dependencies they use without listing them.
4. Let the user review and edit each selected resource's name and description,
   choose the pack's or the project's resource for each dependency the
   selection brings, and choose where each link the selection uses goes.
5. Lazily load the current resource preview.
6. Download and validate only the selected resources' required files.
7. Remap package-local ids.
8. Commit the selected folder trees and resources atomically.

A package with one pick skips the selection page.

## Publisher requirements

Production package URLs from the asset store, a link entered in Import from
URL, and any manifest or file URL, must use HTTPS. HTTP is accepted only for
`localhost`, `127.0.0.1`, and `::1` testing.

Publishers should:

- return the manifest as `application/json` or a JSON `+json` type
- serve a package ZIP with byte ranges and a `Content-Length`, so the app
  reads only what it needs instead of downloading the ZIP whole
- enable CORS for supported RouteVN Creator origins
- avoid third-party-cookie requirements
- use public or package-scoped signed URLs for protected packages
- keep signed URLs valid long enough for review and download
- return a compatible content type for every file

Packaged Tauri builds allow HTTPS network and preview media requests through
their configured CSP.

## Limits and validation

The importer treats every package as untrusted input. It rejects unsupported
schema or package kinds, unknown repository roots or fields, malformed trees,
duplicate or missing items, invalid ids, dangling dependencies, project-only
references, mismatched media types, and packages with no resources.

Current limits are:

- 2 MiB per manifest
- 4 MiB per package central directory
- 2,000 package files
- 50 MiB per file
- 200 MiB total per import, counting the files it brings in
- 200 MiB for a package ZIP downloaded whole from a link whose server does not
  serve byte ranges, within five minutes
- 200 MiB of previews per open pack
- 500 resources per type, picks and dependencies together
- 32 folder-tree levels
- three parallel downloads
- 15-second manifest timeout
- 30-second file timeout

The creator validates the final manifest against importer limits before writing
the ZIP.
