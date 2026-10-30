# Asset Package Import

## Purpose

RouteVN Creator imports reusable resources from a strict Asset Package manifest.
The old animation-only and transform-only package formats are not supported.

An Asset Package may contain images, sounds, videos, characters, transforms,
animations, audio effects, particles, spritesheets, colors, fonts, text styles,
layouts, variables, and controls. The creator currently excludes layouts from
its export picker.

## Manifest

The manifest is a partial RouteVN repository:

```json
{
  "schema": "routevn.import-pack.v1",
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
    }
  }
}
```

Only included repository collections are imported. Each collection uses the
normal `{ items, tree }` shape, and folders are regular items with
`type: "folder"`.

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

Scene, section, and line ids are project-owned. Resources containing
`sceneId`, `sectionId`, `lineId`, or their plural forms are rejected until
story content can be packaged and remapped.

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

The creator lets users choose top-level folders. Selecting a folder includes its
complete subtree and preserves folder and item order. Export also includes
transitive resource and file dependencies, even when their source folders were
not explicitly selected.

Import recreates the selected resources' complete package folder ancestry in
the matching project collections, after the project's own folders and
resources, in package order. It does not ask for replacement destination
folders or media substitutions.

Files, folders, and resources are committed in one atomic command batch. A
pre-commit failure discards staged files. If commit confirmation is interrupted,
staged files are retained so a retry can recognize an already committed plan.

## Preview media

Resources may reference package-only preview files through
`previewMediaFileId` and `thumbnailMediaFileId`. Supported preview MIME types
are JPEG, PNG, WebP, MP4, and WebM.

Preview files are fetched lazily through the same bounded client as imported
files. Preview-only fields and files are not persisted in the destination
project unless another retained resource field references the file.

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

## Asset store

Import opens the RouteVN asset store in a large dialog, 32 px from each window
edge and at most 1600 px wide, or full screen in windows up to 768 px wide, under a header that stays in
place with its title and a close button at its right: a sidebar with Search and Asset
types fields, and free packs, newest first, 20 at a time, each card with its
cover, title, summary (at most two lines, ending in an ellipsis when cut, and
left out when the pack has none), creator and total asset count, such as
"50 assets". Search matches pack titles and creator names once
typing pauses for 300 ms. A pack's asset types are the kinds of resources it
holds, such as Images or Sounds, and use the resource types' names. The Asset
types field shows the chosen types; clicking it lists every type, and saving the
choice lists the packs with assets of any of them. Import on a resource page
opens the store with that resource type chosen, such as Images on the Images
page; character sprites and layouts open with no type. Choosing a pack opens its
page: its description, the current
version's release notes under "What's new", with their line breaks, when it has
any, and every asset in the pack, read from its manifest. Assets are grouped as on the resource pages: a group for each
type's own assets and one for each folder, labelled with its path such as
Images > Masks, collapsible, with each asset on a card that shows its name.
Beside them, a pack info panel holds the cover, the summary under it, the
creator, version, release and update dates, and Import, and stays in view
while the page scrolls; narrower windows show the panel above the description.
The page opens at once with what the pack's card carries: title, summary,
cover, creator and release date. The pack's details then replace what the card
showed, adding the description, version, release notes and last update. The
assets come last, once its manifest is
read; Import waits for them. Back while
the page loads cancels its requests. Clicking an asset previews it full screen,
with its whole description, using its full-size preview file when the pack has
one. The pack's creator opens the creator page: avatar, name, bio, profile
links, which open in the system browser, and the creator's packs, newest first,
which load with the profile in one request. Import on a pack page continues with
the import flow below, whose resource choice sits in a centered column up to
1200 px wide, as the pack page does. Back, the square button beside each page's title, steps
from the resource choice to the pack page, keeping the choices made there, from
a pack page to the list or creator page it was opened from, and from the creator
page to the pack page it was opened from, or to the list. The app has no
purchases, so it requests and shows free packs only; the creator page leaves out
the creator's other packs, and a creator with none free shows that they have no
packs yet.

The client calls three JSON-RPC methods at `https://api1.routevn.com/asset-store/rpc`,
with the `X-RouteVN-RPC: 1` header and no credentials:

| Method                        | Params                                                            | Used for                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `assetStore.listAssetPacks`   | `{query, pricingType: "FREE", assetTypes, page: {cursor, limit}}` | Pack cards. Each item carries `data`, with the title, `summary` (one line of 0 to 300 characters, trimmed; `""` when missing or not text), cover, pricing, `assetCounts` and listing date, and its `creator`; `files` maps cover and avatar IDs to URLs. `assetTypes` is `null` or a list of asset types, such as `IMAGES`. `assetCounts` maps each asset type the pack has to its count, such as `{"IMAGES": 30, "SOUNDS": 20}`; types the app does not know and counts that are not positive are left out. |
| `assetStore.getAssetPackById` | `{assetPackId}`                                                   | The pack page's details: the card fields, including `summary`, the rich-text description, the version, its plain-text `releaseNotes` and last update, and `data.package`: `{fileId, size, directoryOffset, directorySize}`, the published package's ZIP (its `files` URL), its byte size, and where its central directory starts and how long it is. The description shows as plain paragraphs and its images, each by its `files` URL.                                                                      |
| `assetStore.getCreatorById`   | `{creatorId}`                                                     | The creator page: the profile and `assetPacks`, up to 100 of the creator's packs, newest first, each with the card fields and no `creator` of its own; `files` maps the avatar and covers to URLs.                                                                                                                                                                                                                                                                                                           |

Development builds call `http://127.0.0.1:3100/asset-store/rpc` instead. Set
`VITE_ROUTEVN_ASSET_STORE_RPC_URL` when starting the watch server to use another
local API. A list that fails to load shows Try Again, and a pack or creator that
is no longer listed shows its own message. Images whose IDs `files` does not
map to a usable URL are left out.

## Reading a published package

The asset store publishes each pack's package as the ZIP its publisher
uploaded, and the app reads it in place: never downloading it whole and never
unpacking it on a server. Every entry is stored (uncompressed); the API refuses
anything else at upload. The app reads:

1. the central directory, the ZIP's table of contents, with one byte range at
   the `directoryOffset` and `directorySize` the API sends;
2. `asset-package.json`, the manifest, as one more range: its local header and
   data;
3. each file it needs, a preview as its card scrolls into view or a file Import
   downloads, as one range per file: the entry named by the file's
   `source.url` without its leading `./`, such as `files/<id>`. A second range
   follows only when an entry's local header is longer than its directory
   record says.

Every request names both ends of its range (`Range: bytes=<start>-<end>`), so a
cross-origin read needs no CORS preflight, and nothing depends on reading the
response's `Content-Range`. A server that answers with the whole file instead
of a 206 range is refused. Size limits and `sha256` checks apply as they do to
files fetched by URL.

## Import flow

1. Choose a pack in the asset store, then read and strictly validate the
   manifest inside its package.
2. Show a selection page when the package contains multiple resources.
3. Keep required dependencies selected and locked.
4. Let the user review and edit each selected resource's name and description.
5. Lazily load the current resource preview.
6. Download and validate only the selected resources' required files.
7. Remap package-local ids.
8. Commit the selected folder trees and resources atomically.

A one-resource package skips the selection page.

## Publisher requirements

Production package URLs from the asset store, and any manifest or file URL,
must use HTTPS. HTTP is accepted only for `localhost`, `127.0.0.1`, and `::1`
testing.

Publishers should:

- return the manifest as `application/json` or a JSON `+json` type
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
- 200 MiB total per import
- 500 resources per collection
- 32 folder-tree levels
- three parallel downloads
- 15-second manifest timeout
- 30-second file timeout

The creator validates the final manifest against importer limits before writing
the ZIP.
